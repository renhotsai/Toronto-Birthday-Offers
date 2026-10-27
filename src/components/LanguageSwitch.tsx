"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { otherLocale, type Locale } from "@/i18n";

export function LanguageSwitch({ lang, label }: { lang: Locale; label: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const target = otherLocale(lang);
  const rest = pathname.replace(/^\/(en|zh)(?=\/|$)/, "");
  const qs = search.toString();
  return (
    <Link
      href={`/${target}${rest}${qs ? `?${qs}` : ""}`}
      className="btn"
      hrefLang={target}
      onClick={() => {
        document.cookie = `locale=${target}; path=/; max-age=31536000; samesite=lax`;
      }}
    >
      {label}
    </Link>
  );
}
