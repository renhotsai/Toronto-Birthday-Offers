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
  address: optionalText(200),
  lat: lat.optional(),
  lng: lng.optional(),
}).refine((b) => b.kind !== "local" || (b.lat !== undefined && b.lng !== undefined), {
  message: "Local stores need a location",
  path: ["lat"],
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

export const submissionSchema = z.object({
  brandId: z.coerce.number().int().positive().optional(),
  newBrand: newBrandSchema.optional(),
  offer: offerInputSchema,
}).refine((s) => !!s.brandId !== !!s.newBrand, { message: "Choose an existing brand or create a new one" });

export const voteSchema = z.object({ offerId: z.coerce.number().int().positive(), kind: z.enum(["valid", "expired"]) });
export const reportSchema = z.object({
  locationId: z.coerce.number().int().positive(),
  kind: z.enum(REPORT_KINDS),
  note: optionalText(300),
});

export type Submission = z.infer<typeof submissionSchema>;
export type OfferInput = z.infer<typeof offerInputSchema>;
