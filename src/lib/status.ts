import { SITE } from "./site";

export type VerificationStatus = "verified" | "unverified" | "needs_check";

const DAY_MS = 24 * 60 * 60 * 1000;

// Verification decays: an offer nobody re-checked for ~6 months goes back to "needs check".
export function verificationStatus(verifiedAt: Date | string | null, now = new Date()): VerificationStatus {
  if (!verifiedAt) return "unverified";
  const age = now.getTime() - new Date(verifiedAt).getTime();
  return age > SITE.staleAfterDays * DAY_MS ? "needs_check" : "verified";
}

// Flag offers the community reports as dead, without letting a single vote do it.
export const likelyExpired = (validVotes: number, expiredVotes: number) =>
  expiredVotes >= 3 && expiredVotes > validVotes * 2;

export function distanceKm(a: [number, number], b: [number, number]) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export function slugify(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
