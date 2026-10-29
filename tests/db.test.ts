import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { one } from "@/db/rows";
import type * as DbModule from "@/db";
import { brands, locationReports, locations, offers, user } from "@/db/schema";
import {
  getBrandPage, getLocationAdmin, getModerationCounts, listBrandBranches, listLocationBrands, listOffers, listOpenReports, listStaleOffers,
  listUnverifiedOffers,
} from "@/lib/data";
import * as m from "@/lib/mutations";
import type * as SessionModule from "@/lib/session";
import type * as NominatimModule from "@/lib/nominatim";
import type { Place } from "@/lib/nominatim";
import type * as OsmModule from "@/lib/osm";
import { importAll, importBrandLocations, type OsmStore, type OverpassElement } from "@/lib/osm";
import { seedOffers } from "@/lib/seed";
import { SEED_OFFERS } from "../data/seed-offers";
import { freshDb, hasTestDb, makeUser } from "./helpers";

// The server actions run against the test database, with the signed-in user and Nominatim lookups faked.
const fake = vi.hoisted(() => ({
  db: null as Db | null,
  user: null as { id: string; name: string; email: string; role: "user" | "moderator" | "admin" } | null,
  places: new Map<string, Place>(),
  // OpenStreetMap stores by brand name (lowercase) for the faked Overpass preview; "fail" makes it throw.
  osm: new Map<string, OsmStore[] | "fail">(),
  osmCalls: [] as string[],
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof DbModule>()),
  db: new Proxy({}, { get: (_, prop) => Reflect.get(fake.db!, prop, fake.db) }),
}));
vi.mock("@/lib/session", async (importOriginal) => {
  const real = await importOriginal<typeof SessionModule>();
  return {
    ...real,
    requireUser: async (min: "user" | "moderator" | "admin" = "user") => {
      if (!fake.user) throw new real.AuthError("unauthorized");
      if (!real.hasRole(fake.user, min)) throw new real.AuthError("forbidden");
      return fake.user;
    },
  };
});
vi.mock("@/lib/osm", async (importOriginal) => ({
  ...(await importOriginal<typeof OsmModule>()),
  previewBrandStores: async (name: string) => {
    fake.osmCalls.push(name);
    const stores = fake.osm.get(name.toLowerCase()) ?? [];
    if (stores === "fail") throw new Error("Overpass 504");
    return { osmName: stores[0]?.brand ?? null, stores };
  },
}));
vi.mock("@/lib/nominatim", async (importOriginal) => ({
  ...(await importOriginal<typeof NominatimModule>()),
  lookupPlace: async (ref: string) => fake.places.get(ref) ?? null,
}));

describe.skipIf(!hasTestDb)("database", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
    fake.db = db;
    await seedOffers(db, SEED_OFFERS);
  });
  afterAll(async () => db?.$client.end());

  // A geocoding result as the server's Nominatim lookup returns it (Nominatim isn't reachable from the dev sandbox).
  const place = (over: Partial<Place> = {}): Place => ({ ref: "N1", lat: 43.65, lng: -79.38, name: null, address: "1 Queen St, Toronto", label: "1 Queen St", ...over });
  const brandBySlug = async (slug: string) => one(await db.select().from(brands).where(eq(brands.slug, slug)));
  const brandLocations = async (brandId: number) => db.select().from(locations).where(eq(locations.brandId, brandId)).orderBy(locations.id);

  const offerInput = { title: "Free cupcake", titleZh: null, details: "", detailsZh: null, conditions: "", window: "day" as const, windowNote: null, membershipRequired: false, officialUrl: "https://example.com" };

  it("seeds every offer as unverified, and re-seeding adds nothing", async () => {
    const all = await listOffers(db);
    expect(all).toHaveLength(SEED_OFFERS.length);
    expect(all.every((o) => o.verifiedAt === null)).toBe(true);
    expect(await seedOffers(db, SEED_OFFERS)).toBe(0);
  });

  it("filters by category, window, membership and search (including Chinese titles)", async () => {
    expect((await listOffers(db, { category: "beauty" })).every((o) => o.category === "beauty")).toBe(true);
    expect((await listOffers(db, { window: "month" })).every((o) => o.window === "month")).toBe(true);
    expect((await listOffers(db, { noMembership: true })).every((o) => !o.membershipRequired)).toBe(true);
    expect((await listOffers(db, { q: "starbucks" })).map((o) => o.brandName)).toEqual(["Starbucks"]);
    expect((await listOffers(db, { q: "霜淇淋" })).map((o) => o.brandName)).toEqual(["MILK (Queen St W)"]);
    expect(await listOffers(db, { q: "%" })).toHaveLength(0);
  });

  it("creates a new local brand with its location, and enforces the daily limit", async () => {
    const u = await makeUser(db);
    const res = await m.createSubmission(
      db,
      u,
      { newBrand: { name: "Corner Bakery", kind: "local", category: "dessert", useOsmStores: false }, branchRef: "N1", offer: offerInput },
      { branch: place({ address: "1 Queen St" }) },
    );
    expect(res.brandSlug).toBe("corner-bakery");
    const page = await getBrandPage(db, "corner-bakery");
    expect(page?.locations).toHaveLength(1);
    expect(page?.locations[0]).toMatchObject({ name: "Corner Bakery", address: "1 Queen St", source: "manual", osmId: null, createdBy: u.id });
    expect(page?.offers[0]?.sharedBy).toBe("User 1");

    // A second brand with the same name gets a distinct slug.
    const again = await m.createSubmission(db, u, { newBrand: { name: "Corner Bakery", kind: "online", category: "dessert", useOsmStores: false }, offer: offerInput });
    expect(again.brandSlug).toBe("corner-bakery-2");

    const brand = one(await db.select().from(brands).where(eq(brands.slug, "starbucks")));
    for (let i = 2; i < m.DAILY_SUBMISSION_LIMIT; i++) await m.createSubmission(db, u, { brandId: brand.id, offer: offerInput });
    await expect(m.createSubmission(db, u, { brandId: brand.id, offer: offerInput })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("keeps one vote per user and lets them change it", async () => {
    const [a, b] = [await makeUser(db), await makeUser(db)];
    const { id } = one(await listOffers(db, { q: "chipotle" }));
    await m.castVote(db, a, id, "valid");
    await m.castVote(db, b, id, "valid");
    await m.castVote(db, a, id, "expired");
    const o = one(await listOffers(db, { q: "chipotle" }));
    expect([o.validVotes, o.expiredVotes]).toEqual([1, 1]);
  });

  it("verifies, decays into the re-check queue, and hides", async () => {
    const mod = await makeUser(db, "moderator");
    const o = one(await listOffers(db, { q: "sephora" }));
    await m.verifyOffer(db, mod, o.id, new Date("2026-01-01T00:00:00Z"));
    const now = new Date("2026-10-27T00:00:00Z");
    expect((await listUnverifiedOffers(db)).some((x) => x.id === o.id)).toBe(false);
    expect((await listStaleOffers(db, now)).some((x) => x.id === o.id)).toBe(true);

    await m.hideOffer(db, mod, o.id);
    expect(await listOffers(db, { q: "sephora" })).toHaveLength(0);
  });

  it("counts each admin tab exactly as many items as its list shows", async () => {
    const now = new Date("2026-10-27T00:00:00Z");
    const [mod, reporter] = [await makeUser(db, "moderator"), await makeUser(db)];
    const old = one(await listOffers(db, { q: "booster" }));
    await m.verifyOffer(db, mod, old.id, new Date("2025-01-01T00:00:00Z"));
    const loc = one(await db.insert(locations).values({ brandId: old.brandId, lat: 43.65, lng: -79.38, source: "manual" }).returning());
    await m.reportLocation(db, reporter, loc.id, "closed", null);

    const counts = await getModerationCounts(db, now);
    expect(counts).toEqual({
      queue: (await listUnverifiedOffers(db)).length,
      stale: (await listStaleOffers(db, now)).length,
      reports: (await listOpenReports(db)).length,
      locations: (await listLocationBrands(db)).filter((b) => b.missing).length,
    });
    expect(counts.queue).toBeGreaterThan(0);
    expect(counts.stale).toBeGreaterThan(0);
    expect(counts.reports).toBeGreaterThan(0);
    expect(counts.locations).toBeGreaterThan(0);
  });

  it("merges duplicates and carries votes over without double counting", async () => {
    const mod = await makeUser(db, "moderator");
    const [voter1, voter2] = [await makeUser(db), await makeUser(db)];
    const target = one(await listOffers(db, { q: "booster" }));
    const dup = await m.createSubmission(db, voter1, { brandId: target.brandId, offer: { ...offerInput, title: "Free smoothie dup" } });
    await m.castVote(db, voter1, dup.offerId, "valid");
    await m.castVote(db, voter2, dup.offerId, "valid");
    await m.castVote(db, voter2, target.id, "expired");

    await m.mergeOffer(db, mod, dup.offerId, target.id);
    const after = one(await listOffers(db, { q: "booster" }));
    expect(after.id).toBe(target.id);
    expect([after.validVotes, after.expiredVotes]).toEqual([1, 1]);
    const merged = one(await db.select().from(offers).where(eq(offers.id, dup.offerId)));
    expect(merged).toMatchObject({ state: "merged", mergedIntoId: target.id });
    await expect(m.mergeOffer(db, mod, target.id, target.id)).rejects.toMatchObject({ code: "invalid" });
  });

  it("imports OSM stores idempotently and never un-hides a reported store", async () => {
    const brand = one(await db.select().from(brands).where(eq(brands.slug, "tim-hortons")));
    const elements = [
      { type: "node" as const, id: 101, lat: 43.66, lon: -79.39, tags: { name: "Tim Hortons" } },
      { type: "node" as const, id: 102, lat: 43.67, lon: -79.4 },
    ];
    expect(await importBrandLocations(db, brand.id, elements)).toEqual({ found: 2, added: 2, updated: 0 });

    const reporter = await makeUser(db);
    const mod = await makeUser(db, "moderator");
    const loc = one(await db.select().from(locations).where(eq(locations.osmId, "node/101")));
    await m.reportLocation(db, reporter, loc.id, "closed", null);
    await m.reportLocation(db, reporter, loc.id, "closed", null); // duplicate report is ignored
    const reports = await listOpenReports(db);
    expect(reports.filter((r) => r.locationId === loc.id)).toHaveLength(1);
    await m.resolveReport(db, mod, reports.find((r) => r.locationId === loc.id)!.id, true);

    expect(await importBrandLocations(db, brand.id, elements)).toEqual({ found: 2, added: 0, updated: 0 });
    const still = one(await db.select().from(locations).where(eq(locations.id, loc.id)));
    expect(still).toMatchObject({ hidden: true, hiddenReason: "closed" });
    const page = await getBrandPage(db, "tim-hortons");
    const timmies = one(await listOffers(db, { q: "tim hortons" }));
    expect(page?.locations).toHaveLength(2);
    expect(timmies.locationCount).toBe(1);
  });

  it("lets any user add a missing store, but not one already on the map or removed by a moderator", async () => {
    const [u, mod] = [await makeUser(db), await makeUser(db, "moderator")];
    const brand = await brandBySlug("dennys");
    const id = await m.addBranch(db, u, brand.id, place({ lat: 43.7, lng: -79.4 }));
    expect(one(await db.select().from(locations).where(eq(locations.id, id)))).toMatchObject({ source: "manual", osmId: null, createdBy: u.id, hidden: false });
    expect((await listBrandBranches(db, brand.id)).map((b) => b.id)).toContain(id);

    // ~11 m away: the same store.
    await expect(m.addBranch(db, u, brand.id, place({ lat: 43.7001, lng: -79.4 }))).rejects.toMatchObject({ code: "duplicate" });

    await importBrandLocations(db, brand.id, [{ type: "node", id: 9001, lat: 43.71, lon: -79.41 }]);
    const osmRow = one(await db.select().from(locations).where(eq(locations.osmId, "node/9001")));
    expect(await m.removeLocation(db, mod, osmRow.id, "closed")).toBe("hidden");
    await expect(m.addBranch(db, u, brand.id, place({ lat: 43.71, lng: -79.41 }))).rejects.toMatchObject({ code: "removed" });

    const web = one(await db.insert(brands).values({ slug: "web-only", name: "Web Only", kind: "online", category: "other" }).returning());
    await expect(m.addBranch(db, u, web.id, place())).rejects.toMatchObject({ code: "invalid" });
    await expect(m.addBranch(db, u, 999_999, place())).rejects.toMatchObject({ code: "not_found" });
  });

  it("caps added stores at 30 a day per user, separately from the offer limit", async () => {
    const [u, other] = [await makeUser(db), await makeUser(db)];
    const brand = await brandBySlug("harveys");
    for (let i = 0; i < m.DAILY_BRANCH_LIMIT; i++) await m.addBranch(db, u, brand.id, place({ lat: 43.5 + i * 0.001, lng: -79.6 }));
    await expect(m.addBranch(db, u, brand.id, place({ lat: 43.9, lng: -79.6 }))).rejects.toMatchObject({ code: "rate_limited" });
    await m.addBranch(db, other, brand.id, place({ lat: 43.9, lng: -79.6 }));
    await m.createSubmission(db, u, { brandId: brand.id, offer: offerInput });
  });

  it("imports a new chain's OpenStreetMap stores only when the user confirmed them", async () => {
    const u = await makeUser(db);
    const stores = [
      { osmId: "node/8001", lat: 43.66, lng: -79.39, name: "Bubble Co", address: "1 Bay St, Toronto", brand: "Bubble Co" },
      { osmId: "node/8002", lat: 43.68, lng: -79.41, name: "Bubble Co", address: null, brand: "Bubble Co" },
    ];
    const newBrand = { name: "bubble co", kind: "chain" as const, category: "drink" as const };
    const confirmed = await m.createSubmission(db, u, { newBrand: { ...newBrand, useOsmStores: true }, offer: offerInput }, { osm: { osmName: "Bubble Co", stores } });
    const brand = await brandBySlug(confirmed.brandSlug);
    expect(brand.osmName).toBe("Bubble Co");
    expect((await brandLocations(brand.id)).map((l) => [l.osmId, l.source, l.createdBy])).toEqual([["node/8001", "osm", null], ["node/8002", "osm", null]]);

    const declined = await m.createSubmission(db, u, { newBrand: { ...newBrand, name: "Bubble Two", useOsmStores: false }, offer: offerInput }, { osm: { osmName: "Bubble Co", stores } });
    const brand2 = await brandBySlug(declined.brandSlug);
    expect(brand2.osmName).toBeNull();
    expect(await brandLocations(brand2.id)).toHaveLength(0);
  });

  it("lets moderators add, move, delete, hide and unhide stores", async () => {
    const [mod, reporter] = [await makeUser(db, "moderator"), await makeUser(db)];
    const brand = await brandBySlug("boston-pizza");
    const id = await m.addLocation(db, mod, brand.id, { lat: 43.8, lng: -79.5, name: null, address: "9 Main St" });
    await m.updateLocation(db, mod, id, { lat: 43.801, lng: -79.501, name: "Boston Pizza Main", address: "9 Main St" });
    expect(one(await db.select().from(locations).where(eq(locations.id, id)))).toMatchObject({ lat: 43.801, lng: -79.501, name: "Boston Pizza Main", source: "manual", createdBy: mod.id });

    // A manual store nobody reported is deleted for good.
    expect(await m.removeLocation(db, mod, id, null)).toBe("deleted");
    expect(await db.select().from(locations).where(eq(locations.id, id))).toHaveLength(0);

    // OSM stores are hidden (with a reason) so a re-import can't bring them back.
    const elements: OverpassElement[] = [{ type: "node", id: 7001, lat: 43.81, lon: -79.51, tags: { name: "Boston Pizza" } }];
    await importBrandLocations(db, brand.id, elements);
    const osmRow = one(await db.select().from(locations).where(eq(locations.osmId, "node/7001")));
    await expect(m.removeLocation(db, mod, osmRow.id, null)).rejects.toMatchObject({ code: "invalid" });
    expect(await m.removeLocation(db, mod, osmRow.id, "closed")).toBe("hidden");
    expect(await importBrandLocations(db, brand.id, elements)).toEqual({ found: 1, added: 0, updated: 0 });
    expect(await brandLocations(brand.id)).toEqual([expect.objectContaining({ id: osmRow.id, hidden: true, hiddenReason: "closed" })]);
    await m.unhideLocation(db, mod, osmRow.id);
    expect(one(await db.select().from(locations).where(eq(locations.id, osmRow.id)))).toMatchObject({ hidden: false, hiddenReason: null });

    // A moderator's fix to an OSM store survives re-imports.
    await m.updateLocation(db, mod, osmRow.id, { lat: 43.8105, lng: -79.5105, name: "Boston Pizza (fixed)", address: null });
    await importBrandLocations(db, brand.id, elements);
    expect(one(await db.select().from(locations).where(eq(locations.id, osmRow.id)))).toMatchObject({ lat: 43.8105, name: "Boston Pizza (fixed)" });

    // A reported manual store is hidden, keeping its reports.
    const reported = await m.addLocation(db, mod, brand.id, { lat: 43.82, lng: -79.52, name: null, address: null });
    await m.reportLocation(db, reporter, reported, "wrong_location", null);
    expect(await m.removeLocation(db, mod, reported, "wrong_location")).toBe("hidden");
    expect(await db.select().from(locationReports).where(eq(locationReports.locationId, reported))).toHaveLength(1);

    const admin = await getLocationAdmin(db, "boston-pizza");
    expect(admin?.locations.find((l) => l.id === reported)).toMatchObject({ hidden: true, reports: 1, createdBy: expect.any(String) });
    await expect(m.updateLocation(db, mod, 999_999, { lat: 43.8, lng: -79.5, name: null, address: null })).rejects.toMatchObject({ code: "not_found" });
  });

  it("re-imports adopt a nearby manual store in place, once, and never add duplicates", async () => {
    const [u, mod, reporter] = [await makeUser(db), await makeUser(db, "moderator"), await makeUser(db)];
    const brand = await brandBySlug("red-robin");
    const offersBefore = (await db.select().from(offers).where(eq(offers.brandId, brand.id))).length;

    const a = await m.addBranch(db, u, brand.id, place({ lat: 43.75, lng: -79.3, address: "user typed address" }));
    await m.reportLocation(db, reporter, a, "not_participating", null);
    const b = await m.addLocation(db, mod, brand.id, { lat: 43.7503, lng: -79.3, name: null, address: null }); // ~33 m north of a
    const hidden = one(await db.insert(locations).values({ brandId: brand.id, lat: 43.76, lng: -79.3, source: "manual", hidden: true, hiddenReason: "closed" }).returning());
    const far = await m.addLocation(db, mod, brand.id, { lat: 43.77, lng: -79.3, name: null, address: null });

    const elements: OverpassElement[] = [
      { type: "node", id: 6001, lat: 43.74992, lon: -79.3, tags: { name: "Red Robin", "addr:housenumber": "5", "addr:street": "Yonge St", "addr:city": "Toronto" } }, // ~9 m from a
      { type: "node", id: 6002, lat: 43.75026, lon: -79.3, tags: { name: "Red Robin North" } }, // ~4 m from b, ~29 m from a
      { type: "node", id: 6003, lat: 43.76002, lon: -79.3 }, // next to the hidden row: not adopted
      { type: "way", id: 6004, center: { lat: 43.7706, lon: -79.3 } }, // ~67 m from far: a different store
    ];
    expect(await importBrandLocations(db, brand.id, elements)).toEqual({ found: 4, added: 2, updated: 2 });

    const rows = await brandLocations(brand.id);
    const byId = (id: number) => one(rows.filter((r) => r.id === id));
    expect(byId(a)).toMatchObject({ osmId: "node/6001", source: "osm", lat: 43.74992, name: "Red Robin", address: "5 Yonge St, Toronto", createdBy: u.id });
    expect(byId(b)).toMatchObject({ osmId: "node/6002", source: "osm", lat: 43.75026, name: "Red Robin North", address: null });
    expect(byId(hidden.id)).toMatchObject({ osmId: null, hidden: true });
    expect(byId(far)).toMatchObject({ osmId: null, source: "manual", lat: 43.77 });
    expect(rows).toHaveLength(6);
    // Same row, so its report and the brand's offers are untouched.
    expect(await db.select().from(locationReports).where(eq(locationReports.locationId, a))).toHaveLength(1);
    expect(await db.select().from(offers).where(eq(offers.brandId, brand.id))).toHaveLength(offersBefore);

    expect(await importBrandLocations(db, brand.id, elements)).toEqual({ found: 4, added: 0, updated: 0 });
    expect(await brandLocations(brand.id)).toHaveLength(6);
  });

  it("imports every brand with an OSM name, falling back from wikidata, and re-running adds nothing", async () => {
    const brand = await brandBySlug("swiss-chalet");
    await db.update(brands).set({ osmWikidata: "Q0" }).where(eq(brands.id, brand.id));
    const fetchImpl: typeof fetch = async (_url, init) => {
      const q = new URLSearchParams(String(init?.body)).get("data")!;
      const elements = q.includes('["brand"="Swiss Chalet"]') ? [{ type: "node", id: 5001, lat: 43.7, lon: -79.45 }, { type: "node", id: 5002, lat: 43.71, lon: -79.46 }] : [];
      return new Response(JSON.stringify({ elements }), { status: 200 });
    };
    const lines: string[] = [];
    const first = await importAll(db, fetchImpl, (l) => void lines.push(l), async () => {});
    expect(first).toMatchObject({ added: 2, updated: 0 });
    expect(lines).toContain("✓ Swiss Chalet: 2 found, 2 new, 0 matched to manual locations");
    expect(await importAll(db, fetchImpl, () => {}, async () => {})).toMatchObject({ added: 0, updated: 0 });
    expect(await brandLocations(brand.id)).toHaveLength(2);
  });

  it("checks roles in the location actions and takes coordinates only from the server's lookup", async () => {
    const actions = await import("@/app/actions");
    const brand = await brandBySlug("pizza-pizza");
    const before = (await brandLocations(brand.id)).length;
    fake.places.set("N424242", place({ ref: "N424242", lat: 43.6611, lng: -79.4011, name: "Pizza Pizza", address: "10 College St, Toronto" }));

    fake.user = null;
    expect(await actions.addBranch({ brandId: brand.id, ref: "N424242" })).toMatchObject({ ok: false, error: "unauthorized" });

    const u = await makeUser(db);
    fake.user = { ...u, name: "Regular", email: "regular@example.com" };
    const loc = { lat: 43.7, lng: -79.4, name: "", address: "" };
    expect(await actions.addLocation(brand.id, loc)).toMatchObject({ ok: false, error: "forbidden" });
    expect(await actions.removeLocation({ locationId: 1, reason: "closed" })).toMatchObject({ ok: false, error: "forbidden" });
    expect(await actions.updateLocation(1, loc)).toMatchObject({ ok: false, error: "forbidden" });
    expect(await actions.unhideLocation(1)).toMatchObject({ ok: false, error: "forbidden" });
    expect(await brandLocations(brand.id)).toHaveLength(before);

    // Coordinates sent by the client are ignored; the looked-up place is stored.
    const res = await actions.addBranch({ brandId: brand.id, ref: "N424242", lat: 43.9, lng: -79.9 });
    expect(res).toMatchObject({ ok: true });
    const added = one((await brandLocations(brand.id)).filter((l) => l.createdBy === u.id));
    expect(added).toMatchObject({ lat: 43.6611, lng: -79.4011, name: "Pizza Pizza", address: "10 College St, Toronto", osmId: null });
    expect(await actions.addBranch({ brandId: brand.id, ref: "N1234" })).toMatchObject({ ok: false, error: "not_found" });

    const rawOffer = { title: "Free tea", window: "day", membershipRequired: false, officialUrl: "https://example.com" };
    const submitted = await actions.submitOffer({ newBrand: { name: "Tiny Tea", kind: "local", category: "drink", lat: 43.9, lng: -79.9 }, branchRef: "N424242", offer: rawOffer });
    expect(submitted).toMatchObject({ ok: true });
    expect((await getBrandPage(db, "tiny-tea"))?.locations).toEqual([expect.objectContaining({ lat: 43.6611, name: "Pizza Pizza" })]);

    const mod = await makeUser(db, "moderator");
    fake.user = { ...mod, name: "Mod", email: "mod@example.com" };
    expect(await actions.addLocation(brand.id, { ...loc, lat: 49.28, lng: -123.12 })).toMatchObject({ ok: false, error: "invalid" });
    expect(await actions.addLocation(brand.id, loc)).toMatchObject({ ok: true });
    fake.user = null;
  });

  it("searching a chain with no stores saves what OpenStreetMap lists, once", async () => {
    const actions = await import("@/app/actions");
    const u = await makeUser(db);
    fake.user = { ...u, name: "Searcher", email: "searcher@example.com" };
    const chain = one(await db.insert(brands).values({ slug: "fresh-chain", name: "Fresh Chain", kind: "chain", category: "food" }).returning());
    const store = (id: number, lat: number): OsmStore => ({ osmId: `node/${id}`, lat, lng: -79.4, name: "Fresh Chain", address: `${id} King St, Toronto`, brand: "Fresh Chain" });
    fake.osm.set("fresh chain", [store(4001, 43.65), store(4002, 43.66)]);
    fake.osmCalls.length = 0;

    const first = await actions.findBrandStores(chain.id);
    expect(first).toMatchObject({ ok: true, data: { osm: { found: 2, added: 2, updated: 0 } } });
    expect(first.ok && first.data.stores).toHaveLength(2);
    expect((await brandBySlug("fresh-chain")).osmName).toBe("Fresh Chain");
    expect((await brandLocations(chain.id)).map((l) => [l.osmId, l.source])).toEqual([["node/4001", "osm"], ["node/4002", "osm"]]);

    // Now it has stores: the database answers and OSM isn't asked again.
    const second = await actions.findBrandStores(chain.id);
    expect(second).toMatchObject({ ok: true, data: { osm: null } });
    expect(fake.osmCalls).toEqual(["Fresh Chain"]);
    expect(await brandLocations(chain.id)).toHaveLength(2);

    // OSM down or without the brand: nothing saved, and the user is told so.
    const quiet = one(await db.insert(brands).values({ slug: "quiet-chain", name: "Quiet Chain", kind: "chain", category: "food", osmName: "Quiet" }).returning());
    fake.osm.set("quiet", "fail");
    expect(await actions.findBrandStores(quiet.id)).toMatchObject({ ok: true, data: { stores: [], osm: "unavailable" } });
    fake.osm.set("quiet", []);
    expect(await actions.findBrandStores(quiet.id)).toMatchObject({ ok: true, data: { stores: [], osm: { found: 0, added: 0 } } });
    expect((await brandBySlug("quiet-chain")).osmName).toBe("Quiet"); // an existing OSM name is kept

    fake.user = null;
    expect(await actions.findBrandStores(chain.id)).toMatchObject({ ok: false, error: "unauthorized" });
  });

  it("lets admins change roles but not their own", async () => {
    const admin = await makeUser(db, "admin");
    const target = await makeUser(db);
    expect(await m.setUserRole(db, admin, target.id, "moderator")).toBe(true);
    const row = one(await db.select().from(user).where(eq(user.id, target.id)));
    expect(row.role).toBe("moderator");
    await expect(m.setUserRole(db, admin, admin.id, "user")).rejects.toMatchObject({ code: "invalid" });
  });
});
