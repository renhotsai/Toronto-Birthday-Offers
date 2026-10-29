import { describe, expect, it, vi } from "vitest";
import { authBaseURL } from "@/lib/auth-url";
import { parseNominatim } from "@/lib/nominatim";
import { brandNameFilter, brandTagFilter, commonBrandTag, fetchBrandElements, fetchOverpass, overpassQuery, parseOverpass, wikidataFilter } from "@/lib/osm";
import { createCache, createRateLimiter, createThrottle } from "@/lib/throttle";
import { distanceKm, likelyExpired, slugify, verificationStatus } from "@/lib/status";
import { submissionSchema } from "@/lib/validation";

describe("verificationStatus", () => {
  const now = new Date("2026-10-27T12:00:00Z");
  it("is unverified without a verification date", () => {
    expect(verificationStatus(null, now)).toBe("unverified");
  });
  it("is verified within ~6 months", () => {
    expect(verificationStatus("2026-06-01T00:00:00Z", now)).toBe("verified");
  });
  it("decays to needs_check after ~6 months", () => {
    expect(verificationStatus("2026-04-01T00:00:00Z", now)).toBe("needs_check");
  });
});

describe("likelyExpired", () => {
  it("needs at least 3 expired votes", () => {
    expect(likelyExpired(0, 2)).toBe(false);
    expect(likelyExpired(0, 3)).toBe(true);
  });
  it("is outweighed by valid votes", () => {
    expect(likelyExpired(2, 4)).toBe(false);
    expect(likelyExpired(1, 3)).toBe(true);
  });
});

it("slugify handles accents, apostrophes and ampersands", () => {
  expect(slugify("Denny's")).toBe("dennys");
  expect(slugify("Bath & Body Works")).toBe("bath-and-body-works");
  expect(slugify("Café Crêpe")).toBe("cafe-crepe");
  expect(slugify("MILK (Queen St W)")).toBe("milk-queen-st-w");
});

it("distanceKm is roughly right across downtown Toronto", () => {
  // Union Station → Yonge & Eglinton is about 6 km.
  const d = distanceKm([43.6453, -79.3806], [43.7064, -79.3986]);
  expect(d).toBeGreaterThan(6.5);
  expect(d).toBeLessThan(7.5);
});

describe("submissionSchema", () => {
  const offer = { title: "Free drink", window: "day", membershipRequired: true, officialUrl: "https://example.com/terms" };

  it("accepts an existing brand", () => {
    expect(submissionSchema.safeParse({ brandId: 3, offer }).success).toBe(true);
  });
  it("requires exactly one of brandId / newBrand", () => {
    expect(submissionSchema.safeParse({ offer }).success).toBe(false);
    expect(
      submissionSchema.safeParse({ brandId: 1, newBrand: { name: "X", kind: "online", category: "food" }, offer }).success,
    ).toBe(false);
  });
  it("requires a picked location for local stores, and never takes coordinates from the client", () => {
    const base = { name: "Corner Café", kind: "local", category: "drink" };
    expect(submissionSchema.safeParse({ newBrand: base, offer }).success).toBe(false);
    expect(submissionSchema.safeParse({ newBrand: base, branchRef: "not-a-ref", offer }).success).toBe(false);
    const ok = submissionSchema.parse({ newBrand: { ...base, lat: 43.65, lng: -79.38 }, branchRef: "N123", offer });
    expect(ok.newBrand).not.toHaveProperty("lat");
  });
  it("allows OSM stores only for new chains, and no location for online brands", () => {
    const chain = { name: "Bubble Co", kind: "chain", category: "drink", useOsmStores: true };
    expect(submissionSchema.safeParse({ newBrand: chain, offer }).success).toBe(true);
    expect(submissionSchema.safeParse({ newBrand: { ...chain, kind: "local" }, branchRef: "N1", offer }).success).toBe(false);
    expect(submissionSchema.safeParse({ newBrand: { name: "Web", kind: "online", category: "other" }, branchRef: "N1", offer }).success).toBe(false);
  });
  it("rejects non-http official links", () => {
    expect(submissionSchema.safeParse({ brandId: 1, offer: { ...offer, officialUrl: "javascript:alert(1)" } }).success).toBe(false);
    expect(submissionSchema.safeParse({ brandId: 1, offer: { ...offer, officialUrl: "" } }).success).toBe(false);
  });
});

describe("OpenStreetMap parsing", () => {
  it("builds a brand query limited to the GTA", () => {
    expect(overpassQuery(brandTagFilter("Tim Hortons"))).toContain('["brand"="Tim Hortons"](43.4,-80.1,44.2,-78.8)');
    expect(overpassQuery(wikidataFilter("Q175106"))).toContain('["brand:wikidata"="Q175106"]');
    expect(overpassQuery(brandTagFilter('Say "hi"'), 25)).toMatch(/^\[out:json\]\[timeout:25\];nwr\["brand"="Say \\"hi\\""\]/);
  });
  it("matches typed brand names case-insensitively, escaping regex characters", () => {
    expect(brandNameFilter("starbucks")).toBe('["brand"~"^starbucks$",i]');
    expect(brandNameFilter("A&W (Canada)")).toBe('["brand"~"^A&W \\\\(Canada\\\\)$",i]');
  });
  it("reads nodes and way centres, skipping elements without coordinates", () => {
    const rows = parseOverpass([
      { type: "node", id: 1, lat: 43.6, lon: -79.4, tags: { name: "Tims", "addr:housenumber": "10", "addr:street": "King St", "addr:city": "Toronto" } },
      { type: "way", id: 2, center: { lat: 43.7, lon: -79.3 } },
      { type: "relation", id: 3 },
    ]);
    expect(rows).toEqual([
      { osmId: "node/1", lat: 43.6, lng: -79.4, name: "Tims", address: "10 King St, Toronto", brand: null },
      { osmId: "way/2", lat: 43.7, lng: -79.3, name: null, address: null, brand: null },
    ]);
  });
  it("picks the brand tag most stores use", () => {
    const store = (brand: string | null) => ({ osmId: "x", lat: 0, lng: 0, name: null, address: null, brand });
    expect(commonBrandTag([store("Starbucks"), store("starbucks"), store("Starbucks"), store(null)])).toBe("Starbucks");
    expect(commonBrandTag([store(null)])).toBeNull();
  });
});

// Overpass isn't reachable from the dev sandbox, so these use a stub fetch with the API's response shape.
describe("Overpass client", () => {
  const ok = (elements: unknown[]) => new Response(JSON.stringify({ elements }), { status: 200 });
  const noSleep = async () => {};

  it("sends our User-Agent and retries once when the server is busy", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("", { status: 429 })).mockResolvedValueOnce(ok([{ type: "node", id: 1 }]));
    expect(await fetchOverpass("q", { fetchImpl, sleep: noSleep })).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers["User-Agent"]).toMatch(/^TorontoBirthdayOffers\/1\.0 \(\+https:\/\/toronto-birthday-offers\.vercel\.app\)$/);

    const failing = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 504 }));
    await expect(fetchOverpass("q", { fetchImpl: failing, sleep: noSleep })).rejects.toMatchObject({ status: 504 });
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("falls back to the brand tag when brand:wikidata finds nothing", async () => {
    const queries: string[] = [];
    const fetchImpl: typeof fetch = async (_url, init) => {
      const q = new URLSearchParams(String(init?.body)).get("data")!;
      queries.push(q);
      return ok(q.includes("brand:wikidata") ? [] : [{ type: "node", id: 7, lat: 43.7, lon: -79.4 }]);
    };
    const elements = await fetchBrandElements({ osmName: "Tim Hortons", osmWikidata: "Q0" }, { fetchImpl });
    expect(elements).toHaveLength(1);
    expect(queries).toHaveLength(2);
    expect(queries[1]).toContain('["brand"="Tim Hortons"]');
  });
});

describe("parseNominatim", () => {
  it("keeps GTA results, names only businesses, and builds a lookup ref", () => {
    const places = parseNominatim([
      { osm_type: "node", osm_id: 42, lat: "43.65", lon: "-79.38", category: "amenity", name: "Joe's Café", display_name: "Joe's Café, 1 King St W, Toronto", address: { house_number: "1", road: "King St W", city: "Toronto" } },
      { osm_type: "way", osm_id: 7, lat: "43.7", lon: "-79.4", category: "building", name: "Some Mall", display_name: "Some Mall, Toronto", address: { road: "Yonge St", town: "Markham" } },
      { osm_type: "node", osm_id: 9, lat: "49.28", lon: "-123.12", category: "shop", name: "Vancouver", display_name: "Vancouver" },
      { nonsense: true },
    ]);
    expect(places).toEqual([
      { ref: "N42", lat: 43.65, lng: -79.38, name: "Joe's Café", address: "1 King St W, Toronto", label: "Joe's Café, 1 King St W, Toronto" },
      { ref: "W7", lat: 43.7, lng: -79.4, name: null, address: "Yonge St, Markham", label: "Some Mall, Toronto" },
    ]);
    expect(parseNominatim({ error: "bad" })).toEqual([]);
  });
});

describe("throttle helpers", () => {
  it("spaces calls at least the gap apart, one at a time", async () => {
    vi.useFakeTimers();
    try {
      const throttle = createThrottle(1000);
      const started: number[] = [];
      const call = () => throttle(async () => void started.push(Date.now()));
      const all = Promise.all([call(), call(), call()]);
      await vi.runAllTimersAsync();
      await all;
      expect(started[1]! - started[0]!).toBeGreaterThanOrEqual(1000);
      expect(started[2]! - started[1]!).toBeGreaterThanOrEqual(1000);
    } finally {
      vi.useRealTimers();
    }
  });
  it("expires cache entries and caps rate per key", () => {
    let t = 0;
    const cache = createCache<number>(100, 2, () => t);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
    t = 150;
    expect(cache.get("a")).toBeUndefined();

    const hit = createRateLimiter(2, 1000, () => t);
    expect([hit("u"), hit("u"), hit("u"), hit("v")]).toEqual([true, true, false, true]);
    t += 1001;
    expect(hit("u")).toBe(true);
  });
});

describe("authBaseURL", () => {
  const site = "https://toronto-birthday-offers.vercel.app";
  it("allows only the canonical host outside Vercel", () => {
    expect(authBaseURL({ BETTER_AUTH_URL: "http://localhost:3000" }, site)).toEqual({ allowedHosts: ["localhost:3000"], fallback: "http://localhost:3000" });
  });
  it("adds the deployment's own Vercel hosts on a preview", () => {
    const env = { VERCEL_URL: "tbo-abc123-team.vercel.app", VERCEL_BRANCH_URL: "tbo-git-feature-team.vercel.app" };
    expect(authBaseURL(env, site)).toEqual({
      allowedHosts: ["toronto-birthday-offers.vercel.app", "tbo-abc123-team.vercel.app", "tbo-git-feature-team.vercel.app"],
      fallback: site,
    });
  });
});
