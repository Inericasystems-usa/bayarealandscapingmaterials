import express, { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { captureError } from "../lib/sentry.js";
import { redactPan } from "../lib/pan-guard.js";

/**
 * Browser errors from the public site, forwarded to the API's Sentry.
 *
 * The website ships no error-tracking SDK (bundle weight, and a third-party
 * script on every page), so its error boundaries post a few plain fields here
 * instead (apps/web/lib/report-error.ts). Anyone on the internet can call this,
 * so it accepts very little: a short message, Next's error digest and the page
 * path, in a body of at most 4 KB, ten reports a minute per client. Nothing in
 * it identifies a visitor: query strings and fragments are cut from the path,
 * and e-mail addresses, long digit runs and card numbers are blanked out of
 * the message before it is logged or sent anywhere.
 */

const MAX_BODY = "4kb";

const reportSchema = z
  .object({
    message: z.string().max(1000).default(""),
    // Next's server-side error digest: a short hash, nothing more.
    digest: z
      .string()
      .max(64)
      .regex(/^[\w-]*$/)
      .optional(),
    path: z.string().max(512).default(""),
    // Which boundary caught it: the page-level one or the root-layout one.
    boundary: z.enum(["page", "global"]).default("page"),
  })
  .strict();

const EMAIL = /[^\s@<>()"']+@[^\s@<>()"']+\.[a-z]{2,}/gi;
// Phone numbers, account numbers and the like: any run of 7+ digits, allowing
// single spaces, dots, dashes and brackets between them.
const DIGITS = /\+?\(?\d(?:[\d\s().-]{5,}\d)/g;

/** Strip anything that could identify a visitor from free text. */
export function scrubClientText(text: string): string {
  return redactPan(text)
    .replace(EMAIL, "[email]")
    .replace(DIGITS, (m) => (m.replace(/\D/g, "").length >= 7 ? "[number]" : m));
}

/** Only the path: query strings carry search terms, click ids and e-mails. */
export function scrubClientPath(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? "";
  return bare.startsWith("/") ? scrubClientText(bare) : "";
}

const router = Router();

router.post(
  "/",
  rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false }),
  // Its own small parser: the global one allows 1 MB (server.ts skips it here).
  express.json({ limit: MAX_BODY }),
  (req, res) => {
    const parsed = reportSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(422).json({ error: { code: "validation_failed", message: "Unrecognised error report.", trace_id: req.id } });
    }
    const message = scrubClientText(parsed.data.message) || "(no message)";
    const path = scrubClientPath(parsed.data.path);
    const context = { source: "web", boundary: parsed.data.boundary, path, digest: parsed.data.digest ?? null };

    req.log.warn(context, `client error: ${message.slice(0, 200)}`);
    const err = new Error(message);
    err.name = "ClientError";
    captureError(err, context);
    return res.status(204).end();
  },
);

export default router;
