import { isNotNull } from "drizzle-orm";
import type { Db } from "@/db";
import { brands, locations } from "@/db/schema";
import { SITE } from "./site";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export const OVERPASS_URL = process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter";

export function overpassQuery(brand: { osmName: string | null; osmWikidata: string | null }) {
  const { south, west, north, east } = SITE.gtaBounds;
  const bbox = `(${south},${west},${north},${east})`;
  // brand:wikidata is the most reliable match; fall back to the brand tag.
  const filter = brand.osmWikidata
    ? `["brand:wikidata"="${brand.osmWikidata}"]`
    : `["brand"="${brand.osmName!.replace(/"/g, '\\"')}"]`;
  return `[out:json][timeout:120];nwr${filter}${bbox};out center tags;`;
}

export function parseOverpass(elements: OverpassElement[]) {
  return elements.flatMap((el) => {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) return [];
    const t = el.tags ?? {};
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
    const address = [street, t["addr:city"]].filter(Boolean).join(", ") || null;
    return [{ osmId: `${el.type}/${el.id}`, lat, lng, name: t.name ?? null, address }];
  });
}

// Adds stores we don't have yet. Existing rows (including ones hidden after a report or
// edited by a moderator) are never touched, so re-imports are safe.
export async function importBrandLocations(db: Db, brandId: number, elements: OverpassElement[]) {
  const rows = parseOverpass(elements).map((r) => ({ ...r, brandId, source: "osm" as const }));
  if (!rows.length) return 0;
  const inserted = await db.insert(locations).values(rows).onConflictDoNothing({ target: locations.osmId }).returning({ id: locations.id });
  return inserted.length;
}

export async function importAll(db: Db, fetchImpl: typeof fetch = fetch, log = console.log) {
  const targets = await db.select().from(brands).where(isNotNull(brands.osmName));
  let total = 0;
  for (const brand of targets) {
    const res = await fetchImpl(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "toronto-birthday-offers-importer" },
      body: new URLSearchParams({ data: overpassQuery(brand) }),
    });
    if (!res.ok) {
      log(`✗ ${brand.name}: Overpass ${res.status}`);
      continue;
    }
    const { elements } = (await res.json()) as { elements: OverpassElement[] };
    const added = await importBrandLocations(db, brand.id, elements);
    total += added;
    log(`✓ ${brand.name}: ${elements.length} found, ${added} new`);
    await new Promise((r) => setTimeout(r, 1500)); // be polite to the public Overpass server
  }
  return total;
}
