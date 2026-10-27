"use client";

import { getDictionary, type Locale } from "@/i18n";
import { WINDOWS, type Window } from "@/lib/constants";

export type OfferDraft = {
  title: string;
  titleZh: string;
  details: string;
  detailsZh: string;
  conditions: string;
  window: Window;
  windowNote: string;
  membershipRequired: boolean;
  officialUrl: string;
};

export const emptyOffer: OfferDraft = {
  title: "", titleZh: "", details: "", detailsZh: "", conditions: "", window: "day", windowNote: "", membershipRequired: true, officialUrl: "",
};

// Shared by the public submit form and the moderator edit form.
export function OfferFields({ lang, value, onChange }: { lang: Locale; value: OfferDraft; onChange: (v: OfferDraft) => void }) {
  const t = getDictionary(lang);
  const set = <K extends keyof OfferDraft>(k: K, v: OfferDraft[K]) => onChange({ ...value, [k]: v });
  return (
    <>
      <label className="label">
        {t.submit.offerTitle} *
        <input className="input" required minLength={3} maxLength={120} value={value.title} placeholder={t.submit.offerTitlePh} onChange={(e) => set("title", e.target.value)} />
      </label>
      <label className="label">
        {t.submit.offerTitleZh}
        <input className="input" maxLength={120} value={value.titleZh} onChange={(e) => set("titleZh", e.target.value)} />
      </label>
      <label className="label">
        {t.submit.details}
        <textarea className="input" rows={2} maxLength={1000} value={value.details} onChange={(e) => set("details", e.target.value)} />
      </label>
      <label className="label">
        {t.submit.detailsZh}
        <textarea className="input" rows={2} maxLength={1000} value={value.detailsZh} onChange={(e) => set("detailsZh", e.target.value)} />
      </label>
      <label className="label">
        {t.submit.conditions}
        <textarea className="input" rows={2} maxLength={500} value={value.conditions} placeholder={t.submit.conditionsPh} onChange={(e) => set("conditions", e.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="label">
          {t.submit.window} *
          <select className="input" value={value.window} onChange={(e) => set("window", e.target.value as Window)}>
            {WINDOWS.map((w) => <option key={w} value={w}>{t.window[w]}</option>)}
          </select>
        </label>
        <label className="label">
          {t.submit.windowNote}
          <input className="input" maxLength={120} value={value.windowNote} placeholder={t.submit.windowNotePh} onChange={(e) => set("windowNote", e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={value.membershipRequired} onChange={(e) => set("membershipRequired", e.target.checked)} />
        {t.submit.membership}
      </label>
      <label className="label">
        {t.submit.officialUrl} *
        <input className="input" type="url" required maxLength={500} placeholder="https://" value={value.officialUrl} onChange={(e) => set("officialUrl", e.target.value)} />
      </label>
    </>
  );
}
