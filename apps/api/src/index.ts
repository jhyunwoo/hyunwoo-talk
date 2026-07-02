import { Hono } from "hono";
import { cors } from "hono/cors";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  like,
  lt,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  MAX_CIPHERTEXT_LENGTH,
  newMessageId,
  type ChatMessage,
} from "@repo/shared";
import type { AppEnv, Bindings } from "./bindings";
import { getDb } from "./db";
import { messages, pushSubscriptions, visits } from "./db/schema";
import { adminAuth } from "./lib/admin";
import { parseUserAgent } from "./lib/ua";
import { Poller } from "./poller";

/** Resolve the single Durable Object that owns the configured mailbox. */
function pollerStub(env: Bindings) {
  return env.POLLER.get(env.POLLER.idFromName(env.MAILBOX_SEQ));
}

const userId = z.string().min(1).max(64).regex(/^[^|]+$/, "id must not contain |");

/** Querystring filter shared by the admin analytics endpoints. */
const visitFilterShape = {
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().positive().optional(),
  country: z.string().max(8).optional(),
  deviceType: z.string().max(16).optional(),
  browser: z.string().max(64).optional(),
  q: z.string().max(128).optional(),
};

interface VisitFilter {
  from?: number;
  to?: number;
  country?: string;
  deviceType?: string;
  browser?: string;
  q?: string;
}

/** Translate a filter into a list of Drizzle WHERE conditions over `visits`. */
function visitConditions(f: VisitFilter): SQL[] {
  const conds: SQL[] = [];
  if (f.from !== undefined) conds.push(gte(visits.createdAt, f.from));
  if (f.to !== undefined) conds.push(lte(visits.createdAt, f.to));
  if (f.country) conds.push(eq(visits.country, f.country));
  if (f.deviceType) conds.push(eq(visits.deviceType, f.deviceType));
  if (f.browser) conds.push(eq(visits.browser, f.browser));
  if (f.q) {
    const term = `%${f.q}%`;
    conds.push(
      or(
        like(visits.ip, term),
        like(visits.city, term),
        like(visits.userId, term),
      )!,
    );
  }
  return conds;
}

const app = new Hono<AppEnv>();

app.use("*", (c, next) => {
  // WebSocket upgrades aren't CORS-preflighted and the cors() middleware would
  // try to mutate the immutable 101 response — skip it for upgrades.
  if ((c.req.header("upgrade") ?? "").toLowerCase() === "websocket") {
    return next();
  }
  return cors({
    origin: c.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  })(c, next);
});

// Gate every analytics endpoint behind the admin token.
app.use("/api/admin/*", adminAuth);

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
<li><code>GET  /api/ws?userId=&peerId=</code> — WebSocket for real-time message delivery</li>
<li><code>GET  /api/push/vapid-public-key</code> — VAPID public key for the web client</li>
<li><code>POST /api/push/subscribe</code> — <code>{ userId, subscription }</code></li>
<li><code>POST /api/push/unsubscribe</code> — <code>{ endpoint }</code></li>
<li><code>POST /api/visit</code> — record visitor telemetry (client posts device info; server adds ip/geo)</li>
<li><code>GET  /api/admin/visits?from=&to=&country=&deviceType=&browser=&q=&before=&limit=</code> — visit log (admin)</li>
<li><code>GET  /api/admin/stats</code> — visit aggregates for the dashboard (admin)</li>
<li><code>GET  /api/messages?userId=&peerId=&before=&after=&limit=</code> — message history</li>
<li><code>POST /api/messages</code> — <code>{ fromId, toId, ciphertext, id?, ts? }</code> (web send)</li>
<li><code>POST /api/poll</code> — trigger an immediate Touchgym poll</li>
<li><code>POST /api/ensure</code> — ensure the adaptive polling loop is running</li>
</ul></body></html>`),
  )

  .get("/api/health", (c) => c.json({ ok: true, service: "hyunwoo-talk-api" }))

  // Real-time chat: upgrade and hand the socket to the single mailbox DO, which
  // broadcasts new messages (ingested from Touchgym or sent by web clients).
  .get("/api/ws", (c) => {
    if ((c.req.header("upgrade") ?? "").toLowerCase() !== "websocket") {
      return c.text("Expected a WebSocket upgrade", 426);
    }
    return pollerStub(c.env).fetch(c.req.raw);
  })

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

  // Visitor telemetry: the browser posts what only it can see (screen, timezone,
  // cpu/memory…), and we enrich it server-side with the Cloudflare request
  // (ip, geo, asn, tls…). Best-effort; never blocks the page.
  .post(
    "/api/visit",
    zValidator(
      "json",
      z.object({
        userId: z.string().max(64).optional(),
        page: z.string().max(1024).nullish(),
        referrer: z.string().max(2048).nullish(),
        language: z.string().max(64).nullish(),
        languages: z.string().max(512).nullish(),
        timezone: z.string().max(64).nullish(),
        screen: z.string().max(32).nullish(),
        viewport: z.string().max(32).nullish(),
        pixelRatio: z.number().nullish(),
        cpuCores: z.number().int().nullish(),
        deviceMemory: z.number().nullish(),
        touch: z.boolean().nullish(),
        connection: z.string().max(32).nullish(),
      }),
    ),
    async (c) => {
      const b = c.req.valid("json");
      const cf = c.req.raw.cf;
      const ua = c.req.header("User-Agent") ?? null;
      const parsed = parseUserAgent(ua ?? "");

      const db = getDb(c.env.DB);
      const row: typeof visits.$inferInsert = {
        userId: b.userId ?? null,
        ip:
          c.req.header("CF-Connecting-IP") ??
          c.req.header("X-Forwarded-For") ??
          null,
        userAgent: ua,
        browser: parsed.browser,
        os: parsed.os,
        deviceType: parsed.deviceType,
        page: b.page ?? null,
        referrer: b.referrer ?? null,
        language: b.language ?? null,
        acceptLanguage: c.req.header("Accept-Language") ?? null,
        languages: b.languages ?? null,
        timezone: b.timezone ?? null,
        screen: b.screen ?? null,
        viewport: b.viewport ?? null,
        pixelRatio: b.pixelRatio ?? null,
        cpuCores: b.cpuCores ?? null,
        deviceMemory: b.deviceMemory ?? null,
        touch: b.touch ?? null,
        connectionType: b.connection ?? null,
        country: (cf?.country as string | undefined) ?? null,
        region: (cf?.region as string | undefined) ?? null,
        city: (cf?.city as string | undefined) ?? null,
        postalCode: (cf?.postalCode as string | undefined) ?? null,
        latitude: (cf?.latitude as string | undefined) ?? null,
        longitude: (cf?.longitude as string | undefined) ?? null,
        cfTimezone: (cf?.timezone as string | undefined) ?? null,
        asn: (cf?.asn as number | undefined) ?? null,
        asOrganization: (cf?.asOrganization as string | undefined) ?? null,
        httpProtocol: (cf?.httpProtocol as string | undefined) ?? null,
        tlsVersion: (cf?.tlsVersion as string | undefined) ?? null,
        cfRay: c.req.header("CF-Ray") ?? null,
        createdAt: Date.now(),
      };
      await db.insert(visits).values(row);
      return c.json({ ok: true });
    },
  )

  // ── Admin analytics (all behind `adminAuth`) ───────────────────────────────

  // Lets the dashboard validate the entered password; reaching here = authorized.
  .post("/api/admin/verify", (c) => c.json({ ok: true }))

  // Filtered, paginated visit log (newest first). Powers the table and the map.
  .get(
    "/api/admin/visits",
    zValidator(
      "query",
      z.object({
        ...visitFilterShape,
        before: z.coerce.number().int().positive().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
      }),
    ),
    async (c) => {
      const f = c.req.valid("query");
      const db = getDb(c.env.DB);
      const conds = visitConditions(f);
      if (f.before !== undefined) conds.push(lt(visits.createdAt, f.before));
      const where = conds.length ? and(...conds) : undefined;

      const rows = await db
        .select()
        .from(visits)
        .where(where)
        .orderBy(desc(visits.createdAt))
        .limit(f.limit + 1);

      const hasMore = rows.length > f.limit;
      const page = hasMore ? rows.slice(0, f.limit) : rows;
      return c.json({ visits: page, hasMore });
    },
  )

  // Aggregates for the summary cards, charts (time-of-day + daily trend), and
  // the map's per-city clusters. Honors the same filters as the visit log.
  .get(
    "/api/admin/stats",
    zValidator("query", z.object(visitFilterShape)),
    async (c) => {
      const f = c.req.valid("query");
      const db = getDb(c.env.DB);
      const conds = visitConditions(f);
      const where = conds.length ? and(...conds) : undefined;

      // SQLite localizes the epoch-ms timestamp to KST for the time buckets.
      const kstHour = sql<string>`strftime('%H', datetime(${visits.createdAt} / 1000, 'unixepoch', '+9 hours'))`;
      const kstDay = sql<string>`strftime('%Y-%m-%d', datetime(${visits.createdAt} / 1000, 'unixepoch', '+9 hours'))`;

      const [totals] = await db
        .select({
          total: count(),
          uniqueIps: sql<number>`COUNT(DISTINCT ${visits.ip})`,
        })
        .from(visits)
        .where(where);

      const byCountry = await db
        .select({ key: visits.country, count: count() })
        .from(visits)
        .where(where)
        .groupBy(visits.country)
        .orderBy(desc(count()))
        .limit(20);

      const byDevice = await db
        .select({ key: visits.deviceType, count: count() })
        .from(visits)
        .where(where)
        .groupBy(visits.deviceType)
        .orderBy(desc(count()));

      const byBrowser = await db
        .select({ key: visits.browser, count: count() })
        .from(visits)
        .where(where)
        .groupBy(visits.browser)
        .orderBy(desc(count()))
        .limit(12);

      const byCity = await db
        .select({
          city: visits.city,
          country: visits.country,
          lat: visits.latitude,
          lng: visits.longitude,
          count: count(),
        })
        .from(visits)
        .where(where)
        .groupBy(visits.city, visits.country, visits.latitude, visits.longitude)
        .orderBy(desc(count()))
        .limit(200);

      const byHour = await db
        .select({ key: kstHour, count: count() })
        .from(visits)
        .where(where)
        .groupBy(kstHour)
        .orderBy(asc(kstHour));

      const byDay = await db
        .select({ key: kstDay, count: count() })
        .from(visits)
        .where(where)
        .groupBy(kstDay)
        .orderBy(asc(kstDay));

      return c.json({
        total: totals?.total ?? 0,
        uniqueIps: totals?.uniqueIps ?? 0,
        byCountry,
        byDevice,
        byBrowser,
        byCity,
        byHour,
        byDay,
      });
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
        ciphertext: z.string().min(1).max(MAX_CIPHERTEXT_LENGTH),
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
