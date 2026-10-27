import { and, count, eq, gte, isNull, ne } from "drizzle-orm";
import type { Db } from "@/db";
import { brands, locationReports, locations, offers, offerVotes, user, type ReportKind, type Role } from "@/db/schema";
import { slugify } from "./status";
import type { OfferInput, Submission } from "./validation";

export const DAILY_SUBMISSION_LIMIT = 10;

export class MutationError extends Error {
  constructor(public code: "rate_limited" | "not_found" | "invalid") {
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

export async function createSubmission(db: Db, actor: Actor, input: Submission, now = new Date()) {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(offers)
    .where(and(eq(offers.createdBy, actor.id), gte(offers.createdAt, since)));
  if (n >= DAILY_SUBMISSION_LIMIT) throw new MutationError("rate_limited");

  return db.transaction(async (tx) => {
    let brandId = input.brandId;
    let brandSlug: string;
    if (input.newBrand) {
      const b = input.newBrand;
      const [created] = await tx
        .insert(brands)
        .values({ slug: await uniqueSlug(tx as unknown as Db, b.name), name: b.name, kind: b.kind, category: b.category, website: b.website ?? null, createdBy: actor.id })
        .returning();
      brandId = created.id;
      brandSlug = created.slug;
      if (b.lat !== undefined && b.lng !== undefined) {
        await tx.insert(locations).values({ brandId, lat: b.lat, lng: b.lng, address: b.address, name: b.name, source: "manual" });
      }
    } else {
      const [existing] = await tx.select({ slug: brands.slug }).from(brands).where(eq(brands.id, brandId!));
      if (!existing) throw new MutationError("not_found");
      brandSlug = existing.slug;
    }
    const [offer] = await tx.insert(offers).values({ ...input.offer, brandId: brandId!, createdBy: actor.id }).returning();
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

// ---------- Admin actions ----------

export async function setUserRole(db: Db, actor: Actor, userId: string, role: Role) {
  if (userId === actor.id) throw new MutationError("invalid"); // admins can't lock themselves out
  const res = await db.update(user).set({ role, updatedAt: new Date() }).where(and(eq(user.id, userId), ne(user.role, role))).returning({ id: user.id });
  return res.length > 0;
}
