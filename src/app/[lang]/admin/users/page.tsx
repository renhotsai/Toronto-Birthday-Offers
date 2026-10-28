import { notFound } from "next/navigation";
import { connection } from "next/server";
import { RoleSelect } from "@/components/admin/AdminControls";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { listUsers } from "@/lib/data";
import { requireAdminPage } from "@/lib/session";

export default async function UsersPage({ params }: PageProps<"/[lang]/admin/users">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await connection();
  const me = await requireAdminPage(lang, "users");
  const users = await listUsers(db);
  if (users.length === 0) return <p className="text-sm text-muted">{getDictionary(lang).admin.empty}</p>;
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
      {users.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm">
          <span className="mr-auto">{u.name} <span className="text-muted">{u.email}</span></span>
          <RoleSelect userId={u.id} role={u.role} disabled={u.id === me.id} />
        </li>
      ))}
    </ul>
  );
}
