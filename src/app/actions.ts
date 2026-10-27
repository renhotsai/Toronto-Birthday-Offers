"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { userRole } from "@/db/schema";
import * as m from "@/lib/mutations";
import { AuthError, requireUser } from "@/lib/session";
import { offerInputSchema, reportSchema, submissionSchema, voteSchema } from "@/lib/validation";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: "unauthorized" | "forbidden" | "rate_limited" | "not_found" | "invalid" | "generic"; issues?: string[] };

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    revalidatePath("/[lang]", "layout");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.code };
    if (err instanceof m.MutationError) return { ok: false, error: err.code };
    if (err instanceof z.ZodError) return { ok: false, error: "invalid", issues: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    console.error(err);
    return { ok: false, error: "generic" };
  }
}

const id = z.coerce.number().int().positive();

export async function submitOffer(input: unknown) {
  return run(async () => m.createSubmission(db, await requireUser(), submissionSchema.parse(input)));
}

export async function vote(input: unknown) {
  return run(async () => {
    const { offerId, kind } = voteSchema.parse(input);
    await m.castVote(db, await requireUser(), offerId, kind);
  });
}

export async function reportLocation(input: unknown) {
  return run(async () => {
    const { locationId, kind, note } = reportSchema.parse(input);
    await m.reportLocation(db, await requireUser(), locationId, kind, note);
  });
}

// ---------- Moderators ----------

export async function verifyOffer(offerId: unknown) {
  return run(async () => m.verifyOffer(db, await requireUser("moderator"), id.parse(offerId)));
}

export async function updateOffer(offerId: unknown, input: unknown) {
  return run(async () => m.updateOffer(db, await requireUser("moderator"), id.parse(offerId), offerInputSchema.parse(input)));
}

export async function hideOffer(offerId: unknown) {
  return run(async () => m.hideOffer(db, await requireUser("moderator"), id.parse(offerId)));
}

export async function mergeOffer(offerId: unknown, intoId: unknown) {
  return run(async () => m.mergeOffer(db, await requireUser("moderator"), id.parse(offerId), id.parse(intoId)));
}

export async function resolveReport(reportId: unknown, apply: unknown) {
  return run(async () => m.resolveReport(db, await requireUser("moderator"), id.parse(reportId), z.boolean().parse(apply)));
}

// ---------- Admins ----------

export async function setUserRole(userId: unknown, role: unknown) {
  return run(async () => {
    await m.setUserRole(db, await requireUser("admin"), z.string().min(1).parse(userId), z.enum(userRole.enumValues).parse(role));
  });
}
