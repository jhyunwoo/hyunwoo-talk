import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../bindings";

/**
 * Constant-time string compare so a wrong admin token can't be guessed byte by
 * byte via response-timing. Always walks the full length of the longer string.
 */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/** Pull the bearer token out of an `Authorization: Bearer <token>` header. */
function bearer(header: string | undefined): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

/**
 * Gate for the `/api/admin/*` analytics endpoints: requires a bearer token that
 * matches the `ADMIN_TOKEN` secret. 503 if the server has no token configured
 * (so we never accept an empty password), 401 otherwise.
 */
export const adminAuth = createMiddleware<AppEnv>(async (c, next) => {
  const expected = c.env.ADMIN_TOKEN;
  if (!expected) {
    return c.json({ error: "admin dashboard not configured" }, 503);
  }
  const token = bearer(c.req.header("Authorization"));
  if (!token || !safeEqual(token, expected)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});
