"use client";

import { useRef, useState } from "react";
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  async function submit() {
    const text = value.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await onSend(text);
      setValue("");
      setShowEmoji(false);
      inputRef.current?.focus();
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
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="메시지를 입력하세요 (텍스트·이모지)"
          rows={1}
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
