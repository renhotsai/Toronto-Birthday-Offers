// Product name lives here so a rename only touches one file.
export const SITE = {
  name: { en: "Toronto Birthday Offers", zh: "多倫多生日優惠地圖" },
  emoji: "🎂",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  // Sent to Nominatim and Overpass (their usage policies ask apps to identify themselves). Always the
  // production URL, so requests from dev and previews are still traceable to this project.
  userAgent: "TorontoBirthdayOffers/1.0 (+https://toronto-birthday-offers.vercel.app)",
  // Toronto city hall; default map centre.
  center: [43.6532, -79.3832] as [number, number],
  // Rough Greater Toronto Area bounds (south, west, north, east).
  gtaBounds: { south: 43.4, west: -80.1, north: 44.2, east: -78.8 },
  // A verified offer falls back to "needs check" after this many days without re-verification.
  staleAfterDays: 183,
} as const;
