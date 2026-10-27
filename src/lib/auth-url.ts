// Better Auth's base URL. Preview deployments get a new URL each time, so besides the canonical site URL the
// deployment's own Vercel hosts are allowed; any other host falls back to the canonical URL. Kept out of auth.ts
// (server-only) so it can be unit tested.
type Env = Readonly<Record<string, string | undefined>>;

export function authBaseURL(env: Env, siteUrl: string) {
  const fallback = env.BETTER_AUTH_URL ?? siteUrl;
  const allowedHosts = [new URL(fallback).host, env.VERCEL_URL, env.VERCEL_BRANCH_URL].filter((h): h is string => !!h);
  return { allowedHosts: [...new Set(allowedHosts)], fallback };
}
