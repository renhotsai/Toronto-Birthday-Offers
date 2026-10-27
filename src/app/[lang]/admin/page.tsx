import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { ADMIN_TABS } from "@/lib/constants";
import { getModerationCounts } from "@/lib/data";
import { getCurrentUser, hasRole } from "@/lib/session";

// Sends moderators to the first tab with pending items (or the review queue).
export default async function AdminPage({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await connection();
  const me = await getCurrentUser();
  if (!me) redirect(`/${lang}/sign-in?next=/${lang}/admin`);
  if (!hasRole(me, "moderator")) return <p className="card text-center">{getDictionary(lang).admin.forbidden}</p>;

  const counts = await getModerationCounts(db);
  const first = ADMIN_TABS.find((tab) => tab.count && counts[tab.count] > 0) ?? ADMIN_TABS[0];
  redirect(`/${lang}/admin/${first.key}`);
}
