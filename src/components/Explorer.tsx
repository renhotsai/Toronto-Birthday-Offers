"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORIES, WINDOWS, type Category, type Window } from "@/lib/constants";
import { getDictionary, type Locale } from "@/i18n";
import type { MapLocation, OfferSummary } from "@/lib/data";
import { distanceKm } from "@/lib/status";
import { escapeHtml, type MapPoint } from "./map-utils";
import { CATEGORY_ICON, OfferCard } from "./OfferCard";

const MapView = dynamic(() => import("./MapView"), { ssr: false, loading: () => <div className="h-[65vh] animate-pulse rounded-2xl bg-neutral-soft" /> });

export function Explorer({
  lang, offers, locations, myVotes, signedIn,
}: {
  lang: Locale;
  offers: OfferSummary[];
  locations: MapLocation[];
  myVotes: Record<number, "valid" | "expired">;
  signedIn: boolean;
}) {
  const t = getDictionary(lang);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Filters live in the URL so a filtered view can be shared.
  const view = params.get("view") === "map" ? "map" : "list";
  const category = (CATEGORIES as readonly string[]).includes(params.get("category") ?? "") ? (params.get("category") as Category) : null;
  const timeWindow = (WINDOWS as readonly string[]).includes(params.get("window") ?? "") ? (params.get("window") as Window) : null;
  const noMembership = params.get("free") === "1";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [me, setMe] = useState<[number, number] | null>(null);
  const [geoState, setGeoState] = useState<"idle" | "locating" | "denied">("idle");

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const locationsByBrand = useMemo(() => {
    const map = new Map<number, MapLocation[]>();
    for (const l of locations) map.set(l.brandId, [...(map.get(l.brandId) ?? []), l]);
    return map;
  }, [locations]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = offers.filter(
      (o) =>
        (!category || o.category === category) &&
        (!timeWindow || o.window === timeWindow) &&
        (!noMembership || !o.membershipRequired) &&
        (!needle || [o.brandName, o.title, o.titleZh ?? ""].some((s) => s.toLowerCase().includes(needle))),
    );
    let distances = new Map<number, number>();
    if (me) {
      distances = new Map(
        list.flatMap((o) => {
          const locs = locationsByBrand.get(o.brandId);
          return locs?.length ? [[o.id, Math.min(...locs.map((l) => distanceKm(me, [l.lat, l.lng])))] as const] : [];
        }),
      );
      // Nearest first; offers with no physical location go last.
      list = [...list].sort((a, b) => (distances.get(a.id) ?? Infinity) - (distances.get(b.id) ?? Infinity));
    }
    return { list, distances };
  }, [offers, category, timeWindow, noMembership, q, me, locationsByBrand]);

  const points: MapPoint[] = useMemo(() => {
    const byBrand = new Map<number, OfferSummary[]>();
    for (const o of filtered.list) byBrand.set(o.brandId, [...(byBrand.get(o.brandId) ?? []), o]);
    return locations.flatMap((l) => {
      const brandOffers = byBrand.get(l.brandId);
      if (!brandOffers) return [];
      const first = brandOffers[0];
      const items = brandOffers
        .map((o) => `<li>${escapeHtml((lang === "zh" && o.titleZh) || o.title)}</li>`)
        .join("");
      const popupHtml = `<strong>${escapeHtml(first.brandName)}</strong>${l.address ? `<br><small>${escapeHtml(l.address)}</small>` : ""}<ul style="margin:6px 0;padding-left:18px">${items}</ul><a href="/${lang}/brands/${encodeURIComponent(first.brandSlug)}">→ ${escapeHtml(t.brand.offers)}</a>`;
      return [{ id: l.id, lat: l.lat, lng: l.lng, icon: CATEGORY_ICON[first.category], popupHtml }];
    });
  }, [filtered.list, locations, lang, t.brand.offers]);

  const locate = () => {
    if (!navigator.geolocation) return setGeoState("denied");
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMe([pos.coords.latitude, pos.coords.longitude]);
        setGeoState("idle");
      },
      () => setGeoState("denied"),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onBlur={() => setParam("q", q.trim() || null)}
            placeholder={t.home.search}
            className="input flex-1 rounded-full px-4"
            aria-label={t.home.search}
          />
          <div className="flex shrink-0 rounded-full border border-border bg-surface p-0.5" role="tablist">
            {(["list", "map"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setParam("view", v === "map" ? "map" : null)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${view === v ? "bg-accent text-accent-fg" : ""}`}
              >
                {v === "list" ? `☰ ${t.home.list}` : `🗺 ${t.home.map}`}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          <button type="button" className="chip" aria-pressed={!category} onClick={() => setParam("category", null)}>
            {t.home.allCategories}
          </button>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setParam("category", category === c ? null : c)}>
              {CATEGORY_ICON[c]} {t.category[c]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={timeWindow ?? ""}
            onChange={(e) => setParam("window", e.target.value || null)}
            className="chip appearance-none pr-6"
            aria-label={t.submit.window}
          >
            <option value="">{t.home.anyWindow}</option>
            {WINDOWS.map((w) => <option key={w} value={w}>{t.window[w]}</option>)}
          </select>
          <button type="button" className="chip" aria-pressed={noMembership} onClick={() => setParam("free", noMembership ? null : "1")}>
            {t.home.membershipFilter}
          </button>
          <button type="button" className="chip" aria-pressed={!!me} onClick={me ? () => setMe(null) : locate}>
            📍 {geoState === "locating" ? t.home.locating : t.home.nearMe}
          </button>
          {geoState === "denied" && <span className="text-xs text-warn">{t.home.locationDenied}</span>}
          <span className="ml-auto text-sm text-muted">{t.home.count(filtered.list.length)}</span>
        </div>
      </div>

      {view === "map" ? (
        <MapView points={points} me={me} />
      ) : filtered.list.length === 0 ? (
        <p className="card text-center text-muted">{t.home.empty}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.list.map((o) => (
            <OfferCard key={o.id} offer={o} lang={lang} myVote={myVotes[o.id]} signedIn={signedIn} distanceKm={filtered.distances.get(o.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
