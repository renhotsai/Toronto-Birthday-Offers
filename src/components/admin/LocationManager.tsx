"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addLocation, removeLocation, unhideLocation, updateLocation, type ActionResult } from "@/app/actions";
import { getDictionary, type Locale } from "@/i18n";
import { REPORT_KINDS, type ReportKind } from "@/lib/constants";
import type { Place } from "@/lib/nominatim";
import { storePopup } from "../map-utils";
import { PlaceSearch } from "../PlaceSearch";
import { actionError } from "../action-error";

const MapView = dynamic(() => import("../MapView"), { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-2xl bg-neutral-soft" /> });

type Row = {
  id: number;
  lat: number;
  lng: number;
  name: string | null;
  address: string | null;
  source: "osm" | "manual";
  osmId: string | null;
  hidden: boolean;
  hiddenReason: ReportKind | null;
  createdBy: string | null;
  reports: number;
};

type Draft = { id: number | null; pin: [number, number] | null; name: string; address: string };
const emptyDraft: Draft = { id: null, pin: null, name: "", address: "" };

/** Moderators add (search or map click), move, edit, hide and delete one brand's stores. */
export function LocationManager({ lang, brandId, icon, locations }: { lang: Locale; brandId: number; icon: string; locations: Row[] }) {
  const t = getDictionary(lang);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [results, setResults] = useState<Place[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) return setError(actionError(t, res));
      after?.();
      router.refresh();
    });

  const rows = locations.filter((l) => showHidden || !l.hidden);
  const points = useMemo(
    () => [
      ...locations.filter((l) => !l.hidden && l.id !== draft.id).map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, icon, popupHtml: storePopup(l.name, l.address) })),
      ...results.filter((p) => p.ref !== picked).map((p, i) => ({ id: -1 - i, lat: p.lat, lng: p.lng, icon: "📍", popupHtml: storePopup(p.name, p.address ?? p.label) })),
    ],
    [locations, draft.id, results, picked, icon],
  );

  const reset = () => {
    setDraft(emptyDraft);
    setResults([]);
    setPicked(null);
  };
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.pin) return setError(t.locations.needPin);
    const input = { lat: draft.pin[0], lng: draft.pin[1], name: draft.name, address: draft.address };
    run(() => (draft.id ? updateLocation(draft.id, input) : addLocation(brandId, input)), reset);
  };
  const remove = (l: Row, reason: ReportKind | null) => {
    if (!reason && !confirm(t.locations.removeConfirm)) return;
    run(
      () => removeLocation({ locationId: l.id, reason }),
      () => {
        if (draft.id === l.id) reset();
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <MapView
        points={points}
        picked={draft.pin}
        onPick={(lat, lng) => setDraft((d) => ({ ...d, pin: [lat, lng] }))}
        draggable
        fitAll
        className="h-96"
      />

      <form onSubmit={save} className="card flex flex-col gap-3">
        <h3 className="font-semibold">{draft.id ? t.locations.editing : t.locations.add}</h3>
        <p className="text-xs text-muted">{t.locations.pinHint}</p>
        <PlaceSearch
          lang={lang}
          selected={picked}
          onResults={setResults}
          onSelect={(p) => {
            setPicked(p.ref);
            setDraft((d) => ({ ...d, pin: [p.lat, p.lng], name: p.name ?? d.name, address: p.address ?? p.label }));
          }}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="label">
            {t.locations.name}
            <input className="input" maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="label">
            {t.locations.address}
            <input className="input" maxLength={200} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} />
          </label>
        </div>
        {draft.pin && <p className="text-xs text-muted">{draft.pin[0].toFixed(5)}, {draft.pin[1].toFixed(5)}</p>}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending}>✓ {t.locations.save}</button>
          {(draft.id || draft.pin) && <button type="button" className="btn" onClick={reset}>{t.locations.cancel}</button>}
        </div>
        {error && <p className="text-sm text-accent" role="alert">{error}</p>}
      </form>

      <label className="flex items-center gap-2 self-start text-sm">
        <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
        {t.locations.showHidden}
      </label>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t.locations.none}</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-surface">
          {rows.map((l) => {
            // OSM stores and reported ones are hidden, not deleted (see removeLocation), so they need a reason.
            const needsReason = !!l.osmId || l.reports > 0;
            return (
              <li key={l.id} className={`flex flex-wrap items-center gap-2 px-4 py-2.5 text-sm ${draft.id === l.id ? "bg-neutral-soft" : ""}`}>
                <span className={`mr-auto ${l.hidden ? "text-muted line-through" : ""}`}>
                  {l.name && <strong>{l.name} · </strong>}
                  {l.address ?? `${l.lat.toFixed(4)}, ${l.lng.toFixed(4)}`}
                </span>
                <span className="text-xs text-muted">
                  {t.locations.source[l.source]}
                  {l.createdBy && ` · ${t.locations.addedBy(l.createdBy)}`}
                  {l.reports > 0 && ` · ${t.locations.reports(l.reports)}`}
                </span>
                {l.hidden ? (
                  <>
                    <span className="tag">{t.locations.hidden}{l.hiddenReason ? `: ${t.brand.reportKinds[l.hiddenReason]}` : ""}</span>
                    <button type="button" className="chip text-xs" disabled={pending} onClick={() => run(() => unhideLocation(l.id))}>{t.locations.unhide}</button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="chip text-xs"
                      disabled={pending}
                      onClick={() => {
                        setResults([]);
                        setPicked(null);
                        setDraft({ id: l.id, pin: [l.lat, l.lng], name: l.name ?? "", address: l.address ?? "" });
                      }}
                    >
                      ✎ {t.locations.edit}
                    </button>
                    {needsReason ? (
                      <select className="chip text-xs" disabled={pending} value="" aria-label={t.locations.hideReason} onChange={(e) => remove(l, e.target.value as ReportKind)}>
                        <option value="">🚫 {t.locations.hideReason}</option>
                        {REPORT_KINDS.map((k) => <option key={k} value={k}>{t.brand.reportKinds[k]}</option>)}
                      </select>
                    ) : (
                      <button type="button" className="chip text-xs" disabled={pending} onClick={() => remove(l, null)}>🗑 {t.locations.remove}</button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
