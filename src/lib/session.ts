import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@/db/schema";
import type { Locale } from "@/i18n";
import { ADMIN_TABS, type AdminTab } from "./constants";
import { auth } from "./auth";

export type CurrentUser = { id: string; name: string; email: string; role: Role };

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const { id, name, email, role } = result.user;
  return { id, name, email, role: (role ?? "user") as Role };
}

const RANK: Record<Role, number> = { user: 0, moderator: 1, admin: 2 };
export const hasRole = (u: Pick<CurrentUser, "role"> | null, min: Role) => !!u && RANK[u.role] >= RANK[min];

export class AuthError extends Error {
  constructor(public code: "unauthorized" | "forbidden") {
    super(code);
  }
}

export async function requireUser(min: Role = "user"): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new AuthError("unauthorized");
  if (!hasRole(u, min)) throw new AuthError("forbidden");
  return u;
}

/**
 * Role check for an admin tab page. Every tab page calls this itself: the admin layout doesn't re-render on
 * navigation and can't stop a child page from rendering, so its check alone doesn't protect the tabs.
 * Signed out → sign-in (back to this tab); role too low → /admin, which shows what this user may see.
 */
export async function requireAdminPage(lang: Locale, tab: AdminTab): Promise<CurrentUser> {
  const path = `/${lang}/admin/${tab}`;
  const me = await getCurrentUser();
  if (!me) redirect(`/${lang}/sign-in?next=${path}`);
  const { minRole } = ADMIN_TABS.find((t) => t.key === tab)!;
  if (!hasRole(me, minRole)) redirect(`/${lang}/admin`);
  return me;
}
