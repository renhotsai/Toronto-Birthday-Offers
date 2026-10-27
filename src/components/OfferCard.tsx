"use client";

import Link from "next/link";
import { getDictionary, type Locale } from "@/i18n";
import { CATEGORY_ICON } from "@/lib/constants";
import type { OfferSummary } from "@/lib/data";
import { likelyExpired, verificationStatus, type VerificationStatus } from "@/lib/status";
import { VoteButtons } from "./VoteButtons";

const STATUS_STYLE: Record<VerificationStatus, string> = {
  verified: "bg-ok-soft text-ok",
  unverified: "bg-neutral-soft text-muted",
  needs_check: "bg-warn-soft text-warn",
};
const STATUS_ICON: Record<VerificationStatus, string> = { verified: "✓", unverified: "?", needs_check: "!" };

export function StatusBadge({ verifiedAt, lang }: { verifiedAt: string | null; lang: Locale }) {
  const t = getDictionary(lang).status;
  const status = verificationStatus(verifiedAt);
  const date = verifiedAt ? new Date(verifiedAt).toLocaleDateString(lang === "zh" ? "zh-TW" : "en-CA") : null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`} title={t.explain[status]}>
      {STATUS_ICON[status]} {status === "verified" && date ? t.verifiedOn(date) : t[status]}
    </span>
  );
}

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function OfferCard({
  offer, lang, myVote, signedIn, distanceKm, linkBrand = true,
}: {
  offer: OfferSummary;
  lang: Locale;
  myVote?: "valid" | "expired";
  signedIn: boolean;
  distanceKm?: number;
  linkBrand?: boolean;
}) {
  const t = getDictionary(lang);
  const zh = lang === "zh";
  const title = (zh && offer.titleZh) || offer.title;
  const details = (zh && offer.detailsZh) || offer.details;
  const brand = (
    <span className="font-bold">{CATEGORY_ICON[offer.category]} {offer.brandName}</span>
  );

  return (
    <article className="card flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {linkBrand ? <Link href={`/${lang}/brands/${offer.brandSlug}`} className="hover:underline">{brand}</Link> : brand}
        <StatusBadge verifiedAt={offer.verifiedAt} lang={lang} />
        {likelyExpired(offer.validVotes, offer.expiredVotes) && (
          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-xs font-semibold text-warn">⚠ {t.offer.likelyExpired}</span>
        )}
      </div>
      <h3 className="text-lg leading-snug font-semibold">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        <span className="tag">{t.category[offer.category]}</span>
        <span className="tag">{t.window[offer.window]}{offer.windowNote ? ` · ${offer.windowNote}` : ""}</span>
        <span className="tag">{offer.membershipRequired ? t.offer.membership : t.offer.noMembership}</span>
        {offer.brandKind === "online" ? (
          <span className="tag">{t.home.online}</span>
        ) : offer.locationCount > 0 ? (
          <span className="tag">📍 {t.home.locations(offer.locationCount)}</span>
        ) : null}
        {distanceKm !== undefined && <span className="tag font-semibold">{t.home.km(distanceKm)}</span>}
      </div>
      {details && <p className="text-sm">{details}</p>}
      {offer.conditions && (
        <p className="text-sm text-muted"><b>{t.offer.conditions}:</b> {offer.conditions}</p>
      )}
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <a href={offer.officialUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-accent underline">
          {t.offer.official}: {hostname(offer.officialUrl)} ↗
        </a>
        <span className="ml-auto" />
        <VoteButtons offerId={offer.id} lang={lang} valid={offer.validVotes} expired={offer.expiredVotes} myVote={myVote} signedIn={signedIn} />
      </div>
      {offer.sharedBy && <p className="text-xs text-muted">{t.offer.sharedBy(offer.sharedBy)}</p>}
    </article>
  );
}
