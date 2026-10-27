import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "../globals.css";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { SignOutButton } from "@/components/SignOutButton";
import { LOCALES, getDictionary, hasLocale, htmlLang } from "@/i18n";
import { getCurrentUser, hasRole } from "@/lib/session";
import { SITE } from "@/lib/site";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!hasLocale(lang)) return {};
  const t = getDictionary(lang);
  return {
    metadataBase: new URL(SITE.url),
    title: { default: `${SITE.name[lang]} – ${t.home.title}`, template: `%s · ${SITE.name[lang]}` },
    description: t.home.subtitle,
    alternates: { languages: { en: "/en", "zh-Hant": "/zh" } },
    openGraph: { siteName: SITE.name[lang], locale: lang === "zh" ? "zh_TW" : "en_CA", type: "website" },
    icons: { icon: `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${SITE.emoji}</text></svg>` },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fffaf5" },
    { media: "(prefers-color-scheme: dark)", color: "#1b1716" },
  ],
};

export default async function LangLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  const t = getDictionary(lang);
  const me = await getCurrentUser();

  return (
    <html lang={htmlLang(lang)}>
      <body className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-[1000] border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-1.5 px-4 py-2.5 sm:gap-2">
            <Link href={`/${lang}`} className="mr-auto min-w-0 truncate text-base font-bold sm:text-lg" aria-label={SITE.name[lang]}>
              {SITE.emoji} <span className="hidden sm:inline">{SITE.name[lang]}</span>
            </Link>
            {hasRole(me, "moderator") && (
              <Link href={`/${lang}/admin`} className="btn" aria-label={t.nav.admin}>⚙<span className="hidden sm:inline">{t.nav.admin}</span></Link>
            )}
            <LanguageSwitch lang={lang} label={t.nav.language} />
            <Link href={`/${lang}/submit`} className="btn btn-primary">{t.nav.submit}</Link>
            {me ? <SignOutButton label={t.nav.signOut} /> : <Link href={`/${lang}/sign-in`} className="btn">{t.nav.signIn}</Link>}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5">{children}</main>
        <footer className="border-t border-border px-4 py-5 text-center text-xs text-muted">
          <p>{t.footer.disclaimer}</p>
          <p className="mt-1">{t.footer.osm}</p>
        </footer>
      </body>
    </html>
  );
}
