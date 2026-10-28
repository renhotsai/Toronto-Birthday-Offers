import { and, asc, desc, eq, ilike, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { one } from "@/db/rows";
import { brands, locationReports, locations, offers, offerVotes, user, type Category, type Window } from "@/db/schema";
import { SITE } from "./site";

export type OfferSummary = {
  id: number;
  brandId: number;
  brandSlug: string;
  brandName: string;
  brandKind: "chain" | "local" | "online";
  category: Category;
  title: string;
  titleZh: string | null;
  details: string;
  detailsZh: string | null;
  conditions: string;
  window: Window;
  windowNote: string | null;
  membershipRequired: boolean;
  officialUrl: string;
  verifiedAt: string | null;
  validVotes: number;
  expiredVotes: number;
  locationCount: number;
  sharedBy: string | null;
};

export type MapLocation = { id: number; brandId: number; lat: number; lng: number; name: string | null; address: string | null };

export type OfferFilters = { category?: Category; window?: Window; noMembership?: boolean; q?: string };

const validVotes = sql<number>`(select count(*)::int from ${offerVotes} v where v.offer_id = ${offers.id} and v.kind = 'valid')`;
const expiredVotes = sql<number>`(select count(*)::int from ${offerVotes} v where v.offer_id = ${offers.id} and v.kind = 'expired')`;
const locationCount = sql<number>`(select count(*)::int from ${locations} l where l.brand_id = ${brands.id} and not l.hidden)`;

const summaryColumns = {
  id: offers.id,
  brandId: brands.id,
  brandSlug: brands.slug,
  brandName: brands.name,
  brandKind: brands.kind,
  category: brands.category,
  title: offers.title,
  titleZh: offers.titleZh,
  details: offers.details,
  detailsZh: offers.detailsZh,
  conditions: offers.conditions,
  window: offers.window,
  windowNote: offers.windowNote,
  membershipRequired: offers.membershipRequired,
  officialUrl: offers.officialUrl,
  verifiedAt: offers.verifiedAt,
  validVotes,
  expiredVotes,
  locationCount,
  sharedBy: user.name,
};

type SummaryRow = Omit<OfferSummary, "verifiedAt"> & { verifiedAt: Date | null };
const toSummary = (r: SummaryRow): OfferSummary => ({ ...r, verifiedAt: r.verifiedAt?.toISOString() ?? null });

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listOffers(db: Db, filters: OfferFilters = {}): Promise<OfferSummary[]> {
  const where = [eq(offers.state, "active")];
  if (filters.category) where.push(eq(brands.category, filters.category));
  if (filters.window) where.push(eq(offers.window, filters.window));
  if (filters.noMembership) where.push(eq(offers.membershipRequired, false));
  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    where.push(or(ilike(brands.name, like), ilike(offers.title, like), ilike(offers.titleZh, like))!);
  }
  const rows = await db
    .select(summaryColumns)
    .from(offers)
    .innerJoin(brands, eq(offers.brandId, brands.id))
    .leftJoin(user, eq(offers.createdBy, user.id))
    .where(and(...where))
    // Verified first, then what the community confirms most, then alphabetical.
    .orderBy(sql`${offers.verifiedAt} is null`, desc(validVotes), asc(brands.name));
  return rows.map(toSummary);
}

export async function listMapLocations(db: Db): Promise<MapLocation[]> {
  return db
    .select({ id: locations.id, brandId: locations.brandId, lat: locations.lat, lng: locations.lng, name: locations.name, address: locations.address })
    .from(locations)
    .where(eq(locations.hidden, false));
}

export async function getBrandPage(db: Db, slug: string) {
  const [brand] = await db.select().from(brands).where(eq(brands.slug, slug));
  if (!brand) return null;
  const brandOffers = await db
    .select(summaryColumns)
    .from(offers)
    .innerJoin(brands, eq(offers.brandId, brands.id))
    .leftJoin(user, eq(offers.createdBy, user.id))
    .where(and(eq(offers.brandId, brand.id), eq(offers.state, "active")))
    .orderBy(desc(offers.createdAt));
  const brandLocations = await db
    .select()
    .from(locations)
    .where(eq(locations.brandId, brand.id))
    .orderBy(asc(locations.hidden), asc(locations.address));
  return { brand, offers: brandOffers.map(toSummary), locations: brandLocations };
}

export async function listBrandsForPicker(db: Db) {
  return db.select({ id: brands.id, name: brands.name, kind: brands.kind }).from(brands).orderBy(asc(brands.name));
}

export async function getUserVotes(db: Db, userId: string) {
  const rows = await db.select({ offerId: offerVotes.offerId, kind: offerVotes.kind }).from(offerVotes).where(eq(offerVotes.userId, userId));
  return Object.fromEntries(rows.map((r) => [r.offerId, r.kind])) as Record<number, "valid" | "expired">;
}

// Shared by the admin tab counts and the tab lists, so a tab's count always matches its contents.
const staleBefore = (now: Date) => new Date(now.getTime() - SITE.staleAfterDays * 24 * 60 * 60 * 1000);
const unverifiedWhere = () => and(eq(offers.state, "active"), isNull(offers.verifiedAt));
const staleWhere = (now: Date) => and(eq(offers.state, "active"), isNotNull(offers.verifiedAt), lt(offers.verifiedAt, staleBefore(now)));
const openReportWhere = () => isNull(locationReports.resolvedAt);

const moderationOffers = (db: Db) =>
  db.select(summaryColumns).from(offers).innerJoin(brands, eq(offers.brandId, brands.id)).leftJoin(user, eq(offers.createdBy, user.id));

export async function listUnverifiedOffers(db: Db) {
  return (await moderationOffers(db).where(unverifiedWhere()).orderBy(desc(offers.createdAt))).map(toSummary);
}

export async function listStaleOffers(db: Db, now = new Date()) {
  return (await moderationOffers(db).where(staleWhere(now)).orderBy(asc(offers.verifiedAt))).map(toSummary);
}

export async function listOpenReports(db: Db) {
  return db
    .select({
      id: locationReports.id,
      kind: locationReports.kind,
      note: locationReports.note,
      createdAt: locationReports.createdAt,
      locationId: locations.id,
      locationAddress: locations.address,
      locationName: locations.name,
      brandName: brands.name,
      brandSlug: brands.slug,
      reporter: user.name,
    })
    .from(locationReports)
    .innerJoin(locations, eq(locationReports.locationId, locations.id))
    .innerJoin(brands, eq(locations.brandId, brands.id))
    .innerJoin(user, eq(locationReports.userId, user.id))
    .where(openReportWhere())
    .orderBy(asc(locationReports.createdAt));
}

export type ModerationCounts = { queue: number; stale: number; reports: number };

/** Pending counts for the admin tab bar, in one round trip. Joins mirror the lists above. */
export async function getModerationCounts(db: Db, now = new Date()): Promise<ModerationCounts> {
  const count = () => sql<number>`count(*)::int`;
  const queue = db.select({ n: count() }).from(offers).innerJoin(brands, eq(offers.brandId, brands.id)).where(unverifiedWhere());
  const stale = db.select({ n: count() }).from(offers).innerJoin(brands, eq(offers.brandId, brands.id)).where(staleWhere(now));
  const reports = db
    .select({ n: count() })
    .from(locationReports)
    .innerJoin(locations, eq(locationReports.locationId, locations.id))
    .innerJoin(brands, eq(locations.brandId, brands.id))
    .innerJoin(user, eq(locationReports.userId, user.id))
    .where(openReportWhere());
  const result = await db.execute<ModerationCounts>(sql`select (${queue}) as queue, (${stale}) as stale, (${reports}) as reports`);
  return one(result.rows);
}

export async function listUsers(db: Db) {
  return db.select({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt }).from(user).orderBy(desc(user.createdAt)).limit(200);
}
