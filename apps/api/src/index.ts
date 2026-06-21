import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, gt, lt, or, asc } from "drizzle-orm";
import { newMessageId, type ChatMessage } from "@repo/shared";
import type { AppEnv, Bindings } from "./bindings";
import { getDb } from "./db";
import { messages, pushSubscriptions } from "./db/schema";
import { Poller } from "./poller";

/** Resolve the single Durable Object that owns the configured mailbox. */
function pollerStub(env: Bindings) {
  return env.POLLER.get(env.POLLER.idFromName(env.MAILBOX_SEQ));
}

const userId = z.string().min(1).max(64).regex(/^[^|]+$/, "id must not contain |");

const app = new Hono<AppEnv>();

app.use("*", (c, next) =>
  cors({
    origin: c.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  })(c, next),
);

const routes = app
  .get("/", (c) =>
    c.html(`<!doctype html><html><head><meta charset="utf-8">
<title>Hyunwoo Talk API</title>
<style>body{font:14px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#222}
code{background:#f3f3f3;padding:1px 5px;border-radius:4px}h1{font-size:20px}li{margin:4px 0}</style></head>
<body><h1>Hyunwoo Talk API</h1>
<p>1-on-1 encrypted messaging bridged through Touchgym. Endpoints:</p>
<ul>
<li><code>GET  /api/health</code> — liveness</li>
<li><code>GET  /api/push/vapid-public-key</code> — VAPID public key for the web client</li>
<li><code>POST /api/push/subscribe</code> — <code>{ userId, subscription }</code></li>
<li><code>POST /api/push/unsubscribe</code> — <code>{ endpoint }</code></li>
<li><code>GET  /api/messages?userId=&peerId=&before=&after=&limit=</code> — message history</li>
<li><code>POST /api/messages</code> — <code>{ fromId, toId, ciphertext, id?, ts? }</code> (web send)</li>
<li><code>POST /api/poll</code> — trigger an immediate Touchgym poll</li>
<li><code>POST /api/ensure</code> — ensure the adaptive polling loop is running</li>
</ul></body></html>`),
  )

  .get("/api/health", (c) => c.json({ ok: true, service: "hyunwoo-talk-api" }))

  .get("/api/push/vapid-public-key", (c) =>
    c.json({ publicKey: c.env.VAPID_PUBLIC_KEY || null }),
  )

  .post(
    "/api/push/subscribe",
    zValidator(
      "json",
      z.object({
        userId,
        subscription: z.object({
          endpoint: z.string().url(),
          keys: z.object({
            p256dh: z.string().min(1),
            auth: z.string().min(1),
          }),
        }),
      }),
    ),
    async (c) => {
      const { userId: uid, subscription } = c.req.valid("json");
      const db = getDb(c.env.DB);
      await db
        .insert(pushSubscriptions)
        .values({
          userId: uid,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          createdAt: Date.now(),
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            userId: uid,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        });
      return c.json({ ok: true });
    },
  )

  .post(
    "/api/push/unsubscribe",
    zValidator("json", z.object({ endpoint: z.string().url() })),
    async (c) => {
      const { endpoint } = c.req.valid("json");
      const db = getDb(c.env.DB);
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
      return c.json({ ok: true });
    },
  )

  .get(
    "/api/messages",
    zValidator(
      "query",
      z.object({
        userId,
        peerId: userId.optional(),
        before: z.coerce.number().int().positive().optional(),
        after: z.coerce.number().int().nonnegative().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    ),
    async (c) => {
      const { userId: uid, peerId, before, after, limit } = c.req.valid("query");
      const db = getDb(c.env.DB);

      const involves = peerId
        ? or(
            and(eq(messages.fromId, uid), eq(messages.toId, peerId)),
            and(eq(messages.fromId, peerId), eq(messages.toId, uid)),
          )
        : or(eq(messages.fromId, uid), eq(messages.toId, uid));

      if (after !== undefined) {
        // Live tail: everything newer than `after`, oldest first.
        const rows = await db
          .select()
          .from(messages)
          .where(and(involves, gt(messages.ts, after)))
          .orderBy(asc(messages.ts))
          .limit(limit);
        return c.json({ messages: rows.map(toChatMessage), hasMore: false });
      }

      // History page: newest first, optionally older than `before`.
      const where = before
        ? and(involves, lt(messages.ts, before))
        : involves;
      const rows = await db
        .select()
        .from(messages)
        .where(where)
        .orderBy(desc(messages.ts))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      // Return chronological order for convenient rendering.
      return c.json({
        messages: page.map(toChatMessage).reverse(),
        hasMore,
      });
    },
  )

  .post(
    "/api/messages",
    zValidator(
      "json",
      z.object({
        id: z.string().min(1).max(64).optional(),
        fromId: userId,
        toId: userId,
        ciphertext: z.string().min(1),
        ts: z.number().int().positive().optional(),
      }),
    ),
    async (c) => {
      const body = c.req.valid("json");
      const message: ChatMessage = {
        id: body.id ?? newMessageId(),
        fromId: body.fromId,
        toId: body.toId,
        ciphertext: body.ciphertext,
        ts: body.ts ?? Date.now(),
      };

      // The Durable Object is the single writer: it appends to the Touchgym
      // memo and archives to D1 in one race-free place.
      const res = await pollerStub(c.env).fetch("https://poller/send", {
        method: "POST",
        body: JSON.stringify(message),
      });
      if (!res.ok) {
        return c.json({ ok: false, error: "send failed" }, 502);
      }
      return c.json({ ok: true, message });
    },
  )

  .post("/api/poll", async (c) => {
    const res = await pollerStub(c.env).fetch("https://poller/poll", {
      method: "POST",
    });
    return c.json(await res.json());
  })

  .post("/api/ensure", async (c) => {
    await pollerStub(c.env).fetch("https://poller/ensure", { method: "POST" });
    return c.json({ ok: true });
  });

function toChatMessage(row: typeof messages.$inferSelect): ChatMessage {
  return {
    id: row.id,
    fromId: row.fromId,
    toId: row.toId,
    ciphertext: row.ciphertext,
    ts: row.ts,
  };
}

/** Exported for the Hono RPC client (`hc<AppType>`). */
export type AppType = typeof routes;

export { Poller };

export default {
  fetch: app.fetch,
  /**
   * Cron heartbeat (every minute) that keeps the Durable Object's adaptive
   * poll alarm alive (1-min idle / 2-sec active, paused 00:00–05:00 KST). The
   * DO does the real polling between heartbeats; this only revives a dead alarm.
   */
  async scheduled(_event: ScheduledController, env: Bindings): Promise<void> {
    await pollerStub(env).fetch("https://poller/ensure", { method: "POST" });
  },
} satisfies ExportedHandler<Bindings>;
