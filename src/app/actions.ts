"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { userRole } from "@/db/schema";
import { getBrandById, listBrandBranches } from "@/lib/data";
import * as m from "@/lib/mutations";
import { lookupPlace, searchPlaces, type Place } from "@/lib/nominatim";
import { OverpassError, previewBrandStores, type BrandPreview } from "@/lib/osm";
import { AuthError, requireUser } from "@/lib/session";
import { createRateLimiter } from "@/lib/throttle";
import {
  addBranchSchema, brandNameSchema, locationInputSchema, offerInputSchema, placeSearchSchema, removeLocationSchema, reportSchema,
  submissionSchema, voteSchema,
} from "@/lib/validation";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: "unauthorized" | "forbidden" | "rate_limited" | "not_found" | "invalid" | "duplicate" | "removed" | "unavailable" | "generic";
      issues?: string[];
    };

// An OSM service (Nominatim / Overpass) is down, slow or refusing us.
class UnavailableError extends Error {}

async function run<T>(fn: () => Promise<T>, { revalidate = true } = {}): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    if (revalidate) revalidatePath("/[lang]", "layout");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.code };
    if (err instanceof m.MutationError) return { ok: false, error: err.code };
    if (err instanceof UnavailableError || err instanceof OverpassError) return { ok: false, error: "unavailable" };
    if (err instanceof z.ZodError) return { ok: false, error: "invalid", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    console.error(err);
    return { ok: false, error: "generic" };
  }
}

const id = z.coerce.number().int().positive();

// Per-user caps on calls to the public OSM services, on top of the per-instance throttles in lib/.
const searchLimit = createRateLimiter(20, 60_000);
const previewLimit = createRateLimiter(5, 60_000);

async function lookupOrFail(ref: string): Promise<Place> {
  let place: Place | null;
  try {
    place = await lookupPlace(ref);
  } catch {
    throw new UnavailableError();
  }
  if (!place) throw new m.MutationError("not_found");
  return place;
}

export async function submitOffer(input: unknown) {
  return run(async () => {
    const me = await requireUser();
    const parsed = submissionSchema.parse(input);
    const extras: m.SubmissionExtras = {};
    if (parsed.branchRef) extras.branch = await lookupOrFail(parsed.branchRef);
    if (parsed.newBrand?.useOsmStores) {
      // Usually cached from the preview. If Overpass fails now, the brand is still created without stores.
      extras.osm = await previewBrandStores(parsed.newBrand.name).catch(() => undefined);
    }
    return m.createSubmission(db, me, parsed, extras);
  });
}

// ---------- Locations (any signed-in user) ----------

/** Geocodes an address or store name inside the GTA. Clients only call this on an explicit search. */
export async function searchPlace(query: unknown) {
  return run(
    async () => {
      const me = await requireUser();
      const q = placeSearchSchema.parse(query);
      if (!searchLimit(me.id)) throw new m.MutationError("rate_limited");
      try {
        return await searchPlaces(q);
      } catch {
        throw new UnavailableError();
      }
    },
    { revalidate: false },
  );
}

/** OpenStreetMap stores for a new chain's name, previewed on /submit before the user confirms them. */
export async function previewChainStores(name: unknown) {
  return run<BrandPreview>(
    async () => {
      const me = await requireUser();
      const n = brandNameSchema.parse(name);
      if (!previewLimit(me.id)) throw new m.MutationError("rate_limited");
      return previewBrandStores(n);
    },
    { revalidate: false },
  );
}

export async function getBrandBranches(brandId: unknown) {
  return run(async () => listBrandBranches(db, id.parse(brandId)), { revalidate: false });
}

/**
 * A brand searched on /submit: its stores from our database, or, for a chain with none yet, the stores
 * OpenStreetMap lists for it, which are saved right away. `osm` says what the OSM lookup did, if it ran.
 */
export async function findBrandStores(brandId: unknown) {
  return run(async () => {
    const me = await requireUser();
    const brandIdN = id.parse(brandId);
    const stores = await listBrandBranches(db, brandIdN);
    const brand = await getBrandById(db, brandIdN);
    if (!brand) throw new m.MutationError("not_found");
    if (stores.length || brand.kind !== "chain") return { stores, osm: null };
    if (!previewLimit(me.id)) throw new m.MutationError("rate_limited");
    let preview: BrandPreview;
    try {
      preview = await previewBrandStores(brand.osmName ?? brand.name);
    } catch {
      return { stores, osm: "unavailable" as const };
    }
    const result = await m.adoptBrandStores(db, brandIdN, preview);
    return { stores: await listBrandBranches(db, brandIdN), osm: result };
  });
}

/** Adds a store missing from an existing brand. Only a geocoding result can be added, looked up again here. */
export async function addBranch(input: unknown) {
  return run(async () => {
    const me = await requireUser();
    const { brandId, ref } = addBranchSchema.parse(input);
    return m.addBranch(db, me, brandId, await lookupOrFail(ref));
  });
}

export async function vote(input: unknown) {
  return run(async () => {
    const { offerId, kind } = voteSchema.parse(input);
    await m.castVote(db, await requireUser(), offerId, kind);
  });
}

export async function reportLocation(input: unknown) {
  return run(async () => {
    const { locationId, kind, note } = reportSchema.parse(input);
    await m.reportLocation(db, await requireUser(), locationId, kind, note);
  });
}

// ---------- Moderators ----------

export async function verifyOffer(offerId: unknown) {
  return run(async () => m.verifyOffer(db, await requireUser("moderator"), id.parse(offerId)));
}

export async function updateOffer(offerId: unknown, input: unknown) {
  return run(async () => m.updateOffer(db, await requireUser("moderator"), id.parse(offerId), offerInputSchema.parse(input)));
}

export async function hideOffer(offerId: unknown) {
  return run(async () => m.hideOffer(db, await requireUser("moderator"), id.parse(offerId)));
}

export async function mergeOffer(offerId: unknown, intoId: unknown) {
  return run(async () => m.mergeOffer(db, await requireUser("moderator"), id.parse(offerId), id.parse(intoId)));
}

export async function resolveReport(reportId: unknown, apply: unknown) {
  return run(async () => m.resolveReport(db, await requireUser("moderator"), id.parse(reportId), z.boolean().parse(apply)));
}

export async function addLocation(brandId: unknown, input: unknown) {
  return run(async () => m.addLocation(db, await requireUser("moderator"), id.parse(brandId), locationInputSchema.parse(input)));
}

export async function updateLocation(locationId: unknown, input: unknown) {
  return run(async () => m.updateLocation(db, await requireUser("moderator"), id.parse(locationId), locationInputSchema.parse(input)));
}

export async function removeLocation(input: unknown) {
  return run(async () => {
    const me = await requireUser("moderator");
    const { locationId, reason } = removeLocationSchema.parse(input);
    return m.removeLocation(db, me, locationId, reason);
  });
}

export async function unhideLocation(locationId: unknown) {
  return run(async () => m.unhideLocation(db, await requireUser("moderator"), id.parse(locationId)));
}

// ---------- Admins ----------

export async function setUserRole(userId: unknown, role: unknown) {
  return run(async () => {
    await m.setUserRole(db, await requireUser("admin"), z.string().min(1).parse(userId), z.enum(userRole.enumValues).parse(role));
  });
}
