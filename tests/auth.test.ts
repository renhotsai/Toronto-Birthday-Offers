import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db";
import { freshDb, hasTestDb } from "./helpers";

// Runs the real Better Auth magic-link flow against the test database.
describe.skipIf(!hasTestDb)("auth", () => {
  let db: Db;
  beforeAll(async () => {
    db = await freshDb();
  });
  afterAll(async () => db?.$client.end());

  async function signIn(email: string) {
    const { auth } = await import("@/lib/auth");
    const logged: string[] = [];
    const spy = vi.spyOn(console, "info").mockImplementation((msg: string) => void logged.push(msg));
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: "http://localhost:3000" },
        body: JSON.stringify({ email, callbackURL: "/en" }),
      }),
    );
    spy.mockRestore();
    expect(res.status).toBe(200);
    const link = logged.join("\n").match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();

    const verify = await auth.handler(new Request(link!, { headers: { Origin: "http://localhost:3000" } }));
    expect([200, 302]).toContain(verify.status);
    const cookie = verify.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    return session?.user as { email: string; role: string } | undefined;
  }

  it("signs in by magic link and makes ADMIN_EMAILS admins", async () => {
    expect(await signIn("boss@example.com")).toMatchObject({ email: "boss@example.com", role: "admin" });
  });

  it("gives everyone else the user role", async () => {
    expect(await signIn("someone@example.com")).toMatchObject({ role: "user" });
  });
});
