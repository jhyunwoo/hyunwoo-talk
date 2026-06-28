"use client";

import { useCallback, useEffect, useState } from "react";
import { adminVerify } from "../../lib/admin";
import { DashboardContent } from "../../components/dashboard/DashboardContent";
import styles from "../../components/dashboard/dashboard.module.css";

const TOKEN_KEY = "hwt_admin_token";

type Status = "checking" | "locked" | "ready";

export default function DashboardPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [token, setToken] = useState<string>("");

  // Password form state.
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState(false);

  // On mount, re-validate any stored token against the server.
  useEffect(() => {
    const stored =
      typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (!stored) {
      setStatus("locked");
      return;
    }
    let active = true;
    adminVerify(stored).then((ok) => {
      if (!active) return;
      if (ok) {
        setToken(stored);
        setStatus("ready");
      } else {
        localStorage.removeItem(TOKEN_KEY);
        setStatus("locked");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const onLock = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setInput("");
    setStatus("locked");
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const candidate = input.trim();
    if (!candidate || submitting) return;
    setSubmitting(true);
    setAuthError(false);
    const ok = await adminVerify(candidate);
    setSubmitting(false);
    if (ok) {
      localStorage.setItem(TOKEN_KEY, candidate);
      setToken(candidate);
      setStatus("ready");
    } else {
      setAuthError(true);
    }
  }

  if (status === "checking") {
    return (
      <div className="appLoading">
        <span className="spinner" aria-hidden="true" />
        <span>확인 중…</span>
      </div>
    );
  }

  if (status === "ready") {
    return <DashboardContent token={token} onLock={onLock} />;
  }

  // locked → password gate
  return (
    <div className={styles.gateWrap}>
      <form className={styles.gateCard} onSubmit={onSubmit}>
        <h1 className={styles.gateTitle}>방문자 대시보드</h1>
        <p className={styles.gateHint}>관리자 비밀번호를 입력하세요.</p>
        <input
          className={styles.gateInput}
          type="password"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setAuthError(false);
          }}
          placeholder="비밀번호"
          autoFocus
          autoComplete="current-password"
        />
        {authError && (
          <div className={styles.gateError}>비밀번호가 올바르지 않습니다.</div>
        )}
        <button
          className={styles.gateSubmit}
          type="submit"
          disabled={!input.trim() || submitting}
        >
          {submitting ? "확인 중…" : "들어가기"}
        </button>
      </form>
    </div>
  );
}
