import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { ModerationOffer, ReportRow, RoleSelect } from "@/components/admin/AdminControls";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { getModerationQueues, listUsers } from "@/lib/data";
import { getCurrentUser, hasRole } from "@/lib/session";

export const metadata: Metadata = { robots: { index: false } };

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title} <span className="text-muted">({count})</span></h2>
      {count === 0 ? <p className="text-sm text-muted">{empty}</p> : children}
    </section>
  );
}

export default async function AdminPage({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await connection();
  const t = getDictionary(lang);
  const me = await getCurrentUser();
  if (!me) redirect(`/${lang}/sign-in?next=/${lang}/admin`);
  if (!hasRole(me, "moderator")) return <p className="card text-center">{t.admin.forbidden}</p>;

  const isAdmin = hasRole(me, "admin");
  const [queues, users] = await Promise.all([getModerationQueues(db), isAdmin ? listUsers(db) : Promise.resolve([])]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold">{t.admin.title}</h1>

      <Section title={t.admin.queue} count={queues.unverified.length} empty={t.admin.empty}>
        <ul className="flex flex-col gap-3">{queues.unverified.map((o) => <ModerationOffer key={o.id} lang={lang} offer={o} />)}</ul>
      </Section>

      <Section title={t.admin.stale} count={queues.stale.length} empty={t.admin.empty}>
        <ul className="flex flex-col gap-3">{queues.stale.map((o) => <ModerationOffer key={o.id} lang={lang} offer={o} />)}</ul>
      </Section>

      <Section title={t.admin.reports} count={queues.reports.length} empty={t.admin.empty}>
        <ul className="flex flex-col gap-3">{queues.reports.map((r) => <ReportRow key={r.id} lang={lang} report={r} />)}</ul>
      </Section>

      {isAdmin && (
        <Section title={t.admin.users} count={users.length} empty={t.admin.empty}>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {users.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
                <span className="mr-auto">{u.name} <span className="text-muted">{u.email}</span></span>
                <RoleSelect userId={u.id} role={u.role} disabled={u.id === me.id} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
