"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitOffer } from "@/app/actions";
import { getDictionary, type Locale } from "@/i18n";
import { BRAND_KINDS, CATEGORIES, CATEGORY_ICON, type BrandKind, type Category } from "@/lib/constants";
import { SITE } from "@/lib/site";
import { OfferFields, emptyOffer, type OfferDraft } from "./OfferFields";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl bg-neutral-soft" /> });

type BrandOption = { id: number; name: string; kind: BrandKind };

export function SubmitForm({ lang, brands }: { lang: Locale; brands: BrandOption[] }) {
  const t = getDictionary(lang);
  const router = useRouter();
  const [brandId, setBrandId] = useState<string>("");
  const [brand, setBrand] = useState({ name: "", kind: "local" as BrandKind, category: "food" as Category, website: "", address: "" });
  const [spot, setSpot] = useState<[number, number] | null>(null);
  const [offer, setOffer] = useState<OfferDraft>(emptyOffer);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const isNew = brandId === "new";

  const geocode = async () => {
    setError(null);
    const { south, west, north, east } = SITE.gtaBounds;
    const qs = new URLSearchParams({ q: brand.address, format: "json", limit: "1", countrycodes: "ca", viewbox: `${west},${north},${east},${south}`, bounded: "1" });
    try {
      const [hit] = await (await fetch(`https://nominatim.openstreetmap.org/search?${qs}`)).json();
      if (!hit) throw new Error();
      setSpot([Number(hit.lat), Number(hit.lon)]);
    } catch {
      setError(t.submit.notFound);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isNew && brand.kind === "local" && !spot) return setError(t.submit.needLocation);
    const payload = {
      ...(isNew
        ? { newBrand: { ...brand, lat: brand.kind === "online" ? undefined : spot?.[0], lng: brand.kind === "online" ? undefined : spot?.[1] } }
        : { brandId: Number(brandId) }),
      offer,
    };
    start(async () => {
      const res = await submitOffer(payload);
      if (res.ok) {
        router.push(`/${lang}/brands/${res.data.brandSlug}`);
      } else if (res.error === "unauthorized") {
        router.push(`/${lang}/sign-in?next=/${lang}/submit`);
      } else {
        setError(res.error === "rate_limited" ? t.errors.rateLimited : [t.errors.generic, ...(res.issues ?? [])].join(" "));
      }
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="card flex flex-col gap-3">
        <label className="label">
          {t.submit.existingBrand} *
          <select className="input" required value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="" disabled>{t.submit.pickBrand}</option>
            <option value="new">{t.submit.newBrand}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        {isNew && (
          <>
            <label className="label">
              {t.submit.brandName} *
              <input className="input" required maxLength={80} value={brand.name} onChange={(e) => setBrand({ ...brand, name: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="label">
                {t.submit.brandKind} *
                <select className="input" value={brand.kind} onChange={(e) => setBrand({ ...brand, kind: e.target.value as BrandKind })}>
                  {BRAND_KINDS.map((k) => <option key={k} value={k}>{t.kind[k]}</option>)}
                </select>
              </label>
              <label className="label">
                {t.submit.category} *
                <select className="input" value={brand.category} onChange={(e) => setBrand({ ...brand, category: e.target.value as Category })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_ICON[c]} {t.category[c]}</option>)}
                </select>
              </label>
            </div>
            <label className="label">
              {t.submit.website}
              <input className="input" type="url" maxLength={500} placeholder="https://" value={brand.website} onChange={(e) => setBrand({ ...brand, website: e.target.value })} />
            </label>
            {brand.kind !== "online" && (
              <div className="flex flex-col gap-2">
                <label className="label">
                  {t.submit.address}{brand.kind === "local" ? " *" : ""}
                  <div className="flex gap-2">
                    <input className="input" maxLength={200} value={brand.address} onChange={(e) => setBrand({ ...brand, address: e.target.value })} />
                    <button type="button" className="btn shrink-0" onClick={geocode} disabled={!brand.address.trim()}>{t.submit.findAddress}</button>
                  </div>
                </label>
                <p className="text-xs text-muted">{t.submit.pickOnMap}</p>
                <MapView points={[]} picked={spot} onPick={(lat, lng) => setSpot([lat, lng])} className="h-64" />
              </div>
            )}
          </>
        )}
      </fieldset>

      <fieldset className="card flex flex-col gap-3">
        <OfferFields lang={lang} value={offer} onChange={setOffer} />
      </fieldset>

      {error && <p className="text-sm text-accent" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary self-end px-6 py-2.5" disabled={pending}>
        {pending ? t.submit.submitting : t.submit.submit}
      </button>
    </form>
  );
}
