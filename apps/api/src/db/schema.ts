import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

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

export type MessageRow = typeof messages.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
