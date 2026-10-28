import { and, count, eq, gte, isNull, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { one } from "@/db/rows";
import { brands, locationReports, locations, offers, offerVotes, user, type ReportKind, type Role } from "@/db/schema";
import type { Place } from "./nominatim";
import { importBrandStores, type BrandPreview } from "./osm";
import { distanceKm, slugify } from "./status";
import type { LocationInput, OfferInput, Submission } from "./validation";

export const DAILY_SUBMISSION_LIMIT = 10;
// Branches are counted separately: adding several stores of a chain in one sitting is normal.
export const DAILY_BRANCH_LIMIT = 30;
// A user-added branch this close to one the brand already has is the same store.
export const DUPLICATE_RADIUS_KM = 0.03;

export class MutationError extends Error {
  // duplicate: already on the map; removed: a moderator hid that store.
  constructor(public code: "rate_limited" | "not_found" | "invalid" | "duplicate" | "removed") {
    super(code);
  }
}

type Actor = { id: string; role: Role };

async function uniqueSlug(db: Db, name: string) {
  const base = slugify(name) || "brand";
  for (let i = 1; ; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [hit] = await db.select({ id: brands.id }).from(brands).where(eq(brands.slug, slug));
    if (!hit) return slug;
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

const dayBefore = (now: Date) => new Date(now.getTime() - 24 * 60 * 60 * 1000);

// A branch picked from geocoding results by a regular user (on /submit). `place` comes from the server's own
// Nominatim lookup. Saved as manual without an osm_id: geocoded ids are often a building or mall, not the store,
// and a later OSM import adopts the row if OSM lists the store (see importBrandStores).
async function insertBranch(tx: Tx, actor: Actor, brandId: number, place: Place, now: Date) {
  const { n } = one(
    await tx.select({ n: count() }).from(locations).where(and(eq(locations.createdBy, actor.id), gte(locations.createdAt, dayBefore(now)))),
  );
  if (n >= DAILY_BRANCH_LIMIT) throw new MutationError("rate_limited");
  const nearby = (await tx.select().from(locations).where(eq(locations.brandId, brandId)))
    .filter((l) => distanceKm([l.lat, l.lng], [place.lat, place.lng]) <= DUPLICATE_RADIUS_KM)
    .sort((a, b) => Number(a.hidden) - Number(b.hidden));
  if (nearby[0]) throw new MutationError(nearby[0].hidden ? "removed" : "duplicate");
  const row = one(
    await tx
      .insert(locations)
      .values({ brandId, lat: place.lat, lng: place.lng, name: place.name, address: place.address, source: "manual", createdBy: actor.id })
      .returning({ id: locations.id }),
  );
  return row.id;
}

export async function addBranch(db: Db, actor: Actor, brandId: number, place: Place, now = new Date()) {
  return db.transaction(async (tx) => {
    const [brand] = await tx.select({ kind: brands.kind }).from(brands).where(eq(brands.id, brandId));
    if (!brand) throw new MutationError("not_found");
    if (brand.kind === "online") throw new MutationError("invalid");
    return insertBranch(tx, actor, brandId, place, now);
  });
}

// Resolved by the server action before the transaction (network calls): the picked branch, and for a new chain
// whose OSM stores the user confirmed, those stores.
export type SubmissionExtras = { branch?: Place; osm?: BrandPreview };

export async function createSubmission(db: Db, actor: Actor, input: Submission, extras: SubmissionExtras = {}, now = new Date()) {
  const since = dayBefore(now);
  const { n } = one(
    await db
      .select({ n: count() })
      .from(offers)
      .where(and(eq(offers.createdBy, actor.id), gte(offers.createdAt, since))),
  );
  if (n >= DAILY_SUBMISSION_LIMIT) throw new MutationError("rate_limited");

  return db.transaction(async (tx) => {
    let brandId = input.brandId;
    let brandSlug: string;
    if (input.newBrand) {
      const b = input.newBrand;
      // Only a chain whose previewed stores the user confirmed gets an OSM name (so later imports keep it current).
      const osm = b.kind === "chain" && b.useOsmStores && extras.osm?.stores.length ? extras.osm : null;
      const created = one(
        await tx
          .insert(brands)
          .values({
            slug: await uniqueSlug(tx as unknown as Db, b.name),
            name: b.name,
            kind: b.kind,
            category: b.category,
            website: b.website ?? null,
            osmName: osm?.osmName ?? null,
            createdBy: actor.id,
          })
          .returning(),
      );
      brandId = created.id;
      brandSlug = created.slug;
      if (osm) await importBrandStores(tx as unknown as Db, brandId, osm.stores);
    } else {
      const [existing] = await tx.select({ slug: brands.slug, kind: brands.kind }).from(brands).where(eq(brands.id, brandId!));
      if (!existing) throw new MutationError("not_found");
      if (extras.branch && existing.kind === "online") throw new MutationError("invalid");
      brandSlug = existing.slug;
    }
    if (extras.branch) await insertBranch(tx, actor, brandId!, { ...extras.branch, name: extras.branch.name ?? (input.newBrand?.name || null) }, now);
    const offer = one(await tx.insert(offers).values({ ...input.offer, brandId: brandId!, createdBy: actor.id }).returning());
    return { offerId: offer.id, brandSlug };
  });
}

// One vote per person per offer; voting again replaces it.
export async function castVote(db: Db, actor: Actor, offerId: number, kind: "valid" | "expired") {
  const [offer] = await db.select({ id: offers.id }).from(offers).where(and(eq(offers.id, offerId), eq(offers.state, "active")));
  if (!offer) throw new MutationError("not_found");
  await db
    .insert(offerVotes)
    .values({ offerId, userId: actor.id, kind })
    .onConflictDoUpdate({ target: [offerVotes.offerId, offerVotes.userId], set: { kind, createdAt: new Date() } });
}

export async function reportLocation(db: Db, actor: Actor, locationId: number, kind: ReportKind, note: string | null) {
  const [loc] = await db.select({ id: locations.id }).from(locations).where(eq(locations.id, locationId));
  if (!loc) throw new MutationError("not_found");
  await db.insert(locationReports).values({ locationId, userId: actor.id, kind, note }).onConflictDoNothing();
}

// ---------- Moderator actions ----------

export async function verifyOffer(db: Db, actor: Actor, offerId: number, now = new Date()) {
  const res = await db.update(offers).set({ verifiedAt: now, verifiedBy: actor.id, updatedAt: now }).where(eq(offers.id, offerId)).returning({ id: offers.id });
  if (!res.length) throw new MutationError("not_found");
}

// Moderators fix wording / the official link while verifying.
export async function updateOffer(db: Db, _actor: Actor, offerId: number, input: OfferInput) {
  const res = await db.update(offers).set({ ...input, updatedAt: new Date() }).where(eq(offers.id, offerId)).returning({ id: offers.id });
  if (!res.length) throw new MutationError("not_found");
}

export async function hideOffer(db: Db, _actor: Actor, offerId: number) {
  const res = await db.update(offers).set({ state: "hidden", updatedAt: new Date() }).where(eq(offers.id, offerId)).returning({ id: offers.id });
  if (!res.length) throw new MutationError("not_found");
}

// Duplicate handling: hide the duplicate and point it at the surviving offer.
// Votes on the duplicate are moved over unless the voter already voted on the target.
export async function mergeOffer(db: Db, _actor: Actor, offerId: number, intoId: number) {
  if (offerId === intoId) throw new MutationError("invalid");
  await db.transaction(async (tx) => {
    const [target] = await tx.select({ id: offers.id }).from(offers).where(and(eq(offers.id, intoId), eq(offers.state, "active")));
    if (!target) throw new MutationError("not_found");
    const dupVotes = await tx.select().from(offerVotes).where(eq(offerVotes.offerId, offerId));
    if (dupVotes.length) {
      await tx.insert(offerVotes).values(dupVotes.map((v) => ({ ...v, offerId: intoId }))).onConflictDoNothing();
    }
    const res = await tx
      .update(offers)
      .set({ state: "merged", mergedIntoId: intoId, updatedAt: new Date() })
      .where(eq(offers.id, offerId))
      .returning({ id: offers.id });
    if (!res.length) throw new MutationError("not_found");
  });
}

// apply=true hides the location for everyone (and resolves all open reports on it).
export async function resolveReport(db: Db, actor: Actor, reportId: number, apply: boolean) {
  await db.transaction(async (tx) => {
    const [report] = await tx.select().from(locationReports).where(eq(locationReports.id, reportId));
    if (!report) throw new MutationError("not_found");
    const now = new Date();
    if (apply) {
      await tx.update(locations).set({ hidden: true, hiddenReason: report.kind }).where(eq(locations.id, report.locationId));
      await tx
        .update(locationReports)
        .set({ resolvedAt: now, resolvedBy: actor.id })
        .where(and(eq(locationReports.locationId, report.locationId), isNull(locationReports.resolvedAt)));
    } else {
      await tx.update(locationReports).set({ resolvedAt: now, resolvedBy: actor.id }).where(eq(locationReports.id, reportId));
    }
  });
}

// Moderators place pins directly (map click / drag), so no geocoding round trip and no daily limit.
export async function addLocation(db: Db, actor: Actor, brandId: number, input: LocationInput) {
  const [brand] = await db.select({ kind: brands.kind }).from(brands).where(eq(brands.id, brandId));
  if (!brand) throw new MutationError("not_found");
  if (brand.kind === "online") throw new MutationError("invalid");
  const row = one(await db.insert(locations).values({ brandId, ...input, source: "manual", createdBy: actor.id }).returning({ id: locations.id }));
  return row.id;
}

// osm_id is kept, so a later import never re-adds or overwrites an edited OSM store.
export async function updateLocation(db: Db, _actor: Actor, locationId: number, input: LocationInput) {
  const res = await db.update(locations).set(input).where(eq(locations.id, locationId)).returning({ id: locations.id });
  if (!res.length) throw new MutationError("not_found");
}

/**
 * Deleting an OSM store would let the next import add it back, and deleting a reported one would drop its
 * reports, so those are hidden instead (with a reason). Anything else is deleted for good.
 */
export async function removeLocation(db: Db, _actor: Actor, locationId: number, reason: ReportKind | null): Promise<"hidden" | "deleted"> {
  return db.transaction(async (tx) => {
    const [loc] = await tx.select({ osmId: locations.osmId }).from(locations).where(eq(locations.id, locationId));
    if (!loc) throw new MutationError("not_found");
    const { n } = one(await tx.select({ n: count() }).from(locationReports).where(eq(locationReports.locationId, locationId)));
    if (!loc.osmId && n === 0) {
      await tx.delete(locations).where(eq(locations.id, locationId));
      return "deleted";
    }
    if (!reason) throw new MutationError("invalid");
    await tx.update(locations).set({ hidden: true, hiddenReason: reason }).where(eq(locations.id, locationId));
    return "hidden";
  });
}

export async function unhideLocation(db: Db, _actor: Actor, locationId: number) {
  const res = await db.update(locations).set({ hidden: false, hiddenReason: null }).where(eq(locations.id, locationId)).returning({ id: locations.id });
  if (!res.length) throw new MutationError("not_found");
}

// ---------- Admin actions ----------

export async function setUserRole(db: Db, actor: Actor, userId: string, role: Role) {
  if (userId === actor.id) throw new MutationError("invalid"); // admins can't lock themselves out
  const res = await db.update(user).set({ role, updatedAt: new Date() }).where(and(eq(user.id, userId), ne(user.role, role))).returning({ id: user.id });
  return res.length > 0;
}
