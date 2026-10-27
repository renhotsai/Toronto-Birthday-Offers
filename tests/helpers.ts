import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, type Db } from "@/db";
import { user } from "@/db/schema";
import type { Role } from "@/lib/constants";

export const hasTestDb = !!process.env.TEST_DATABASE_URL;

export async function freshDb(): Promise<Db> {
  const db = createDb(process.env.TEST_DATABASE_URL);
  await db.execute(sql`drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;`);
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

let n = 0;
export async function makeUser(db: Db, role: Role = "user") {
  const id = `u${++n}-${role}`;
  await db.insert(user).values({ id, name: `User ${n}`, email: `${id}@example.com`, role });
  return { id, role };
}
