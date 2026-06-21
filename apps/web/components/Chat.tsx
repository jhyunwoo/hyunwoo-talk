"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  encryptMessage,
  tryDecryptMessage,
  type ChatMessage,
  type DecryptedMessage,
} from "@repo/shared";
import { fetchMessages, sendMessage } from "../lib/api";
import { enablePush, pushSupported } from "../lib/push";
import type { AuthState } from "../lib/store";
import { Composer } from "./Composer";
import styles from "./Chat.module.css";

const PAGE_SIZE = 50;
const OLDER_PAGE_SIZE = 30;
const POLL_INTERVAL_MS = 4000;

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
  const [pushOn, setPushOn] = useState(false);

  const seenIds = useRef<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  /** Merge new decrypted messages in, de-duplicating by id, sorted by time. */
  const merge = useCallback((incoming: DecryptedMessage[]) => {
    if (incoming.length === 0) return;
    setItems((prev) => {
      const next = prev.slice();
      let changed = false;
      for (const m of incoming) {
        if (seenIds.current.has(m.id)) continue;
        seenIds.current.add(m.id);
        next.push(m);
        changed = true;
      }
      if (!changed) return prev;
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
        requestAnimationFrame(() => scrollToBottom("auto"));
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, peerId, password]);

  // Live polling for new messages.
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = setInterval(async () => {
      const after =
        items.length > 0 ? items[items.length - 1]!.ts : undefined;
      try {
        const { messages } = await fetchMessages({
          userId,
          peerId,
          after,
          limit: 100,
        });
        if (!active || messages.length === 0) return;
        const stick = isNearBottom();
        const decrypted = await decryptBatch(messages, password);
        merge(decrypted);
        if (stick) requestAnimationFrame(() => scrollToBottom("smooth"));
      } catch {
        /* transient network error — retry next tick */
      }
    }, POLL_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, items, userId, peerId, password]);

  // Enable push once on mount (best-effort).
  useEffect(() => {
    if (!pushSupported()) return;
    enablePush(userId)
      .then(setPushOn)
      .catch(() => setPushOn(false));
  }, [userId]);

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
              {pushSupported()
                ? pushOn
                  ? "알림 켜짐 · 종단간 암호화"
                  : "종단간 암호화"
                : "종단간 암호화"}
            </div>
          </div>
        </div>
        <button className={styles.logout} onClick={onLogout} title="로그아웃">
          나가기
        </button>
      </header>

      <div className={styles.messages} ref={scrollRef} onScroll={onScroll}>
        {hasMore && (
          <div className={styles.loadMore}>
            {loadingOlder ? "불러오는 중…" : "위로 스크롤하여 이전 대화 보기"}
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
