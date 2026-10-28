import { z } from "zod";
import { SITE } from "./site";
import { createCache, createThrottle } from "./throttle";
import { placeRef } from "./validation";

// Geocoding goes through the server so every request carries our User-Agent (browsers can't set it) and stays
// within Nominatim's usage policy: at most 1 request per second, no autocomplete, results cached.
// https://operations.osmfoundation.org/policies/nominatim/
export const NOMINATIM_URL = process.env.NOMINATIM_URL ?? "https://nominatim.openstreetmap.org";

/** A geocoding result. `ref` ("N123", "W45", "R6") is what clients send back; the server looks it up again. */
export type Place = { ref: string; lat: number; lng: number; name: string | null; address: string | null; label: string };

const OSM_TYPE = { node: "N", way: "W", relation: "R" } as const;
// Results in these categories are businesses, so their name is the store's name (not a street or a mall's address).
const POI_CATEGORIES = new Set(["shop", "amenity", "leisure", "tourism", "craft", "office"]);

const item = z.object({
  osm_type: z.enum(["node", "way", "relation"]),
  osm_id: z.number().int(),
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  category: z.string().optional(),
  name: z.string().nullish(),
  display_name: z.string(),
  address: z.record(z.string(), z.string()).optional(),
});

export function parseNominatim(raw: unknown): Place[] {
  const items = z.array(z.unknown()).catch([]).parse(raw);
  const { south, west, north, east } = SITE.gtaBounds;
  return items.flatMap((r) => {
    const parsed = item.safeParse(r);
    if (!parsed.success) return [];
    const p = parsed.data;
    if (p.lat < south || p.lat > north || p.lon < west || p.lon > east) return [];
    const a = p.address ?? {};
    const street = [a.house_number, a.road].filter(Boolean).join(" ");
    const city = a.city ?? a.town ?? a.village ?? a.municipality;
    const address = [street, city].filter(Boolean).join(", ") || null;
    const name = POI_CATEGORIES.has(p.category ?? "") && p.name ? p.name : null;
    return [{ ref: `${OSM_TYPE[p.osm_type]}${p.osm_id}`, lat: p.lat, lng: p.lon, name, address, label: p.display_name }];
  });
}

const throttle = createThrottle(1000);
const cache = createCache<Place[]>(24 * 60 * 60 * 1000);

async function get(path: string, params: Record<string, string>, fetchImpl: typeof fetch): Promise<Place[]> {
  const qs = new URLSearchParams({ ...params, format: "jsonv2", addressdetails: "1", "accept-language": "en" });
  const key = `${path}?${qs}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const places = await throttle(async () => {
    const res = await fetchImpl(`${NOMINATIM_URL}/${path}?${qs}`, { headers: { "User-Agent": SITE.userAgent }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    return parseNominatim(await res.json());
  });
  cache.set(key, places);
  return places;
}

export function searchPlaces(query: string, fetchImpl: typeof fetch = fetch) {
  const { south, west, north, east } = SITE.gtaBounds;
  return get("search", { q: query, limit: "10", countrycodes: "ca", viewbox: `${west},${north},${east},${south}`, bounded: "1" }, fetchImpl);
}

export async function lookupPlace(ref: string, fetchImpl: typeof fetch = fetch): Promise<Place | null> {
  return (await get("lookup", { osm_ids: placeRef.parse(ref) }, fetchImpl))[0] ?? null;
}
