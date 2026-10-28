import type { ActionResult } from "@/app/actions";
import type { Dictionary } from "@/i18n";

/** The message to show for a failed server action. */
export function actionError(t: Dictionary, res: Extract<ActionResult<unknown>, { ok: false }>) {
  switch (res.error) {
    case "rate_limited": return t.errors.rateLimited;
    case "duplicate": return t.errors.duplicate;
    case "removed": return t.errors.removed;
    case "unavailable": return t.errors.unavailable;
    case "unauthorized": return t.errors.unauthorized;
    case "forbidden": return t.errors.forbidden;
    default: return [t.errors.generic, ...(res.issues ?? [])].join(" ");
  }
}
