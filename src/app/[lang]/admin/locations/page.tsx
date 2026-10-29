import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { LocationManager } from "@/components/admin/LocationManager";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { CATEGORY_ICON } from "@/lib/constants";
import { getLocationAdmin, listLocationBrands } from "@/lib/data";
import { requireAdminPage } from "@/lib/session";

// ?brand=<slug> manages one brand's stores; otherwise the brand list, chains without any store first.
export default async function LocationsPage({ params, searchParams }: PageProps<"/[lang]/admin/locations">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await connection();
  await requireAdminPage(lang, "locations");
  const t = getDictionary(lang);
  const { brand: slug, q } = await searchParams;

  if (typeof slug === "string") {
    const page = await getLocationAdmin(db, slug);
    if (!page) notFound();
    return (
      <div className="flex flex-col gap-3">
        <Link href={`/${lang}/admin/locations`} className="text-sm text-muted hover:underline">{t.locations.back}</Link>
        <h2 className="text-xl font-bold">
          {CATEGORY_ICON[page.brand.category]}{" "}
          <Link href={`/${lang}/brands/${page.brand.slug}`} className="hover:underline">{page.brand.name}</Link>
        </h2>
        <LocationManager lang={lang} brandId={page.brand.id} icon={CATEGORY_ICON[page.brand.category]} locations={page.locations} />
      </div>
    );
  }

  const query = typeof q === "string" ? q.trim().slice(0, 80) : "";
  const brands = await listLocationBrands(db, query || undefined);
  return (
    <div className="flex flex-col gap-3">
      <form className="flex gap-2">
        <input className="input" name="q" defaultValue={query} placeholder={t.locations.searchBrands} maxLength={80} />
        <button type="submit" className="btn shrink-0">{t.places.search}</button>
      </form>
      {brands.length === 0 ? (
        <p className="text-sm text-muted">{t.admin.empty}</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {brands.map((b) => (
            <li key={b.id}>
              <Link href={`/${lang}/admin/locations?brand=${b.slug}`} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm hover:bg-neutral-soft">
                <span className="mr-auto font-medium">{CATEGORY_ICON[b.category]} {b.name}</span>
                <span className="tag">{t.kind[b.kind]}</span>
                {b.missing ? <span className="tag text-accent">{t.locations.missing}</span> : <span className="text-muted">{t.locations.counts(b.visible, b.hidden)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
