import { describe, expect, it } from "vitest";
import { overpassQuery, parseOverpass } from "@/lib/osm";
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
  it("requires a location for local stores, inside the GTA", () => {
    const base = { name: "Corner Café", kind: "local", category: "drink" };
    expect(submissionSchema.safeParse({ newBrand: base, offer }).success).toBe(false);
    expect(submissionSchema.safeParse({ newBrand: { ...base, lat: 49.28, lng: -123.12 }, offer }).success).toBe(false);
    expect(submissionSchema.safeParse({ newBrand: { ...base, lat: 43.65, lng: -79.38 }, offer }).success).toBe(true);
  });
  it("rejects non-http official links", () => {
    expect(submissionSchema.safeParse({ brandId: 1, offer: { ...offer, officialUrl: "javascript:alert(1)" } }).success).toBe(false);
    expect(submissionSchema.safeParse({ brandId: 1, offer: { ...offer, officialUrl: "" } }).success).toBe(false);
  });
});

describe("OpenStreetMap parsing", () => {
  it("builds a brand query limited to the GTA", () => {
    expect(overpassQuery({ osmName: "Tim Hortons", osmWikidata: null })).toContain('["brand"="Tim Hortons"](43.4,-80.1,44.2,-78.8)');
    expect(overpassQuery({ osmName: "Tim Hortons", osmWikidata: "Q175106" })).toContain('["brand:wikidata"="Q175106"]');
  });
  it("reads nodes and way centres, skipping elements without coordinates", () => {
    const rows = parseOverpass([
      { type: "node", id: 1, lat: 43.6, lon: -79.4, tags: { name: "Tims", "addr:housenumber": "10", "addr:street": "King St", "addr:city": "Toronto" } },
      { type: "way", id: 2, center: { lat: 43.7, lon: -79.3 } },
      { type: "relation", id: 3 },
    ]);
    expect(rows).toEqual([
      { osmId: "node/1", lat: 43.6, lng: -79.4, name: "Tims", address: "10 King St, Toronto" },
      { osmId: "way/2", lat: 43.7, lng: -79.3, name: null, address: null },
    ]);
  });
});
