import { API_BASE } from "./api";
import type { ChatMessage } from "@repo/shared";

// http(s)://host -> ws(s)://host
const WS_BASE = API_BASE.replace(/^http/i, "ws");

const PING_INTERVAL_MS = 25_000;
const MAX_RECONNECT_MS = 15_000;

export interface MessageSocket {
  /** True while the socket is connected and ready. */
  isOpen(): boolean;
  /** Stop reconnecting and close the connection. */
  close(): void;
  /**
   * Drop the current connection (if any) and reconnect immediately, bypassing
   * backoff. Mobile OSes can silently kill the underlying pipe when a PWA is
   * backgrounded without ever firing `onclose` — so `isOpen()` keeps reporting
   * a "zombie" connection that will never receive anything again. Call this
   * when the app becomes visible/foregrounded again to guarantee a live socket.
   */
  reconnectNow(): void;
}

interface MessageSocketOptions {
  userId: string;
  peerId: string;
  /** Called with each decoded `{ type: "message", message }` payload. */
  onMessage: (message: ChatMessage) => void;
  /** Called every time the socket (re)connects — use it to catch up on gaps. */
  onOpen?: () => void;
  /** Reflects connection state changes (for UI/fallback). */
  onStatusChange?: (open: boolean) => void;
}

/**
 * Live message stream over a WebSocket to the mailbox Durable Object, with
 * automatic reconnect (exponential backoff) and a lightweight app-level ping
 * keepalive. Receive-only: outbound messages still go through the REST send so
 * the DO remains the single writer.
 */
export function openMessageSocket(opts: MessageSocketOptions): MessageSocket {
  const url =
    `${WS_BASE}/api/ws?userId=${encodeURIComponent(opts.userId)}` +
    `&peerId=${encodeURIComponent(opts.peerId)}`;

  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectDelay = 1_000;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const stopPing = () => {
    if (pingTimer) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  };

  const connect = () => {
    if (closed) return;
    let sock: WebSocket;
    try {
      sock = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws = sock;

    sock.onopen = () => {
      reconnectDelay = 1_000;
      opts.onStatusChange?.(true);
      opts.onOpen?.();
      pingTimer = setInterval(() => {
        if (sock.readyState === WebSocket.OPEN) sock.send("ping");
      }, PING_INTERVAL_MS);
    };

    sock.onmessage = (ev) => {
      if (typeof ev.data !== "string" || ev.data === "pong") return;
      try {
        const data = JSON.parse(ev.data) as {
          type?: string;
          message?: ChatMessage;
        };
        if (data.type === "message" && data.message) opts.onMessage(data.message);
      } catch {
        /* ignore malformed frame */
      }
    };

    sock.onclose = () => {
      stopPing();
      if (ws === sock) ws = null;
      opts.onStatusChange?.(false);
      scheduleReconnect();
    };

    sock.onerror = () => {
      // Let onclose drive the reconnect; just ensure the socket is torn down.
      try {
        sock.close();
      } catch {
        /* noop */
      }
    };
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_MS);
  };

  connect();

  return {
    isOpen: () => ws !== null && ws.readyState === WebSocket.OPEN,
    close: () => {
      closed = true;
      stopPing();
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      try {
        ws?.close();
      } catch {
        /* noop */
      }
      ws = null;
    },
    reconnectNow: () => {
      if (closed) return;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      reconnectDelay = 1_000;
      stopPing();
      if (ws) {
        const stale = ws;
        ws = null;
        // Detach handlers first so the old socket's belated close/error can't
        // race with (or duplicate) the new connection we're about to open.
        stale.onopen = null;
        stale.onmessage = null;
        stale.onclose = null;
        stale.onerror = null;
        try {
          stale.close();
        } catch {
          /* noop */
        }
      }
      connect();
    },
  };
}
