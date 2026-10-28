"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { addBranch, getBrandBranches, previewChainStores, submitOffer } from "@/app/actions";
import { getDictionary, type Locale } from "@/i18n";
import { BRAND_KINDS, CATEGORIES, CATEGORY_ICON, type BrandKind, type Category } from "@/lib/constants";
import type { Place } from "@/lib/nominatim";
import type { BrandPreview } from "@/lib/osm";
import { actionError } from "./action-error";
import { storePopup, type MapPoint } from "./map-utils";
import { OfferFields, emptyOffer, type OfferDraft } from "./OfferFields";
import { PlaceSearch } from "./PlaceSearch";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="h-64 animate-pulse rounded-2xl bg-neutral-soft" /> });

type BrandOption = { id: number; name: string; kind: BrandKind; category: Category };
type Store = { lat: number; lng: number; name: string | null; address: string | null };

const toPoints = (stores: Store[], icon: string): MapPoint[] =>
  stores.map((s, i) => ({ id: i, lat: s.lat, lng: s.lng, icon, popupHtml: storePopup(s.name, s.address) }));

/**
 * Sharing an offer: type the brand, check its stores on the map, describe the offer. A store that's missing from
 * the map is added by searching its address (only search results can be added; the server looks them up again).
 */
export function SubmitForm({ lang, brands }: { lang: Locale; brands: BrandOption[] }) {
  const t = getDictionary(lang);
  const router = useRouter();
  const [brandName, setBrandName] = useState("");
  const [brand, setBrand] = useState({ kind: "chain" as BrandKind, category: "food" as Category, website: "" });
  const [offer, setOffer] = useState<OfferDraft>(emptyOffer);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const existing = useMemo(() => {
    const key = brandName.trim().toLowerCase();
    return key ? brands.find((b) => b.name.toLowerCase() === key) ?? null : null;
  }, [brands, brandName]);
  const isNew = !existing && brandName.trim().length > 0;
  const kind = existing?.kind ?? brand.kind;
  const icon = CATEGORY_ICON[existing?.category ?? brand.category];

  // Existing brand: its stores on the map (keyed by brand, so a stale answer for another brand is ignored).
  const [loaded, setLoaded] = useState<{ brandId: number; stores: Store[] } | null>(null);
  const branches = existing && loaded?.brandId === existing.id ? loaded.stores : null;
  const loadBranches = async (brandId: number) => {
    const res = await getBrandBranches(brandId);
    if (res.ok) setLoaded({ brandId, stores: res.data });
  };
  useEffect(() => {
    if (!existing || existing.kind === "online") return;
    const brandId = existing.id;
    void getBrandBranches(brandId).then((res) => {
      if (res.ok) setLoaded({ brandId, stores: res.data });
    });
  }, [existing]);

  // New chain: its OpenStreetMap stores, which the user confirms.
  const [osm, setOsm] = useState<BrandPreview | "none" | null>(null);
  const [osmPending, setOsmPending] = useState(false);
  const [useOsm, setUseOsm] = useState(false);
  const findOsm = async () => {
    setOsmPending(true);
    const res = await previewChainStores(brandName);
    setOsmPending(false);
    // Overpass down or slow counts as "not found": the user adds their store by address instead.
    setOsm(res.ok && res.data.stores.length ? res.data : "none");
  };

  // A store found by address search.
  const [results, setResults] = useState<Place[]>([]);
  const [picked, setPicked] = useState<Place | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [added, setAdded] = useState(false);

  // Whatever was found or picked belongs to the brand (and type) it was found for.
  const resetStores = () => {
    setOsm(null);
    setUseOsm(false);
    setResults([]);
    setPicked(null);
    setShowSearch(false);
    setAdded(false);
  };

  const addToExisting = () =>
    start(async () => {
      if (!existing || !picked) return;
      setError(null);
      const res = await addBranch({ brandId: existing.id, ref: picked.ref });
      if (!res.ok) return setError(actionError(t, res));
      setAdded(true);
      setPicked(null);
      setResults([]);
      await loadBranches(existing.id);
    });

  const osmStores = osm && osm !== "none" ? osm.stores : null;
  // A new chain adds its store by address only when OSM has nothing (or the user didn't recognise what it found).
  const searching = showSearch || (isNew && (kind === "local" || (kind === "chain" && (osm === "none" || (osmStores && !useOsm)))));
  const points = useMemo(
    () => [...toPoints((existing ? branches : osmStores) ?? [], icon), ...toPoints(picked ? [] : results, "📍")],
    [existing, branches, osmStores, results, picked, icon],
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isNew && kind === "local" && !picked) return setError(t.submit.needLocation);
    const payload = {
      ...(existing
        ? { brandId: existing.id, branchRef: picked?.ref } // a picked store not yet added goes in with the offer
        : {
            newBrand: { name: brandName, ...brand, useOsmStores: kind === "chain" && useOsm },
            branchRef: kind === "online" || (kind === "chain" && useOsm) ? undefined : picked?.ref,
          }),
      offer,
    };
    start(async () => {
      const res = await submitOffer(payload);
      if (res.ok) router.push(`/${lang}/brands/${res.data.brandSlug}`);
      else if (res.error === "unauthorized") router.push(`/${lang}/sign-in?next=/${lang}/submit`);
      else setError(actionError(t, res));
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="card flex flex-col gap-3">
        <label className="label">
          {t.submit.brand} *
          <input
            className="input"
            required
            maxLength={80}
            list="brand-options"
            placeholder={t.submit.brandPh}
            value={brandName}
            onChange={(e) => {
              setBrandName(e.target.value);
              resetStores();
            }}
          />
          <datalist id="brand-options">
            {brands.map((b) => <option key={b.id} value={b.name} />)}
          </datalist>
        </label>

        {isNew && (
          <>
            <p className="text-sm text-muted">{t.submit.newBrandHint}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="label">
                {t.submit.brandKind} *
                <select
                  className="input"
                  value={brand.kind}
                  onChange={(e) => {
                    setBrand({ ...brand, kind: e.target.value as BrandKind });
                    resetStores();
                  }}
                >
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
            {kind === "chain" && osm === null && brandName.trim().length >= 2 && (
              <button type="button" className="btn self-start" onClick={findOsm} disabled={osmPending}>
                {osmPending ? t.submit.findingOsm : t.submit.findOsm}
              </button>
            )}
            {kind === "chain" && osm && osm !== "none" && (
              <>
                <p className="text-sm">{t.submit.osmFound(osm.stores.length)}</p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={useOsm} onChange={(e) => setUseOsm(e.target.checked)} />
                  {t.submit.osmConfirm}
                </label>
              </>
            )}
            {kind === "chain" && osm === "none" && <p className="text-sm text-muted">{t.submit.osmNone}</p>}
          </>
        )}

        {(existing || isNew) && kind !== "online" && (
          <div className="flex flex-col gap-2">
            {existing && branches && <p className="text-sm text-muted">{branches.length ? t.submit.branches(branches.length) : t.submit.noBranches}</p>}
            {(points.length > 0 || picked || searching) && <MapView points={points} picked={picked ? [picked.lat, picked.lng] : null} fitAll className="h-72" />}
            {existing && !showSearch && (
              <button type="button" className="self-start text-sm text-accent underline" onClick={() => setShowSearch(true)}>{t.submit.missingStore}</button>
            )}
            {searching && (
              <>
                {isNew && <span className="label">{t.submit.storeLocation}{kind === "local" ? " *" : ""}</span>}
                <PlaceSearch lang={lang} selected={picked?.ref ?? null} onResults={setResults} onSelect={setPicked} />
                {existing && picked && (
                  <button type="button" className="btn self-start" onClick={addToExisting} disabled={pending}>＋ {t.submit.addStore}</button>
                )}
                {added && <p className="text-sm text-ok">{t.submit.storeAdded}</p>}
              </>
            )}
          </div>
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
