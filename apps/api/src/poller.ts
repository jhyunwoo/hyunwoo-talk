import { DurableObject } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import {
  appendToMemo,
  parseMemo,
  pruneMemo,
  type ChatMessage,
} from "@repo/shared";
import type { Bindings } from "./bindings";
import { getDb, type Db } from "./db";
import { messages, pushSubscriptions } from "./db/schema";
import {
  TouchgymSessionExpiredError,
  extractMemo,
  fetchMemberHtml,
  touchgymLogin,
  writeMemo,
  type TouchgymSession,
} from "./lib/touchgym";
import { sendWebPush, type VapidDetails } from "./lib/push";

const POLL_INTERVAL_MS = 10_000;
const SESSION_KEY = "phpsessid";

/**
 * One Durable Object instance per mailbox `seq`. It owns the Touchgym session
 * and is the single writer to both the memo and the database, which keeps the
 * 10-second polling loop and outbound sends race-free.
 */
export class Poller extends DurableObject<Bindings> {
  private db: Db;

  constructor(ctx: DurableObjectState, env: Bindings) {
    super(ctx, env);
    this.db = getDb(env.DB);
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case "/ensure": {
          await this.ensureAlarm();
          return Response.json({ ok: true });
        }
        case "/poll": {
          const result = await this.poll();
          await this.ensureAlarm();
          return Response.json({ ok: true, ...result });
        }
        case "/send": {
          const message = (await request.json()) as ChatMessage;
          await this.send(message);
          return Response.json({ ok: true });
        }
        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ ok: false, error: message }, { status: 200 });
    }
  }

  /** Durable Object alarm — fires the recurring poll and reschedules itself. */
  override async alarm(): Promise<void> {
    try {
      await this.poll();
    } catch (err) {
      console.error("[poller] poll failed:", err);
    } finally {
      await this.ctx.storage.setAlarm(Date.now() + POLL_INTERVAL_MS);
    }
  }

  private async ensureAlarm(): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null) {
      await this.ctx.storage.setAlarm(Date.now() + 1_000);
    }
  }

  /** Run a request with the cached session, re-logging in once if it expired. */
  private async withSession<T>(
    run: (session: TouchgymSession) => Promise<T>,
  ): Promise<T> {
    let session =
      (await this.ctx.storage.get<TouchgymSession>(SESSION_KEY)) ?? null;
    if (!session) session = await this.login();
    try {
      return await run(session);
    } catch (err) {
      if (err instanceof TouchgymSessionExpiredError) {
        session = await this.login();
        return run(session);
      }
      throw err;
    }
  }

  private async login(): Promise<TouchgymSession> {
    const session = await touchgymLogin({
      clubId: this.env.TOUCHGYM_CLUB_ID,
      loginId: this.env.TOUCHGYM_ID,
      password: this.env.TOUCHGYM_PASSWORD,
    });
    await this.ctx.storage.put(SESSION_KEY, session);
    return session;
  }

  /** Poll the memo, archive new messages, notify recipients, prune retention. */
  async poll(): Promise<{ ingested: number }> {
    const seq = this.env.MAILBOX_SEQ;

    return this.withSession(async (session) => {
      const html = await fetchMemberHtml(session, seq);
      const memo = extractMemo(html);
      const incoming = parseMemo(memo);

      let ingested = 0;
      if (incoming.length > 0) {
        const ids = incoming.map((m) => m.id);
        const existing = await this.db
          .select({ id: messages.id })
          .from(messages)
          .where(inArray(messages.id, ids));
        const known = new Set(existing.map((r) => r.id));
        const fresh = incoming.filter((m) => !known.has(m.id));

        if (fresh.length > 0) {
          await this.db
            .insert(messages)
            .values(fresh.map((m) => this.toRow(m, seq)))
            .onConflictDoNothing();
          for (const message of fresh) {
            await this.notify(message);
          }
          ingested = fresh.length;
        }
      }

      // Retention: keep only yesterday + today in the memo.
      const pruned = pruneMemo(memo);
      if (parseMemo(pruned).length !== incoming.length) {
        await writeMemo(session, seq, html, pruned);
      }

      return { ingested };
    });
  }

  /** Append an outbound message to the memo and archive it. */
  async send(message: ChatMessage): Promise<void> {
    const seq = this.env.MAILBOX_SEQ;
    await this.withSession(async (session) => {
      const html = await fetchMemberHtml(session, seq);
      const memo = extractMemo(html);
      const nextMemo = appendToMemo(memo, message);
      await writeMemo(session, seq, html, nextMemo);
    });

    await this.db
      .insert(messages)
      .values(this.toRow(message, seq))
      .onConflictDoNothing();
  }

  private toRow(message: ChatMessage, mailboxSeq: string) {
    return {
      id: message.id,
      mailboxSeq,
      fromId: message.fromId,
      toId: message.toId,
      ciphertext: message.ciphertext,
      ts: message.ts,
      createdAt: Date.now(),
    };
  }

  /** Fan out a Web Push notification to every subscription of the recipient. */
  private async notify(message: ChatMessage): Promise<void> {
    const vapid = this.vapid();
    if (!vapid) return;

    const subs = await this.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, message.toId));
    if (subs.length === 0) return;

    const payload = JSON.stringify({ type: "message", message });
    for (const sub of subs) {
      try {
        const result = await sendWebPush(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          vapid,
        );
        if (result.status === 404 || result.status === 410) {
          await this.db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, sub.id));
        }
      } catch (err) {
        console.error("[poller] push failed:", err);
      }
    }
  }

  private vapid(): VapidDetails | null {
    if (
      !this.env.VAPID_PUBLIC_KEY ||
      !this.env.VAPID_PRIVATE_KEY ||
      !this.env.VAPID_SUBJECT
    ) {
      return null;
    }
    return {
      subject: this.env.VAPID_SUBJECT,
      publicKey: this.env.VAPID_PUBLIC_KEY,
      privateKey: this.env.VAPID_PRIVATE_KEY,
    };
  }
}
