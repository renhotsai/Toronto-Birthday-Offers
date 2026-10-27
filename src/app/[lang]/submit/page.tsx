import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SubmitForm } from "@/components/SubmitForm";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { listBrandsForPicker } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { robots: { index: false } };

export default async function SubmitPage({ params }: PageProps<"/[lang]/submit">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const me = await getCurrentUser();
  if (!me) redirect(`/${lang}/sign-in?next=/${lang}/submit`);
  const t = getDictionary(lang);
  const brands = await listBrandsForPicker(db);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-bold">{t.submit.title}</h1>
      <p className="text-sm text-muted">{t.submit.intro}</p>
      <SubmitForm lang={lang} brands={brands} />
    </div>
  );
}
