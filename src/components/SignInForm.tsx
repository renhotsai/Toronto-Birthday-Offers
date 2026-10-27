"use client";

import { useState } from "react";
import { getDictionary, type Locale } from "@/i18n";
import { authClient } from "@/lib/auth-client";

export function SignInForm({ lang, googleEnabled, next }: { lang: Locale; googleEnabled: boolean; next: string }) {
  const t = getDictionary(lang).signIn;
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  return (
    <div className="flex flex-col gap-4">
      {googleEnabled && (
        <>
          <button
            type="button"
            className="btn justify-center py-2.5"
            onClick={() => authClient.signIn.social({ provider: "google", callbackURL: next })}
          >
            <span aria-hidden className="font-bold">G</span> {t.google}
          </button>
          <div className="flex items-center gap-3 text-xs text-muted"><hr className="flex-1 border-border" />or<hr className="flex-1 border-border" /></div>
        </>
      )}
      <form
        className="flex flex-col gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("sending");
          const { error } = await authClient.signIn.magicLink({ email, callbackURL: next });
          setState(error ? "error" : "sent");
        }}
      >
        <label className="label">
          {t.email}
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" />
        </label>
        <button type="submit" className="btn btn-primary py-2.5" disabled={state === "sending"}>{t.sendLink}</button>
        {state === "sent" && <p className="text-sm text-ok" role="status">{t.sent}</p>}
        {state === "error" && <p className="text-sm text-accent" role="alert">{t.error}</p>}
      </form>
    </div>
  );
}
