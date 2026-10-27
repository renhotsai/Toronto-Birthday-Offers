import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BrandLocations } from "@/components/BrandLocations";
import { OfferCard } from "@/components/OfferCard";
import { CATEGORY_ICON } from "@/lib/constants";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { getBrandPage, getUserVotes } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/[lang]/brands/[slug]">): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) return {};
  const page = await getBrandPage(db, slug);
  if (!page) return {};
  const first = page.offers[0];
  const title = lang === "zh" ? `${page.brand.name} 生日優惠` : `${page.brand.name} birthday freebie`;
  const description = first ? ((lang === "zh" && first.titleZh) || first.title) : undefined;
  return {
    title,
    description,
    alternates: { canonical: `/${lang}/brands/${slug}`, languages: { en: `/en/brands/${slug}`, "zh-Hant": `/zh/brands/${slug}` } },
    openGraph: { title, description },
  };
}

export default async function BrandPage({ params }: PageProps<"/[lang]/brands/[slug]">) {
  const { lang, slug } = await params;
  if (!hasLocale(lang)) notFound();
  await connection();
  const page = await getBrandPage(db, slug);
  if (!page) notFound();
  const t = getDictionary(lang);
  const me = await getCurrentUser();
  const myVotes = me ? await getUserVotes(db, me.id) : {};
  const { brand } = page;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/${lang}`} className="text-sm text-muted hover:underline">{t.brand.back}</Link>
        <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
          {CATEGORY_ICON[brand.category]} {brand.name}
        </h1>
        <div className="mt-2 flex flex-wrap gap-1.5 text-sm">
          <span className="tag">{t.category[brand.category]}</span>
          <span className="tag">{t.kind[brand.kind]}</span>
          {brand.website && (
            <a href={brand.website} target="_blank" rel="noopener noreferrer nofollow" className="tag underline">{new URL(brand.website).hostname.replace(/^www\./, "")} ↗</a>
          )}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t.brand.offers}</h2>
        {page.offers.map((o) => (
          <OfferCard key={o.id} offer={o} lang={lang} myVote={myVotes[o.id]} signedIn={!!me} linkBrand={false} />
        ))}
      </section>

      {brand.kind !== "online" && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t.brand.locations}</h2>
          <BrandLocations lang={lang} icon={CATEGORY_ICON[brand.category]} locations={page.locations} signedIn={!!me} />
        </section>
      )}
    </div>
  );
}
