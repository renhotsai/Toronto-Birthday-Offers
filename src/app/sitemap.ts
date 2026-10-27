import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { db } from "@/db";
import { brands } from "@/db/schema";
import { LOCALES } from "@/i18n";
import { SITE } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const rows = await db.select({ slug: brands.slug, createdAt: brands.createdAt }).from(brands);
  const paths = ["", ...rows.map((b) => `/brands/${b.slug}`)];
  return paths.flatMap((p) =>
    LOCALES.map((l) => ({
      url: `${SITE.url}/${l}${p}`,
      alternates: { languages: Object.fromEntries(LOCALES.map((x) => [x === "zh" ? "zh-Hant" : x, `${SITE.url}/${x}${p}`])) },
    })),
  );
}
