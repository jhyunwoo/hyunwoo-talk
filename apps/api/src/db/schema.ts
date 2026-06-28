import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";

/**
 * Every message ever seen, persisted permanently. Touchgym only keeps
 * yesterday + today, so this table is the durable archive that powers the
 * web app's infinite scroll.
 */
export const messages = sqliteTable(
  "messages",
  {
    /** Sender-generated unique id (also used in the memo line). */
    id: text("id").primaryKey(),
    /** Touchgym member `seq` the message was transported through. */
    mailboxSeq: text("mailbox_seq").notNull(),
    fromId: text("from_id").notNull(),
    toId: text("to_id").notNull(),
    /** AES-GCM payload (base64). Plaintext is never stored. */
    ciphertext: text("ciphertext").notNull(),
    /** Message time, unix epoch ms. */
    ts: integer("ts").notNull(),
    /** Row insertion time, unix epoch ms. */
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("messages_to_ts_idx").on(table.toId, table.ts),
    index("messages_from_ts_idx").on(table.fromId, table.ts),
    index("messages_ts_idx").on(table.ts),
  ],
);

/** Web Push subscriptions, keyed by endpoint, owned by a user id. */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id").notNull(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("push_user_idx").on(table.userId)],
);

/**
 * Per-visit telemetry: one row each time the web app loads. Server-side fields
 * (ip, geo, asn, tls…) come from the Cloudflare request; client-side fields
 * (screen, timezone, cpu/memory…) are posted by the browser. Best-effort —
 * any field may be null when the source doesn't provide it.
 */
export const visits = sqliteTable(
  "visits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** App user id, if the visitor is logged in. */
    userId: text("user_id"),

    /** Client IP (Cloudflare's CF-Connecting-IP). */
    ip: text("ip"),
    /** Raw User-Agent header. */
    userAgent: text("user_agent"),
    /** Parsed browser name + version. */
    browser: text("browser"),
    /** Parsed OS name + version. */
    os: text("os"),
    /** mobile | tablet | desktop. */
    deviceType: text("device_type"),

    /** Path + query of the visited page. */
    page: text("page"),
    /** document.referrer. */
    referrer: text("referrer"),
    /** navigator.language. */
    language: text("language"),
    /** Accept-Language header. */
    acceptLanguage: text("accept_language"),
    /** navigator.languages, comma-joined. */
    languages: text("languages"),
    /** IANA timezone reported by the client (Intl). */
    timezone: text("timezone"),
    /** "WxH" physical screen size. */
    screen: text("screen"),
    /** "WxH" viewport size. */
    viewport: text("viewport"),
    /** devicePixelRatio. */
    pixelRatio: real("pixel_ratio"),
    /** navigator.hardwareConcurrency (logical CPU cores). */
    cpuCores: integer("cpu_cores"),
    /** navigator.deviceMemory (GB, coarse). */
    deviceMemory: real("device_memory"),
    /** Whether the device reports touch support. */
    touch: integer("touch", { mode: "boolean" }),
    /** navigator.connection.effectiveType (e.g. 4g). */
    connectionType: text("connection_type"),

    /** Geo, from Cloudflare's edge. */
    country: text("country"),
    region: text("region"),
    city: text("city"),
    postalCode: text("postal_code"),
    latitude: text("latitude"),
    longitude: text("longitude"),
    /** Timezone Cloudflare inferred for the IP. */
    cfTimezone: text("cf_timezone"),

    /** Network, from Cloudflare. */
    asn: integer("asn"),
    asOrganization: text("as_organization"),

    /** Connection metadata, from Cloudflare. */
    httpProtocol: text("http_protocol"),
    tlsVersion: text("tls_version"),
    /** CF-Ray id, for correlating with Cloudflare logs. */
    cfRay: text("cf_ray"),

    /** Row insertion time, unix epoch ms. */
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("visits_created_idx").on(table.createdAt),
    index("visits_ip_idx").on(table.ip),
  ],
);

export type MessageRow = typeof messages.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type VisitRow = typeof visits.$inferSelect;
