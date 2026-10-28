import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ReportRow } from "@/components/admin/AdminControls";
import { db } from "@/db";
import { getDictionary, hasLocale } from "@/i18n";
import { listOpenReports } from "@/lib/data";
import { requireAdminPage } from "@/lib/session";

export default async function ReportsPage({ params }: PageProps<"/[lang]/admin/reports">) {
  const { lang } = await params;
  if (!hasLocale(lang)) notFound();
  await connection();
  await requireAdminPage(lang, "reports");
  const reports = await listOpenReports(db);
  if (reports.length === 0) return <p className="text-sm text-muted">{getDictionary(lang).admin.empty}</p>;
  return <ul className="flex flex-col gap-3">{reports.map((r) => <ReportRow key={r.id} lang={lang} report={r} />)}</ul>;
}
