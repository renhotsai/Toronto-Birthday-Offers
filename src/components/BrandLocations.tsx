"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { reportLocation } from "@/app/actions";
import { getDictionary, type Locale } from "@/i18n";
import { REPORT_KINDS, type ReportKind } from "@/lib/constants";
import { escapeHtml } from "./map-utils";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-2xl bg-neutral-soft" /> });

type Loc = { id: number; lat: number; lng: number; name: string | null; address: string | null; hidden: boolean; hiddenReason: ReportKind | null };

export function BrandLocations({ lang, icon, locations, signedIn }: { lang: Locale; icon: string; locations: Loc[]; signedIn: boolean }) {
  const t = getDictionary(lang);
  const visible = locations.filter((l) => !l.hidden);
  const points = useMemo(
    () =>
      locations
        .filter((l) => !l.hidden)
        .map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, icon, popupHtml: escapeHtml(l.address ?? l.name ?? "") })),
    [locations, icon],
  );

  if (!locations.length) return <p className="text-muted">{t.brand.noLocations}</p>;

  return (
    <div className="flex flex-col gap-3">
      {visible.length > 0 && <MapView points={points} className="h-80" />}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
        {locations.map((l) => (
          <li key={l.id} className={`flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm ${l.hidden ? "text-muted line-through" : ""}`}>
            <span className="mr-auto">📍 {l.address ?? l.name ?? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`}</span>
            {l.hidden ? (
              <span className="text-xs no-underline">{l.hiddenReason ? t.brand.reportKinds[l.hiddenReason] : ""}</span>
            ) : signedIn ? (
              <ReportButton lang={lang} locationId={l.id} />
            ) : (
              <Link href={`/${lang}/sign-in`} className="text-xs text-muted underline">{t.brand.report}</Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReportButton({ lang, locationId }: { lang: Locale; locationId: number }) {
  const t = getDictionary(lang);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  if (done) return <span className="text-xs text-ok">{t.brand.reported}</span>;
  return (
    <select
      className="chip text-xs"
      disabled={pending}
      value=""
      aria-label={t.brand.report}
      onChange={(e) => {
        const kind = e.target.value as ReportKind;
        start(async () => {
          const res = await reportLocation({ locationId, kind });
          if (res.ok) setDone(true);
        });
      }}
    >
      <option value="">⚑ {t.brand.report}</option>
      {REPORT_KINDS.map((k) => <option key={k} value={k}>{t.brand.reportKinds[k]}</option>)}
    </select>
  );
}
