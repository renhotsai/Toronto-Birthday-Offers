import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { authBaseURL } from "./auth-url";
import { sendEmail } from "./email";
import { SITE } from "./site";

// Comma-separated emails that become admins when they first sign in.
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
);

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const auth = betterAuth({
  baseURL: authBaseURL(process.env, SITE.url),
  database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "user", input: false },
    },
  },
  socialProviders: googleEnabled
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET! } }
    : {},
  databaseHooks: {
    user: {
      create: {
        before: async (data) => ({
          data: { ...data, role: adminEmails.has(data.email.toLowerCase()) ? "admin" : "user" },
        }),
      },
    },
  },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendEmail({
          to: email,
          subject: `${SITE.emoji} ${SITE.name.en} sign-in link / 登入連結`,
          text: `Sign in / 登入：${url}\n\nThis link expires in 5 minutes. 連結 5 分鐘內有效。`,
          html: `<p><a href="${url}">Sign in to ${SITE.name.en} / 登入${SITE.name.zh}</a></p><p>This link expires in 5 minutes. 連結 5 分鐘內有效。</p>`,
        });
      },
    }),
    nextCookies(), // must stay last
  ],
});

export type SessionUser = typeof auth.$Infer.Session.user;
