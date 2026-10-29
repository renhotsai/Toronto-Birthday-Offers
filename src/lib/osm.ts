import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { Db } from "@/db";
import { brands, locations } from "@/db/schema";
import { SITE } from "./site";
import { distanceKm } from "./status";
import { createCache, createThrottle } from "./throttle";

export type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type BrandMatch = { osmName: string | null; osmWikidata: string | null };

export const OVERPASS_URL = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

// A manual location this close to an OSM store of the same brand is taken to be that store (see importBrandLocations).
export const MATCH_RADIUS_KM = 0.05;

const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function overpassQuery(filter: string, timeoutSec = 120) {
  const { south, west, north, east } = SITE.gtaBounds;
  return `[out:json][timeout:${timeoutSec}];nwr${filter}(${south},${west},${north},${east});out center tags;`;
}

export const wikidataFilter = (qid: string) => `["brand:wikidata"=${quote(qid)}]`;
export const brandTagFilter = (name: string) => `["brand"=${quote(name)}]`;
// Case-insensitive exact match, for names typed by users ("starbucks" finds brand=Starbucks).
export const brandNameFilter = (name: string) => `["brand"~${quote(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)},i]`;

export class OverpassError extends Error {
  constructor(public status: number | "timeout" | "network") {
    super(`Overpass ${status}`);
  }
}

export type OverpassOptions = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Retries (once by default) on 429/504, which the public server returns when it's busy.
export async function fetchOverpass(query: string, { fetchImpl = fetch, timeoutMs = 180_000, retries = 1, sleep = defaultSleep }: OverpassOptions = {}) {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(OVERPASS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": SITE.userAgent },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new OverpassError(err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network");
    }
    if (res.ok) return ((await res.json()) as { elements: OverpassElement[] }).elements;
    if (attempt < retries && (res.status === 429 || res.status === 504)) {
      await sleep(10_000);
      continue;
    }
    throw new OverpassError(res.status);
  }
}

// brand:wikidata is the most reliable match. If it finds nothing (e.g. a wrong Q-id), fall back to the brand tag.
export async function fetchBrandElements(brand: BrandMatch, opts?: OverpassOptions) {
  if (brand.osmWikidata) {
    const elements = await fetchOverpass(overpassQuery(wikidataFilter(brand.osmWikidata)), opts);
    if (elements.length || !brand.osmName) return elements;
  }
  if (!brand.osmName) return [];
  return fetchOverpass(overpassQuery(brandTagFilter(brand.osmName)), opts);
}

export type OsmStore = { osmId: string; lat: number; lng: number; name: string | null; address: string | null; brand: string | null };

export function parseOverpass(elements: OverpassElement[]): OsmStore[] {
  const seen = new Set<string>();
  return elements.flatMap((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const osmId = `${el.type}/${el.id}`;
    if (lat === undefined || lng === undefined || seen.has(osmId)) return [];
    seen.add(osmId);
    const t = el.tags ?? {};
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    const address = [street, t["addr:city"]].filter(Boolean).join(", ") || null;
    return [{ osmId, lat, lng, name: t.name ?? null, address, brand: t.brand ?? null }];
  });
}

/** The brand tag most stores use, so later imports can match it exactly. */
export function commonBrandTag(stores: OsmStore[]) {
  const counts = new Map<string, number>();
  for (const s of stores) if (s.brand) counts.set(s.brand, (counts.get(s.brand) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export type ImportResult = { found: number; added: number; updated: number };

/**
 * Adds stores we don't have yet. Rows that already have an osm_id (including hidden ones and ones a moderator
 * edited) are never touched, so re-imports are safe and never un-hide anything.
 * One exception, agreed in #1: a visible manual row of the same brand without an osm_id, within MATCH_RADIUS_KM,
 * is the same store added by hand before OSM had it. It's updated in place (same id, so reports stay attached)
 * with OSM's data and osm_id, once; after that it's an ordinary OSM row.
 */
export function importBrandLocations(db: Db, brandId: number, elements: OverpassElement[]) {
  return importBrandStores(db, brandId, parseOverpass(elements));
}

export async function importBrandStores(db: Db, brandId: number, stores: OsmStore[]): Promise<ImportResult> {
  if (!stores.length) return { found: 0, added: 0, updated: 0 };
  return db.transaction(async (tx) => {
    const known = await tx.select({ osmId: locations.osmId }).from(locations).where(inArray(locations.osmId, stores.map((s) => s.osmId)));
    const knownIds = new Set(known.map((k) => k.osmId));
    const fresh = stores.filter((s) => !knownIds.has(s.osmId));

    const manual = await tx
      .select({ id: locations.id, lat: locations.lat, lng: locations.lng })
      .from(locations)
      .where(and(eq(locations.brandId, brandId), isNull(locations.osmId), eq(locations.hidden, false)));
    // Pair closest first, so two nearby stores can't both claim one manual row.
    const pairs = fresh
      .flatMap((s) => manual.map((m) => ({ s, m, d: distanceKm([s.lat, s.lng], [m.lat, m.lng]) })))
      .filter((p) => p.d <= MATCH_RADIUS_KM)
      .sort((a, b) => a.d - b.d);
    const usedStores = new Set<string>();
    const usedRows = new Set<number>();
    for (const { s, m } of pairs) {
      if (usedStores.has(s.osmId) || usedRows.has(m.id)) continue;
      usedStores.add(s.osmId);
      usedRows.add(m.id);
      await tx
        .update(locations)
        .set({ lat: s.lat, lng: s.lng, name: s.name ?? undefined, address: s.address ?? undefined, osmId: s.osmId, source: "osm" })
        .where(eq(locations.id, m.id));
    }

    const rows = fresh
      .filter((s) => !usedStores.has(s.osmId))
      .map((s) => ({ osmId: s.osmId, lat: s.lat, lng: s.lng, name: s.name, address: s.address, brandId, source: "osm" as const }));
    const inserted = rows.length
      ? await tx.insert(locations).values(rows).onConflictDoNothing({ target: locations.osmId }).returning({ id: locations.id })
      : [];
    return { found: stores.length, added: inserted.length, updated: usedRows.size };
  });
}

export type BrandPreview = { osmName: string | null; stores: OsmStore[] };

const previewCache = createCache<BrandPreview>(60 * 60 * 1000, 200);
const previewThrottle = createThrottle(1000);

/**
 * All GTA stores whose brand tag matches a name a user typed for a new chain (case-insensitive). Used to preview
 * them on /submit and again (from cache) to import them when the offer is saved. Fails fast: no retry, short timeout.
 */
export async function previewBrandStores(name: string, opts: OverpassOptions = {}): Promise<BrandPreview> {
  const key = name.trim().toLowerCase();
  const cached = previewCache.get(key);
  if (cached) return cached;
  const elements = await previewThrottle(() => fetchOverpass(overpassQuery(brandNameFilter(name.trim()), 25), { timeoutMs: 30_000, retries: 0, ...opts }));
  const stores = parseOverpass(elements);
  const preview = { osmName: commonBrandTag(stores), stores };
  previewCache.set(key, preview);
  return preview;
}

export async function importAll(db: Db, fetchImpl: typeof fetch = fetch, log = console.log, sleep = defaultSleep) {
  const targets = await db.select().from(brands).where(or(isNotNull(brands.osmName), isNotNull(brands.osmWikidata)));
  const total: ImportResult = { found: 0, added: 0, updated: 0 };
  for (const brand of targets) {
    try {
      const r = await importBrandLocations(db, brand.id, await fetchBrandElements(brand, { fetchImpl, sleep }));
      total.found += r.found;
      total.added += r.added;
      total.updated += r.updated;
      log(`${r.found ? "✓" : "∅"} ${brand.name}: ${r.found} found, ${r.added} new, ${r.updated} matched to manual locations`);
    } catch (err) {
      log(`✗ ${brand.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await sleep(1500); // be polite to the public Overpass server
  }
  return total;
}
