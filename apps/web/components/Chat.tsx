"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  encryptMessage,
  tryDecryptMessage,
  MAX_CIPHERTEXT_LENGTH,
  type ChatMessage,
  type DecryptedMessage,
} from "@repo/shared";
import { fetchMessages, sendMessage } from "../lib/api";
import { openMessageSocket } from "../lib/ws";
import {
  disablePush,
  enablePush,
  pushSupported,
  refreshPush,
} from "../lib/push";
import type { AuthState } from "../lib/store";
import { Composer } from "./Composer";
import styles from "./Chat.module.css";

const PAGE_SIZE = 50;
const OLDER_PAGE_SIZE = 30;
// Fallback catch-up cadence used only while the WebSocket is disconnected.
const LIVE_FALLBACK_MS = 12000;

// Run before paint on the client so the first visible frame is already scrolled
// to the newest message; fall back to useEffect on the server (SSR) to avoid the
// useLayoutEffect warning.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface ChatProps {
  auth: AuthState;
  onLogout: () => void;
}

async function decryptBatch(
  raw: ChatMessage[],
  password: string,
): Promise<DecryptedMessage[]> {
  return Promise.all(
    raw.map(async (m) => ({
      ...m,
      text: await tryDecryptMessage(m.ciphertext, password),
    })),
  );
}

export function Chat({ auth, onLogout }: ChatProps) {
  const { userId, peerId, password } = auth;

  const [items, setItems] = useState<DecryptedMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [ready, setReady] = useState(false);
  const [pushSupport, setPushSupport] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDenied, setPushDenied] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  /** Newest message timestamp seen, for catch-up fetches on (re)connect. */
  const lastTsRef = useRef(0);

  /**
   * Merge new decrypted messages in, de-duplicating by id, sorted by time.
   * Pure: dedupes against the previous state (never a side-effecting ref) so
   * React re-invoking the updater — e.g. under concurrent rendering — can't
   * drop a batch and leave the id "seen but not shown".
   */
  const merge = useCallback((incoming: DecryptedMessage[]) => {
    if (incoming.length === 0) return;
    setItems((prev) => {
      const known = new Set(prev.map((m) => m.id));
      const additions = incoming.filter((m) => !known.has(m.id));
      if (additions.length === 0) return prev;
      const next = prev.concat(additions);
      next.sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
      return next;
    });
  }, []);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { messages, hasMore: more } = await fetchMessages({
          userId,
          peerId,
          limit: PAGE_SIZE,
        });
        if (cancelled) return;
        const decrypted = await decryptBatch(messages, password);
        if (cancelled) return;
        merge(decrypted);
        setHasMore(more);
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, peerId, password]);

  // Jump to the newest message on first load. Done in a layout effect — after
  // the messages commit, before paint — so the view starts at the bottom.
  // (The previous rAF approach raced the React commit on mobile and left the
  // view stuck on the oldest message.) Direct scrollTop is instant regardless
  // of any scroll-behavior, and runs only once.
  const didInitialScroll = useRef(false);
  useIsomorphicLayoutEffect(() => {
    if (didInitialScroll.current || !ready) return;
    didInitialScroll.current = true;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ready]);

  // Track the newest timestamp so reconnect catch-up fetches only the gap.
  useEffect(() => {
    if (items.length > 0) lastTsRef.current = items[items.length - 1]!.ts;
  }, [items]);

  // Live updates over a WebSocket: the mailbox Durable Object pushes each new
  // message (ingested from Touchgym or sent by a web client) in real time. On
  // every (re)connect we catch up on anything missed while disconnected, and a
  // slow fallback poll runs only while the socket is down.
  useEffect(() => {
    if (!ready) return;
    let active = true;

    const catchUp = async () => {
      try {
        const after = lastTsRef.current || undefined;
        const { messages } = await fetchMessages({
          userId,
          peerId,
          after,
          limit: 100,
        });
        if (!active || messages.length === 0) return;
        const stick = isNearBottom();
        const decrypted = await decryptBatch(messages, password);
        if (!active) return;
        merge(decrypted);
        if (stick) requestAnimationFrame(() => scrollToBottom("smooth"));
      } catch {
        /* transient — the socket or the next fallback tick will retry */
      }
    };

    const handleMessage = async (message: ChatMessage) => {
      // Defense in depth: only accept messages belonging to this exact
      // thread, even though the server already scopes broadcasts by peer.
      const belongsToThread =
        (message.fromId === userId && message.toId === peerId) ||
        (message.fromId === peerId && message.toId === userId);
      if (!belongsToThread) return;
      const stick = isNearBottom();
      const [decrypted] = await decryptBatch([message], password);
      if (!active || !decrypted) return;
      merge([decrypted]);
      if (stick) requestAnimationFrame(() => scrollToBottom("smooth"));
    };

    const socket = openMessageSocket({
      userId,
      peerId,
      onOpen: () => void catchUp(),
      onMessage: (message) => void handleMessage(message),
    });

    // Safety net: poll only while the socket can't stay connected.
    const fallback = setInterval(() => {
      if (!socket.isOpen()) void catchUp();
    }, LIVE_FALLBACK_MS);

    // Mobile OSes routinely suspend or kill the socket's underlying pipe when
    // the PWA is backgrounded, often without ever firing a close event — so
    // isOpen() can report a "zombie" connection that will never receive
    // another message. Whenever the app becomes visible/foregrounded again
    // (tab switch, app resume, bfcache restore, or regained connectivity),
    // force a fresh socket and immediately fetch anything we missed.
    const onResume = () => {
      if (document.visibilityState !== "visible") return;
      socket.reconnectNow();
      void catchUp();
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("pageshow", onResume);
    window.addEventListener("online", onResume);

    return () => {
      active = false;
      clearInterval(fallback);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("pageshow", onResume);
      window.removeEventListener("online", onResume);
      socket.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, userId, peerId, password]);

  // Reflect the current notification state on mount without prompting. When
  // permission is already granted, refreshPush silently re-subscribes (and
  // re-syncs the backend) so a device that had push on — e.g. before the PWA
  // was deleted and reopened — shows on again instead of falsely showing off.
  useEffect(() => {
    if (!pushSupported()) return;
    setPushSupport(true);
    setPushDenied(Notification.permission === "denied");
    refreshPush(userId)
      .then(setPushOn)
      .catch(() => setPushOn(false));
  }, [userId]);

  // Keep the chat pinned to the visual viewport so the keyboard (iOS especially)
  // doesn't scroll the header out of view. We mirror visualViewport's height and
  // top offset into CSS variables that `.chat` consumes; when the keyboard opens
  // we also keep the latest message in view.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    let prevHeight = vv.height;
    const apply = () => {
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-offset-top", `${vv.offsetTop}px`);
      if (vv.height < prevHeight - 60) {
        requestAnimationFrame(() => scrollToBottom("auto"));
      }
      prevHeight = vv.height;
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-offset-top");
    };
  }, [scrollToBottom]);

  const togglePush = useCallback(async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        const ok = await enablePush(userId);
        setPushOn(ok);
        setPushDenied(!ok && Notification.permission === "denied");
      }
    } catch {
      setPushOn(false);
    } finally {
      setPushBusy(false);
    }
  }, [pushBusy, pushOn, userId]);

  const loadOlder = useCallback(async () => {
    if (loadingOlder || !hasMore || items.length === 0) return;
    setLoadingOlder(true);
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    try {
      const oldestTs = items[0]!.ts;
      const { messages, hasMore: more } = await fetchMessages({
        userId,
        peerId,
        before: oldestTs,
        limit: OLDER_PAGE_SIZE,
      });
      const decrypted = await decryptBatch(messages, password);
      merge(decrypted);
      setHasMore(more);
      // Preserve scroll position after prepending.
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [loadingOlder, hasMore, items, userId, peerId, password, merge]);

  const onScroll = useCallback(() => {
    if (scrollRef.current && scrollRef.current.scrollTop < 60) {
      void loadOlder();
    }
  }, [loadOlder]);

  const handleSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const ciphertext = await encryptMessage(trimmed, password);
      if (ciphertext.length > MAX_CIPHERTEXT_LENGTH) {
        // The textarea's maxLength already prevents this in the common case;
        // this guards against pasted text and keeps a single message from
        // threatening the Touchgym memo's ~16KB budget.
        throw new Error(
          "메시지가 너무 깁니다. 조금 더 짧게 나눠서 보내주세요.",
        );
      }
      const message = await sendMessage({
        fromId: userId,
        toId: peerId,
        ciphertext,
      });
      merge([{ ...message, text: trimmed }]);
      requestAnimationFrame(() => scrollToBottom("smooth"));
    },
    [password, userId, peerId, merge, scrollToBottom],
  );

  return (
    <div className={styles.chat}>
      <header className={styles.header}>
        <div className={styles.peer}>
          <span className={styles.avatar}>{peerId.charAt(0).toUpperCase()}</span>
          <div>
            <div className={styles.peerName}>{peerId}</div>
            <div className={styles.peerMeta}>
              {pushOn ? "알림 켜짐 · 종단간 암호화" : "종단간 암호화"}
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          {pushSupport && (
            <button
              className={`${styles.notify} ${pushOn ? styles.notifyOn : ""}`}
              onClick={togglePush}
              disabled={pushBusy}
              aria-pressed={pushOn}
              title={
                pushOn
                  ? "알림 끄기"
                  : pushDenied
                    ? "브라우저에서 알림이 차단되어 있습니다"
                    : "알림 켜기"
              }
              aria-label="알림 설정"
            >
              {pushOn ? <BellOnIcon /> : <BellOffIcon />}
            </button>
          )}
          <button className={styles.logout} onClick={onLogout} title="로그아웃">
            나가기
          </button>
        </div>
      </header>

      <div className={styles.messages} ref={scrollRef} onScroll={onScroll}>
        {hasMore && (
          <div className={styles.loadMore}>
            {loadingOlder ? (
              <>
                <span className={styles.miniSpinner} aria-hidden="true" />
                불러오는 중…
              </>
            ) : (
              "위로 스크롤하여 이전 대화 보기"
            )}
          </div>
        )}
        {!ready && (
          <div className={styles.loading}>
            <span className={styles.spinner} aria-hidden="true" />
            <span>대화를 불러오는 중…</span>
          </div>
        )}
        {ready && items.length === 0 && (
          <div className={styles.empty}>
            아직 대화가 없습니다. 첫 메시지를 보내보세요!
          </div>
        )}
        {items.map((m, i) => {
          const mine = m.fromId === userId;
          const prev = items[i - 1];
          const showDay =
            !prev || !isSameDay(prev.ts, m.ts);
          return (
            <div key={m.id}>
              {showDay && (
                <div className={styles.daySep}>{formatDay(m.ts)}</div>
              )}
              <div
                className={`${styles.row} ${mine ? styles.rowMine : styles.rowTheirs}`}
              >
                <div
                  className={`${styles.bubble} ${mine ? styles.mine : styles.theirs}`}
                >
                  <span className={styles.text}>
                    {m.text ?? "🔒 복호화 실패 (비밀번호 불일치)"}
                  </span>
                  <span className={styles.time}>{formatTime(m.ts)}</span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <Composer onSend={handleSend} />
    </div>
  );
}

function BellOnIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function BellOffIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      <path d="M18.63 13A17.89 17.89 0 0 1 18 8" />
      <path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

function isSameDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
