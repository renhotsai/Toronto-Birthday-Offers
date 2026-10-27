"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { vote } from "@/app/actions";
import { getDictionary, type Locale } from "@/i18n";

type Kind = "valid" | "expired";

export function VoteButtons({
  offerId, lang, valid, expired, myVote, signedIn,
}: { offerId: number; lang: Locale; valid: number; expired: number; myVote?: Kind; signedIn: boolean }) {
  const t = getDictionary(lang);
  const [state, setState] = useState({ valid, expired, mine: myVote });
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Link href={`/${lang}/sign-in`} className="text-xs text-muted underline" title={t.offer.signInToVote}>
        👍 {valid} · 👎 {expired} · {t.offer.signInToVote}
      </Link>
    );
  }

  const cast = (kind: Kind) => {
    if (state.mine === kind) return;
    const prev = state;
    // Optimistic: move my vote from the old bucket to the new one.
    setState({
      valid: prev.valid + (kind === "valid" ? 1 : 0) - (prev.mine === "valid" ? 1 : 0),
      expired: prev.expired + (kind === "expired" ? 1 : 0) - (prev.mine === "expired" ? 1 : 0),
      mine: kind,
    });
    startTransition(async () => {
      const res = await vote({ offerId, kind });
      if (!res.ok) setState(prev);
    });
  };

  return (
    <div className="flex gap-1.5">
      {(["valid", "expired"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          disabled={pending}
          aria-pressed={state.mine === kind}
          onClick={() => cast(kind)}
          className="chip text-xs"
        >
          {kind === "valid" ? `👍 ${t.offer.stillValid} · ${state.valid}` : `👎 ${t.offer.expired} · ${state.expired}`}
        </button>
      ))}
    </div>
  );
}
