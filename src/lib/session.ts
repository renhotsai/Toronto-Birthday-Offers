import "server-only";
import { headers } from "next/headers";
import type { Role } from "@/db/schema";
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
