"use client";

import { useState } from "react";
import type { AuthState } from "../lib/store";
import styles from "./Login.module.css";

interface LoginProps {
  onSubmit: (auth: AuthState) => void;
}

export function Login({ onSubmit }: LoginProps) {
  const [userId, setUserId] = useState("");
  const [peerId, setPeerId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const u = userId.trim();
    const p = peerId.trim();
    if (!u || !p || !password) {
      setError("모든 항목을 입력해 주세요.");
      return;
    }
    if (u.includes("|") || p.includes("|")) {
      setError("ID에 '|' 문자는 사용할 수 없습니다.");
      return;
    }
    if (u === p) {
      setError("내 ID와 상대방 ID는 달라야 합니다.");
      return;
    }
    onSubmit({ userId: u, peerId: p, password });
  }

  return (
    <div className={styles.wrap}>
      <form className={styles.card} onSubmit={handleSubmit}>
        <div className={styles.brand}>
          <span className={styles.logo}>💬</span>
          <h1>Hyunwoo Talk</h1>
          <p className={styles.tagline}>종단간 암호화 1:1 메시지</p>
        </div>

        <label className={styles.field}>
          <span>내 ID</span>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="예: hyunwoo"
            autoComplete="off"
            autoCapitalize="off"
          />
        </label>

        <label className={styles.field}>
          <span>상대방 ID</span>
          <input
            value={peerId}
            onChange={(e) => setPeerId(e.target.value)}
            placeholder="예: seoyeon"
            autoComplete="off"
            autoCapitalize="off"
          />
        </label>

        <label className={styles.field}>
          <span>공유 비밀번호</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="두 사람이 미리 맞춘 암호"
            autoComplete="off"
          />
        </label>

        <p className={styles.hint}>
          비밀번호는 메시지 암호화/복호화에 사용되며 서버로 전송되지 않습니다.
          상대방과 같은 비밀번호를 사용해야 대화할 수 있습니다.
        </p>

        {error && <p className={styles.error}>{error}</p>}

        <button type="submit" className={styles.submit}>
          대화 시작하기
        </button>
      </form>
    </div>
  );
}
