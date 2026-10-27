import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { one } from "@/db/rows";
import { brands, locations, offers, user } from "@/db/schema";
import { getBrandPage, getModerationQueues, listOffers } from "@/lib/data";
import * as m from "@/lib/mutations";
import { importBrandLocations } from "@/lib/osm";
import { seedOffers } from "@/lib/seed";
import { SEED_OFFERS } from "../data/seed-offers";
import { freshDb, hasTestDb, makeUser } from "./helpers";

describe.skipIf(!hasTestDb)("database", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
    await seedOffers(db, SEED_OFFERS);
  });
  afterAll(async () => db?.$client.end());

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
    const res = await m.createSubmission(db, u, {
      newBrand: { name: "Corner Bakery", kind: "local", category: "dessert", address: "1 Queen St", lat: 43.65, lng: -79.38 },
      offer: offerInput,
    });
    expect(res.brandSlug).toBe("corner-bakery");
    const page = await getBrandPage(db, "corner-bakery");
    expect(page?.locations).toHaveLength(1);
    expect(page?.offers[0]?.sharedBy).toBe("User 1");

    // A second brand with the same name gets a distinct slug.
    const again = await m.createSubmission(db, u, { newBrand: { name: "Corner Bakery", kind: "online", category: "dessert", address: null }, offer: offerInput });
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
    const queues = await getModerationQueues(db, new Date("2026-10-27T00:00:00Z"));
    expect(queues.unverified.some((x) => x.id === o.id)).toBe(false);
    expect(queues.stale.some((x) => x.id === o.id)).toBe(true);

    await m.hideOffer(db, mod, o.id);
    expect(await listOffers(db, { q: "sephora" })).toHaveLength(0);
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
    expect(await importBrandLocations(db, brand.id, elements)).toBe(2);

    const reporter = await makeUser(db);
    const mod = await makeUser(db, "moderator");
    const loc = one(await db.select().from(locations).where(eq(locations.osmId, "node/101")));
    await m.reportLocation(db, reporter, loc.id, "closed", null);
    await m.reportLocation(db, reporter, loc.id, "closed", null); // duplicate report is ignored
    const { reports } = await getModerationQueues(db);
    expect(reports.filter((r) => r.locationId === loc.id)).toHaveLength(1);
    await m.resolveReport(db, mod, reports.find((r) => r.locationId === loc.id)!.id, true);

    expect(await importBrandLocations(db, brand.id, elements)).toBe(0);
    const still = one(await db.select().from(locations).where(eq(locations.id, loc.id)));
    expect(still).toMatchObject({ hidden: true, hiddenReason: "closed" });
    const page = await getBrandPage(db, "tim-hortons");
    const timmies = one(await listOffers(db, { q: "tim hortons" }));
    expect(page?.locations).toHaveLength(2);
    expect(timmies.locationCount).toBe(1);
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
