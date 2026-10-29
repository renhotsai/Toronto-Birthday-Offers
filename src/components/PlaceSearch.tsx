"use client";

import { useEffect, useRef, useState } from "react";
import { searchPlace } from "@/app/actions";
import { getDictionary, type Locale } from "@/i18n";
import type { Place } from "@/lib/nominatim";

const DEBOUNCE_MS = 500;
// Nominatim allows 1 request per second; the server throttles too, this just avoids queueing there.
const MIN_GAP_MS = 1000;

/**
 * Address / store-name search backed by Nominatim (through a server action). It only searches when the button is
 * pressed (Nominatim's policy forbids search-as-you-type), debounced, one request at a time.
 */
export function PlaceSearch({
  lang, selected, onResults, onSelect,
}: {
  lang: Locale;
  selected: string | null;
  onResults: (places: Place[]) => void;
  onSelect: (place: Place) => void;
}) {
  const t = getDictionary(lang);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCall = useRef(0);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const search = () => {
    const q = query.trim();
    if (q.length < 3 || pending) return;
    if (timer.current) clearTimeout(timer.current);
    const wait = Math.max(DEBOUNCE_MS, lastCall.current + MIN_GAP_MS - Date.now());
    timer.current = setTimeout(async () => {
      lastCall.current = Date.now();
      setPending(true);
      setError(null);
      const res = await searchPlace(q);
      setPending(false);
      if (!res.ok) {
        setError(res.error === "unauthorized" ? t.errors.unauthorized : t.errors.unavailable);
        return;
      }
      setResults(res.data);
      onResults(res.data);
    }, wait);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          className="input"
          maxLength={200}
          placeholder={t.places.placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
        />
        <button type="button" className="btn shrink-0" onClick={search} disabled={pending || query.trim().length < 3}>
          {pending ? t.places.searching : t.places.search}
        </button>
      </div>
      {error && <p className="text-sm text-accent" role="alert">{error}</p>}
      {results && results.length === 0 && <p className="text-sm text-muted">{t.places.none}</p>}
      {results && results.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {results.map((p) => (
            <li key={p.ref} className="flex items-center gap-2 px-3 py-2">
              <span className="mr-auto">
                {p.name && <strong>{p.name} · </strong>}
                {p.address ?? p.label}
              </span>
              {selected === p.ref ? (
                <span className="text-xs text-ok">✓ {t.places.selected}</span>
              ) : (
                <button type="button" className="chip text-xs" onClick={() => onSelect(p)}>{t.places.use}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
