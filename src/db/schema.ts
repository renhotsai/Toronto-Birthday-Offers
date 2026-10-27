import {
  boolean, doublePrecision, index, integer, pgEnum, pgTable, primaryKey, serial, text, timestamp, uniqueIndex,
} from "drizzle-orm/pg-core";
import { BRAND_KINDS, CATEGORIES, REPORT_KINDS, ROLES, VOTE_KINDS, WINDOWS } from "../lib/constants";

export * from "../lib/constants";

// ---------- Auth (Better Auth core tables) ----------

export const userRole = pgEnum("user_role", ROLES);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [index("session_user_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("account_user_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

// ---------- Domain ----------

export const category = pgEnum("category", CATEGORIES);
export const brandKind = pgEnum("brand_kind", BRAND_KINDS);
export const offerWindow = pgEnum("offer_window", WINDOWS);
export const offerState = pgEnum("offer_state", ["active", "hidden", "merged"]);
export const voteKind = pgEnum("vote_kind", VOTE_KINDS);
export const locationSource = pgEnum("location_source", ["osm", "manual"]);
export const reportKind = pgEnum("report_kind", REPORT_KINDS);

export const brands = pgTable("brands", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  kind: brandKind("kind").notNull(),
  category: category("category").notNull(),
  website: text("website"),
  // Used by the OpenStreetMap importer to find this brand's stores.
  osmWikidata: text("osm_wikidata"),
  osmName: text("osm_name"),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  titleZh: text("title_zh"),
  details: text("details").notNull().default(""),
  detailsZh: text("details_zh"),
  conditions: text("conditions").notNull().default(""),
  window: offerWindow("window").notNull(),
  windowNote: text("window_note"),
  membershipRequired: boolean("membership_required").notNull().default(true),
  officialUrl: text("official_url").notNull(),
  state: offerState("state").notNull().default("active"),
  mergedIntoId: integer("merged_into_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by").references(() => user.id, { onDelete: "set null" }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("offers_brand_idx").on(t.brandId), index("offers_state_idx").on(t.state)]);

export const locations = pgTable("locations", {
  id: serial("id").primaryKey(),
  brandId: integer("brand_id").notNull().references(() => brands.id, { onDelete: "cascade" }),
  name: text("name"),
  address: text("address"),
  lat: doublePrecision("lat").notNull(),
  lng: doublePrecision("lng").notNull(),
  source: locationSource("source").notNull(),
  // e.g. "node/123"; lets re-imports skip stores we already have.
  osmId: text("osm_id"),
  // Hidden after a confirmed report (closed / not participating / wrong). Re-imports never un-hide.
  hidden: boolean("hidden").notNull().default(false),
  hiddenReason: reportKind("hidden_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("locations_brand_idx").on(t.brandId), uniqueIndex("locations_osm_idx").on(t.osmId)]);

export const offerVotes = pgTable("offer_votes", {
  offerId: integer("offer_id").notNull().references(() => offers.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: voteKind("kind").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.offerId, t.userId] })]);

export const locationReports = pgTable("location_reports", {
  id: serial("id").primaryKey(),
  locationId: integer("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  kind: reportKind("kind").notNull(),
  note: text("note"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("location_reports_once_idx").on(t.locationId, t.userId, t.kind)]);

export type Brand = typeof brands.$inferSelect;
export type Offer = typeof offers.$inferSelect;
export type Location = typeof locations.$inferSelect;
