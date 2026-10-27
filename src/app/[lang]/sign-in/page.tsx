import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SignInForm } from "@/components/SignInForm";
import { getDictionary, hasLocale } from "@/i18n";
import { googleEnabled } from "@/lib/auth";

export const metadata: Metadata = { robots: { index: false } };

export default async function SignInPage({ params, searchParams }: PageProps<"/[lang]/sign-in">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const { next } = await searchParams;
  // Only allow same-site relative redirects.
  const target = typeof next === "string" && /^\/(en|zh)(\/|$)/.test(next) ? next : `/${lang}`;
  const t = getDictionary(lang).signIn;
  return (
    <div className="card mx-auto mt-6 flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-bold">{t.title}</h1>
      <p className="text-sm text-muted">{t.intro}</p>
      <SignInForm lang={lang} googleEnabled={googleEnabled} next={target} />
    </div>
  );
}
