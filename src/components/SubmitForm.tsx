"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { addBranch, findBrandStores, getBrandBranches, previewChainStores, submitOffer } from "@/app/actions";
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
// What searching OpenStreetMap did: saved stores (existing brand), found stores (new brand), nothing, or failed.
type OsmOutcome = { kind: "added"; count: number } | { kind: "found"; preview: BrandPreview } | { kind: "none" } | { kind: "unavailable" } | null;

// The brand the user searched for, and what we know about its stores.
type Searched =
  | { kind: "existing"; brand: BrandOption; stores: Store[]; osm: OsmOutcome }
  | { kind: "new"; name: string; osm: OsmOutcome };

const NO_STORES: Store[] = [];

const toPoints = (stores: Store[], icon: string): MapPoint[] =>
  stores.map((s, i) => ({ id: i, lat: s.lat, lng: s.lng, icon, popupHtml: storePopup(s.name, s.address) }));

/**
 * Sharing an offer: search the brand, check its stores on the map, describe the offer.
 * Searching records what it finds: a brand with stores in our database shows them; a chain without any gets the
 * stores OpenStreetMap lists (saved right away for an existing brand, with the offer for a new one). A store that's
 * still missing is added by searching its address (only search results; the server looks them up again).
 */
export function SubmitForm({ lang, brands }: { lang: Locale; brands: BrandOption[] }) {
  const t = getDictionary(lang);
  const router = useRouter();
  const [brandName, setBrandName] = useState("");
  const [brand, setBrand] = useState({ kind: "chain" as BrandKind, category: "food" as Category, website: "" });
  const [offer, setOffer] = useState<OfferDraft>(emptyOffer);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [searched, setSearched] = useState<Searched | null>(null);
  const [searching, setSearching] = useState(false);
  // A store found by address search.
  const [results, setResults] = useState<Place[]>([]);
  const [picked, setPicked] = useState<Place | null>(null);
  const [showAddress, setShowAddress] = useState(false);
  const [added, setAdded] = useState(false);

  const existing = searched?.kind === "existing" ? searched.brand : null;
  const isNew = searched?.kind === "new";
  const kind = existing?.kind ?? brand.kind;
  const icon = CATEGORY_ICON[existing?.category ?? brand.category];
  const osm = searched?.osm ?? null;
  const osmStores = isNew && osm?.kind === "found" ? osm.preview.stores : null;
  const useOsm = isNew && kind === "chain" && !!osmStores;

  const changeBrandName = (value: string) => {
    setBrandName(value);
    setSearched(null);
    setResults([]);
    setPicked(null);
    setShowAddress(false);
    setAdded(false);
  };

  const searchBrand = async () => {
    const name = brandName.trim();
    if (!name || searching) return;
    setError(null);
    setSearching(true);
    try {
      const match = brands.find((b) => b.name.toLowerCase() === name.toLowerCase());
      if (match) {
        if (match.kind === "online") return setSearched({ kind: "existing", brand: match, stores: [], osm: null });
        const res = await findBrandStores(match.id);
        if (!res.ok) return setError(actionError(t, res));
        const { stores, osm: result } = res.data;
        const outcome: OsmOutcome =
          result === null ? null : result === "unavailable" ? { kind: "unavailable" } : result.added + result.updated ? { kind: "added", count: result.added + result.updated } : { kind: "none" };
        setSearched({ kind: "existing", brand: match, stores, osm: outcome });
        setShowAddress(stores.length === 0);
      } else {
        const res = await previewChainStores(name);
        // Overpass down or slow: the user adds their store by address instead.
        const outcome: OsmOutcome = !res.ok ? { kind: "unavailable" } : res.data.stores.length ? { kind: "found", preview: res.data } : { kind: "none" };
        if (outcome.kind === "found") setBrand((b) => ({ ...b, kind: "chain" }));
        setSearched({ kind: "new", name, osm: outcome });
      }
    } finally {
      setSearching(false);
    }
  };

  const reloadStores = async (b: BrandOption) => {
    const res = await getBrandBranches(b.id);
    if (res.ok) setSearched((s) => (s?.kind === "existing" && s.brand.id === b.id ? { ...s, stores: res.data } : s));
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
      await reloadStores(existing);
    });

  // A new brand adds its store by address unless OSM found the chain's stores.
  const addressOpen = showAddress || (isNew && kind !== "online" && !useOsm);
  const stores = searched?.kind === "existing" ? searched.stores : osmStores ?? NO_STORES;
  const points = useMemo(() => [...toPoints(stores, icon), ...toPoints(picked ? [] : results, "📍")], [stores, results, picked, icon]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!searched) return setError(t.submit.searchFirst);
    if (isNew && kind === "local" && !picked) return setError(t.submit.needLocation);
    const payload = {
      ...(existing
        ? { brandId: existing.id, branchRef: picked?.ref } // a picked store not yet added goes in with the offer
        : {
            newBrand: { name: brandName.trim(), ...brand, useOsmStores: useOsm },
            branchRef: kind === "online" || useOsm ? undefined : picked?.ref,
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

  const osmMessage =
    osm?.kind === "added" ? t.submit.osmAdded(osm.count)
    : osm?.kind === "found" ? t.submit.osmFoundNew(osm.preview.stores.length)
    : osm?.kind === "none" ? t.submit.osmNone
    : osm?.kind === "unavailable" ? t.submit.osmUnavailable
    : null;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="card flex flex-col gap-3">
        <label className="label">
          {t.submit.brand} *
          <div className="flex gap-2">
            <input
              className="input"
              required
              maxLength={80}
              list="brand-options"
              placeholder={t.submit.brandPh}
              value={brandName}
              onChange={(e) => changeBrandName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void searchBrand();
                }
              }}
            />
            <button type="button" className="btn btn-primary shrink-0" onClick={() => void searchBrand()} disabled={searching || !brandName.trim()}>
              {searching ? t.submit.searchingBrand : t.submit.searchBrand}
            </button>
          </div>
          <datalist id="brand-options">
            {brands.map((b) => <option key={b.id} value={b.name} />)}
          </datalist>
        </label>
        {!searched && <p className="text-sm text-muted">{t.submit.searchHint}</p>}

        {existing && <p className="text-sm text-ok">{t.submit.existingBrand(existing.name)}</p>}

        {isNew && (
          <>
            <p className="text-sm text-muted">{t.submit.newBrandHint}</p>
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
          </>
        )}

        {searched && kind !== "online" && (
          <div className="flex flex-col gap-2">
            {osmMessage && <p className="text-sm">{osmMessage}</p>}
            {stores.length > 0 && <p className="text-sm text-muted">{t.submit.branches(stores.length)}</p>}
            <MapView points={points} picked={picked ? [picked.lat, picked.lng] : null} fitAll className="h-72" />
            {!addressOpen && (
              <button type="button" className="btn self-start" onClick={() => setShowAddress(true)}>＋ {t.submit.missingStore}</button>
            )}
            {addressOpen && (
              <>
                <span className="label">{t.submit.storeLocation}{isNew && kind === "local" ? " *" : ""}</span>
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
