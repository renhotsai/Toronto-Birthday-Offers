import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminTabs } from "@/components/admin/AdminTabs";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { getModerationCounts } from "@/lib/data";
import { getCurrentUser, hasRole } from "@/lib/session";

export const metadata: Metadata = { robots: { index: false } };

// Renders the tab bar for moderators. This is not the access check: each tab page calls requireAdminPage itself,
// and anyone else just gets the page (/admin shows them the forbidden message).
export default async function AdminLayout({ children, params }: LayoutProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await connection();
  const me = await getCurrentUser();
  if (!hasRole(me, "moderator")) return children;

  const t = getDictionary(lang);
  const counts = await getModerationCounts(db);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">{t.admin.title}</h1>
      <AdminTabs lang={lang} counts={counts} isAdmin={hasRole(me, "admin")} />
      {children}
    </div>
  );
}
