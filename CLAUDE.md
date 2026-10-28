@AGENTS.md

# Toronto Birthday Offers — notes for Claude

Community map of birthday freebies in the GTA. Production: https://toronto-birthday-offers.vercel.app (deploys from `main`).
Work is tracked in GitHub issues; the decisions recorded in an issue are agreed with the owner — follow them, and ask before deviating.

## Stack
Next.js 16 App Router · TypeScript (strict) · Tailwind 4 · Drizzle ORM + `pg` · Postgres (Neon via Vercel Storage) · Better Auth · Leaflet + OpenStreetMap · Vitest.

## Language: TypeScript first
- Write everything in TypeScript (`.ts` / `.tsx`; standalone Node scripts as `.mts` run with `tsx`).
- Use JavaScript only when a tool genuinely cannot load TypeScript: say why in a comment at the top of the file and add it to `ALLOWED_JS` in `scripts/check-no-js.mts` (run by `npm run lint`, so CI fails on any other `.js/.jsx/.mjs/.cjs`). There are currently no JS files; `eslint.config.ts` loads through `jiti`.
- `tsconfig.json` has `allowJs: false` and `noUncheckedIndexedAccess: true`. For queries that always return a row (`insert … returning`, `count()`) use `one(rows)` from `src/db/rows.ts` instead of destructuring.
- `any` is a lint error; when unavoidable use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <why>`. Prefer `unknown` + narrowing or zod at boundaries. Type-only imports use `import type` / inline `type` (`consistent-type-imports`).

## Commands
```bash
npm run dev            # http://localhost:3000
npm run typecheck      # tsc --noEmit
npm run lint
TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5433/tbo_test npm test   # DB tests wipe this database
npm run build
npm run db:generate    # after editing src/db/schema.ts — commit the generated drizzle/ files
npm run db:migrate | db:seed | db:import-osm
```
Run typecheck, lint and tests before every push. `typecheck` runs `next typegen` first so `PageProps` exists on a clean checkout.
CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests (Postgres 16 service container) and build on every PR and push to `main`.

### Local Postgres (cloud sandbox)
No Postgres runs by default, and it stops when the container restarts:
```bash
P=/var/tmp/tbo-pg
[ -d $P/data ] || { mkdir -p $P && chown postgres $P && su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $P/data -A trust -U postgres"; }
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $P/data -o '-p 5433 -k $P' -l $P/log start"
psql -h 127.0.0.1 -p 5433 -U postgres -c "create database tbo" -c "create database tbo_test"
```
`.env` (gitignored, see `.env.example`) points `DATABASE_URL` at `tbo`.
Never `pkill -f` a pattern that also matches your own shell command — kill by PID.

## Next.js 16 gotchas (read `node_modules/next/dist/docs/` before using an unfamiliar API)
- `middleware` is now `src/proxy.ts`.
- Cache Components is **off**; pages that read the DB call `await connection()` to stay dynamic.
- `PageProps<"/[lang]/...">` / `LayoutProps` are generated globals (`npx next typegen`).
- **Constants used by server components must not live in a `"use client"` file** — the server gets a client reference and renders `undefined`. Shared enums/maps go in `src/lib/constants.ts`.
- Leaflet touches `window`: only import `MapView` via `next/dynamic` with `ssr: false`; keep helpers in `components/map-utils.ts`.
- Dictionaries contain functions, so client components call `getDictionary(lang)` themselves instead of receiving it as a prop.

## Code map
- `src/app/[lang]/…` pages (locales in `src/i18n`, typed against `Dictionary`); `src/app/actions.ts` server actions (validate with zod in `src/lib/validation.ts`, auth via `requireUser(role)`).
- `src/lib/data.ts` reads, `src/lib/mutations.ts` writes — both take `db` as the first argument so tests can pass a test DB.
- `src/db/schema.ts` Drizzle schema (+ Better Auth tables). Enums come from `src/lib/constants.ts`; use relative imports in `schema.ts` (drizzle-kit doesn't resolve `@/`).
- `src/lib/status.ts` verification decay (`SITE.staleAfterDays`), distance, slugify. `src/lib/site.ts` name/URL/bounds.
- `data/seed-offers.ts` + `src/lib/seed.ts` (idempotent); `src/lib/osm.ts` Overpass importer (never touches hidden rows or rows that already have an `osm_id`; the one exception, agreed in #1: a visible manual row of the same brand without `osm_id` within 50 m is updated in place with OSM's data, once).
- Locations (#1): any signed-in user adds a missing store on `/submit` by picking a geocoding result; the server re-looks it up (`src/lib/nominatim.ts`), never trusting client coordinates. Moderators manage stores in Admin → Locations. Never copy coordinates or place data from Google Maps — only Nominatim/OSM.
- Nominatim/Overpass are called only from the server with `SITE.userAgent`, throttled to 1 req/s per instance and cached (`src/lib/throttle.ts`); no search-as-you-type.
- Roles: `user` < `moderator` < `admin`; `ADMIN_EMAILS` become admin on first sign-in.

## Deploy & data
- Vercel runs `vercel-build` = `db:deploy` (migrate + idempotent seed) then `next build`, using `DATABASE_URL_UNPOOLED` when present. Schema changes ship by committing migrations.
- Production DB is the Neon database attached through **Vercel Storage**. The separate Neon project `toronto-birthday-offers` (billowing-morning-60401060) is an unused leftover — don't migrate or seed it.
- Preview deployments: Better Auth's `baseURL` is dynamic (`src/lib/auth-url.ts`) — the canonical host plus the deployment's own `VERCEL_URL` / `VERCEL_BRANCH_URL`, so magic-link sign-in works on previews (Google sign-in doesn't). Preview env vars and Neon Preview Branching are set in the dashboard (#12); don't set `BETTER_AUTH_URL` for Preview.
- The Vercel connector is **read-only** for this project (deployments, logs, fetching URLs work; creating projects or env vars returns 403). Ask the owner to change env vars in the dashboard.
- Never write secrets into the repo, issues or PRs.

## Conventions
- UI copy lives in the dictionaries; never hard-code user-facing strings.
- Validate all input with zod; enforce permissions server-side.
- Keep functions DB-injectable and add tests in `tests/` (`logic.test.ts` pure, `db.test.ts` DB, `auth.test.ts` Better Auth flow).
- Branch per issue, open a PR, reference the issue (`Closes #N`).
