"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getDictionary, type Locale } from "@/i18n";
import { ADMIN_TABS } from "@/lib/constants";
import type { ModerationCounts } from "@/lib/data";

// Client component: the admin layout doesn't re-render on navigation, so the active tab comes from the URL here.
export function AdminTabs({ lang, counts, isAdmin }: { lang: Locale; counts: ModerationCounts; isAdmin: boolean }) {
  const t = getDictionary(lang);
  const pathname = usePathname();
  const tabs = ADMIN_TABS.filter((tab) => tab.minRole !== "admin" || isAdmin);

  return (
    <nav aria-label={t.admin.tabs} className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-1 border-b border-border">
        {tabs.map((tab) => {
          const href = `/${lang}/admin/${tab.key}`;
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={tab.key}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px block whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}
              >
                {t.admin[tab.key]}
                {tab.count && <span className="text-muted"> ({counts[tab.count]})</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
