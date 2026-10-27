import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function createDb(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  // Neon (and most hosted Postgres) needs TLS; a local server usually doesn't.
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes("host=/");
  const pool = new Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: true } });
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { db?: Db };
export const db: Db = new Proxy({} as Db, {
  get(_, prop) {
    globalForDb.db ??= createDb();
    const value = Reflect.get(globalForDb.db, prop, globalForDb.db);
    return typeof value === "function" ? value.bind(globalForDb.db) : value;
  },
});

export { createDb, schema };
