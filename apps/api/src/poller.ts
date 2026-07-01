import { DurableObject } from "cloudflare:workers";
import { eq, inArray } from "drizzle-orm";
import {
  appendToMemo,
  kstHour,
  msUntilKstHour,
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

const IDLE_INTERVAL_MS = 60_000; // normal polling: once a minute
const ACTIVE_INTERVAL_MS = 2_000; // fast polling while a chat is active
const ACTIVE_WINDOW_MS = 60 * 60 * 1000; // active mode lasts 1h after each message
const QUIET_START_HOUR = 0; // no polling from 00:00 ...
const QUIET_END_HOUR = 5; // ... until 05:00 KST
const SESSION_KEY = "phpsessid";
const ACTIVE_UNTIL_KEY = "active-until"; // unix ms; fast-poll until this time

/** True during the 00:00–05:00 KST window when we pause the polling read loop. */
function inQuietHours(now: number = Date.now()): boolean {
  const hour = kstHour(now);
  return hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR;
}

/**
 * One Durable Object instance per mailbox `seq`. It owns the Touchgym session
 * and is the single writer to both the memo and the database, which keeps the
 * polling loop and outbound sends race-free.
 *
 * Polling is adaptive: once a minute while idle, every 2 seconds for an hour
 * after any message is sent or received, and fully paused 00:00–05:00 KST.
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
        case "/api/ws":
          return await this.handleWsUpgrade(request, url);
        case "/ensure": {
          await this.ensureAlarm();
          return Response.json({ ok: true });
        }
        case "/poll": {
          const result = await this.poll();
          await this.scheduleNextAlarm();
          return Response.json({ ok: true, ...result });
        }
        case "/send": {
          const message = (await request.json()) as ChatMessage;
          await this.send(message);
          await this.scheduleNextAlarm();
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
      if (!inQuietHours()) await this.poll();
    } catch (err) {
      console.error("[poller] poll failed:", err);
    } finally {
      await this.scheduleNextAlarm();
    }
  }

  /**
   * Schedule the next poll: skip to 05:00 KST during quiet hours, otherwise
   * every 2s while a chat is active (a message was sent/received in the last
   * hour) and every minute when idle.
   */
  private async scheduleNextAlarm(): Promise<void> {
    const now = Date.now();
    if (inQuietHours(now)) {
      await this.ctx.storage.setAlarm(now + msUntilKstHour(QUIET_END_HOUR, now));
      return;
    }
    const activeUntil =
      (await this.ctx.storage.get<number>(ACTIVE_UNTIL_KEY)) ?? 0;
    // While a web client holds a WebSocket open, poll Touchgym fast so inbound
    // (console-user) messages reach it near-instantly.
    const hasSockets = this.ctx.getWebSockets().length > 0;
    const interval =
      hasSockets || now < activeUntil ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
    await this.ctx.storage.setAlarm(now + interval);
  }

  private async ensureAlarm(): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current !== null) return;
    const now = Date.now();
    const delay = inQuietHours(now)
      ? msUntilKstHour(QUIET_END_HOUR, now)
      : 1_000;
    await this.ctx.storage.setAlarm(now + delay);
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
            this.broadcast(message);
            await this.notify(message);
          }
          ingested = fresh.length;
          await this.armActiveWindow();
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

    this.broadcast(message);
    await this.armActiveWindow();
  }

  /** Enter (or extend) fast-poll mode for an hour after any message activity. */
  private async armActiveWindow(): Promise<void> {
    await this.ctx.storage.put(ACTIVE_UNTIL_KEY, Date.now() + ACTIVE_WINDOW_MS);
  }

  // ── Real-time WebSocket fan-out ────────────────────────────────────────────

  /**
   * Accept a hibernatable WebSocket from a web client. The connection is
   * receive-only (sends still go through POST /api/messages so the DO stays the
   * single writer); we just push new messages to it as they are ingested/sent.
   */
  private async handleWsUpgrade(request: Request, url: URL): Promise<Response> {
    if ((request.headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade", { status: 426 });
    }
    const userId = url.searchParams.get("userId") ?? undefined;
    const peerId = url.searchParams.get("peerId") ?? undefined;

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    // Survives hibernation; lets broadcast() target only this user's threads.
    server.serializeAttachment({ userId, peerId });
    // Keepalive answered by the runtime without waking the DO.
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong"),
    );

    // Someone is watching: fast-poll Touchgym and make sure the loop is alive.
    await this.armActiveWindow();
    await this.ensureAlarm();

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Push a new message to every connected client it concerns. */
  private broadcast(message: ChatMessage): void {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length === 0) return;
    const payload = JSON.stringify({ type: "message", message });
    for (const ws of sockets) {
      const att = ws.deserializeAttachment() as { userId?: string } | null;
      const uid = att?.userId;
      // Untagged sockets receive everything; tagged ones only their own threads.
      if (uid && uid !== message.fromId && uid !== message.toId) continue;
      try {
        ws.send(payload);
      } catch {
        /* socket already gone; the runtime will fire webSocketClose */
      }
    }
  }

  override async webSocketMessage(): Promise<void> {
    // Clients only send "ping" keepalives, which setWebSocketAutoResponse
    // answers without waking the DO. Nothing else to handle.
  }

  override async webSocketClose(
    ws: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    try {
      ws.close(code, reason);
    } catch {
      /* already closed */
    }
  }

  override async webSocketError(): Promise<void> {
    /* the runtime removes the socket; nothing to clean up */
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
