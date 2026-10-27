import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { one } from "@/db/rows";
import { brands, locations, offers } from "@/db/schema";
import type { SeedOffer } from "../../data/seed-offers";
import { slugify } from "./status";

// Idempotent: brands are matched by slug and an offer is only added to a brand that has none,
// so re-running never duplicates or overwrites moderator edits.
export async function seedOffers(db: Db, seed: SeedOffer[]) {
  let added = 0;
  for (const s of seed) {
    const slug = slugify(s.brand);
    let [brand] = await db.select().from(brands).where(eq(brands.slug, slug));
    if (!brand) {
      brand = one(
        await db
          .insert(brands)
          .values({ slug, name: s.brand, kind: s.kind, category: s.category, website: s.website ?? null, osmName: s.osmName ?? null })
          .returning(),
      );
      if (s.location) {
        await db.insert(locations).values({ brandId: brand.id, ...s.location, name: s.brand, source: "manual" });
      }
    }
    const existing = await db.select({ id: offers.id }).from(offers).where(eq(offers.brandId, brand.id)).limit(1);
    if (existing.length) continue;
    await db.insert(offers).values({
      brandId: brand.id,
      title: s.title,
      titleZh: s.titleZh,
      details: s.details ?? "",
      conditions: s.conditions,
      window: s.window,
      windowNote: s.windowNote ?? null,
      membershipRequired: s.membershipRequired,
      officialUrl: s.officialUrl,
    });
    added++;
  }
  return added;
}
