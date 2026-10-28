import { z } from "zod";
import { BRAND_KINDS, CATEGORIES, REPORT_KINDS, WINDOWS } from "@/db/schema";
import { SITE } from "./site";

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url()
  .refine((u) => /^https?:\/\//i.test(u), "Must be an http(s) link");

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => (v ? v : null));

const { south, west, north, east } = SITE.gtaBounds;
const lat = z.coerce.number().min(south).max(north);
const lng = z.coerce.number().min(west).max(east);

export const newBrandSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(BRAND_KINDS),
  category: z.enum(CATEGORIES),
  website: httpUrl.optional().or(z.literal("").transform(() => undefined)),
  // The user confirmed the OpenStreetMap stores previewed for this name; the server fetches them again.
  useOsmStores: z.boolean().default(false),
});

export const offerInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  titleZh: optionalText(120),
  details: z.string().trim().max(1000).default(""),
  detailsZh: optionalText(1000),
  conditions: z.string().trim().max(500).default(""),
  window: z.enum(WINDOWS),
  windowNote: optionalText(120),
  membershipRequired: z.coerce.boolean(),
  officialUrl: httpUrl,
});

// Nominatim's OSM reference for a search result: "N123" (node), "W45" (way), "R6" (relation).
export const placeRef = z.string().regex(/^[NWR]\d{1,15}$/);

// Users pick a branch from search results by its ref; coordinates never come from the client.
export const submissionSchema = z.object({
  brandId: z.coerce.number().int().positive().optional(),
  newBrand: newBrandSchema.optional(),
  branchRef: placeRef.optional(),
  offer: offerInputSchema,
})
  .refine((s) => !!s.brandId !== !!s.newBrand, { message: "Choose an existing brand or create a new one" })
  .refine((s) => s.newBrand?.kind !== "online" || !s.branchRef, { message: "Online brands have no locations", path: ["branchRef"] })
  .refine((s) => s.newBrand?.kind !== "local" || !!s.branchRef, { message: "Local stores need a location", path: ["branchRef"] })
  .refine((s) => s.newBrand?.kind === "chain" || !s.newBrand?.useOsmStores, { message: "Only chains import stores", path: ["newBrand"] });

export const placeSearchSchema = z.string().trim().min(3).max(200);
export const brandNameSchema = z.string().trim().min(2).max(80);
export const addBranchSchema = z.object({ brandId: z.coerce.number().int().positive(), ref: placeRef });

// Moderators can place or move a pin anywhere in the GTA.
export const locationInputSchema = z.object({
  lat,
  lng,
  name: optionalText(120),
  address: optionalText(200),
});
export const removeLocationSchema = z.object({
  locationId: z.coerce.number().int().positive(),
  reason: z.enum(REPORT_KINDS).nullable().default(null),
});

export const voteSchema = z.object({ offerId: z.coerce.number().int().positive(), kind: z.enum(["valid", "expired"]) });
export const reportSchema = z.object({
  locationId: z.coerce.number().int().positive(),
  kind: z.enum(REPORT_KINDS),
  note: optionalText(300),
});

export type Submission = z.infer<typeof submissionSchema>;
export type OfferInput = z.infer<typeof offerInputSchema>;
export type LocationInput = z.infer<typeof locationInputSchema>;
