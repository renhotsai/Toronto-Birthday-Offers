import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ModerationOffer } from "@/components/admin/AdminControls";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { listStaleOffers } from "@/lib/data";
import { requireAdminPage } from "@/lib/session";

export default async function StalePage({ params }: PageProps<"/[lang]/admin/stale">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await connection();
  await requireAdminPage(lang, "stale");
  const offers = await listStaleOffers(db);
  if (offers.length === 0) return <p className="text-sm text-muted">{getDictionary(lang).admin.empty}</p>;
  return <ul className="flex flex-col gap-3">{offers.map((o) => <ModerationOffer key={o.id} lang={lang} offer={o} />)}</ul>;
}
