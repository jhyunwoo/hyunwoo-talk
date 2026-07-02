"use client";

import { useRef, useState } from "react";
import { MAX_MESSAGE_CHARS } from "@repo/shared";
import styles from "./Composer.module.css";

const QUICK_EMOJIS = [
  "😀", "😂", "🥹", "😍", "😎", "🤔", "👍", "🙏",
  "🎉", "❤️", "🔥", "✨", "😭", "😅", "🥳", "👀",
];

interface ComposerProps {
  onSend: (text: string) => void | Promise<void>;
}

export function Composer({ onSend }: ComposerProps) {
  const [value, setValue] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      await onSend(text);
      setValue("");
      setShowEmoji(false);
      inputRef.current?.focus();
    } catch (err) {
      // Previously a failed send (network error, timeout, server 5xx) was a
      // silent unhandled rejection — the message just vanished with no sign
      // anything went wrong. Surface it and keep the draft so the user can
      // retry instead of retyping.
      setError(err instanceof Error ? err.message : "전송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  function insertEmoji(emoji: string) {
    setValue((v) => v + emoji);
    inputRef.current?.focus();
  }

  return (
    <div className={styles.wrap}>
      {error && <p className={styles.error}>{error}</p>}
      {showEmoji && (
        <div className={styles.emojiPanel}>
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className={styles.emoji}
              onClick={() => insertEmoji(e)}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className={styles.bar}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setShowEmoji((s) => !s)}
          aria-label="이모지"
        >
          😊
        </button>
        <textarea
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          placeholder="메시지를 입력하세요 (텍스트·이모지)"
          rows={1}
          maxLength={MAX_MESSAGE_CHARS}
        />
        <button
          type="button"
          className={styles.send}
          onClick={() => void submit()}
          disabled={!value.trim() || sending}
          aria-label="보내기"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
