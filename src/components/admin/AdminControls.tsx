"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { hideOffer, mergeOffer, resolveReport, setUserRole, updateOffer, verifyOffer, type ActionResult } from "@/app/actions";
import { getDictionary, type Locale } from "@/i18n";
import { ROLES, type ReportKind, type Role } from "@/lib/constants";
import type { OfferSummary } from "@/lib/data";
import { hostname, StatusBadge } from "../OfferCard";
import { OfferFields, type OfferDraft } from "../OfferFields";

function useAction() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<ActionResult<unknown>>) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res.ok) router.refresh();
      else setError([res.error, ...(res.issues ?? [])].join(" "));
    });
  return { pending, error, run };
}

const toDraft = (o: OfferSummary): OfferDraft => ({
  title: o.title,
  titleZh: o.titleZh ?? "",
  details: o.details,
  detailsZh: o.detailsZh ?? "",
  conditions: o.conditions,
  window: o.window,
  windowNote: o.windowNote ?? "",
  membershipRequired: o.membershipRequired,
  officialUrl: o.officialUrl,
});

export function ModerationOffer({ lang, offer }: { lang: Locale; offer: OfferSummary }) {
  const t = getDictionary(lang);
  const { pending, error, run } = useAction();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => toDraft(offer));
  const [mergeId, setMergeId] = useState("");

  return (
    <li className="card flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">#{offer.id}</span>
        <Link href={`/${lang}/brands/${offer.brandSlug}`} className="font-bold hover:underline">{offer.brandName}</Link>
        <StatusBadge verifiedAt={offer.verifiedAt} lang={lang} />
        <span className="text-muted">{t.admin.votes(offer.validVotes, offer.expiredVotes)}</span>
        {offer.sharedBy && <span className="text-muted">· {t.offer.sharedBy(offer.sharedBy)}</span>}
      </div>
      <p className="font-semibold">{offer.title}{offer.titleZh ? ` / ${offer.titleZh}` : ""}</p>
      {offer.conditions && <p className="text-sm text-muted">{offer.conditions}</p>}
      <a href={offer.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-accent underline">
        {hostname(offer.officialUrl)} ↗
      </a>

      {editing && (
        <form
          className="flex flex-col gap-3 border-t border-border pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateOffer(offer.id, draft));
            setEditing(false);
          }}
        >
          <OfferFields lang={lang} value={draft} onChange={setDraft} />
          <button type="submit" className="btn btn-primary self-start" disabled={pending}>✓ Save</button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => verifyOffer(offer.id))}>✓ {t.admin.verify}</button>
        <button type="button" className="btn" disabled={pending} onClick={() => setEditing((v) => !v)}>✎ Edit</button>
        <button type="button" className="btn" disabled={pending} onClick={() => run(() => hideOffer(offer.id))}>🚫 {t.admin.hide}</button>
        <span className="flex items-center gap-1 text-sm">
          {t.admin.mergeInto}
          <input className="input w-20 py-1" inputMode="numeric" value={mergeId} onChange={(e) => setMergeId(e.target.value.replace(/\D/g, ""))} />
          <button type="button" className="btn" disabled={pending || !mergeId} onClick={() => run(() => mergeOffer(offer.id, Number(mergeId)))}>{t.admin.merge}</button>
        </span>
      </div>
      {error && <p className="text-sm text-accent" role="alert">{error}</p>}
    </li>
  );
}

export function ReportRow({
  lang, report,
}: {
  lang: Locale;
  report: { id: number; kind: ReportKind; note: string | null; locationAddress: string | null; locationName: string | null; brandName: string; brandSlug: string; reporter: string };
}) {
  const t = getDictionary(lang);
  const { pending, error, run } = useAction();
  return (
    <li className="card flex flex-col gap-2 text-sm">
      <p>
        <Link href={`/${lang}/brands/${report.brandSlug}`} className="font-bold hover:underline">{report.brandName}</Link>{" "}
        · {report.locationAddress ?? report.locationName ?? "—"}
      </p>
      <p><span className="tag">{t.brand.reportKinds[report.kind]}</span> <span className="text-muted">— {report.reporter}</span></p>
      {report.note && <p className="text-muted">{report.note}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" disabled={pending} onClick={() => run(() => resolveReport(report.id, true))}>{t.admin.applyReport}</button>
        <button type="button" className="btn" disabled={pending} onClick={() => run(() => resolveReport(report.id, false))}>{t.admin.resolve}</button>
      </div>
      {error && <p className="text-accent" role="alert">{error}</p>}
    </li>
  );
}

export function RoleSelect({ userId, role, disabled }: { userId: string; role: Role; disabled: boolean }) {
  const { pending, error, run } = useAction();
  return (
    <>
      <select className="chip" value={role} disabled={disabled || pending} onChange={(e) => run(() => setUserRole(userId, e.target.value))}>
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {error && <span className="text-xs text-accent">{error}</span>}
    </>
  );
}
