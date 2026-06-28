"use client";

import { useEffect, useState } from "react";
import { Login } from "../components/Login";
import { Chat } from "../components/Chat";
import { recordVisit } from "../lib/api";
import { registerServiceWorker } from "../lib/push";
import { clearAuth, loadAuth, saveAuth, type AuthState } from "../lib/store";

type Status = "loading" | "login" | "chat";

export default function Home() {
  const [status, setStatus] = useState<Status>("loading");
  const [auth, setAuth] = useState<AuthState | null>(null);

  useEffect(() => {
    registerServiceWorker().catch(() => undefined);
    loadAuth()
      .then((stored) => {
        if (stored) {
          setAuth(stored);
          setStatus("chat");
        } else {
          setStatus("login");
        }
        void recordVisit(stored?.userId);
      })
      .catch(() => {
        setStatus("login");
        void recordVisit();
      });
  }, []);

  async function handleLogin(next: AuthState) {
    await saveAuth(next);
    setAuth(next);
    setStatus("chat");
    // Attribute this session to the user now that we know who they are — the
    // initial page-load visit was recorded anonymously (before login).
    void recordVisit(next.userId);
  }

  async function handleLogout() {
    await clearAuth();
    setAuth(null);
    setStatus("login");
  }

  if (status === "loading") {
    return (
      <div className="appLoading">
        <span className="spinner" aria-hidden="true" />
        <span>불러오는 중…</span>
      </div>
    );
  }
  if (status === "chat" && auth) {
    return <Chat auth={auth} onLogout={handleLogout} />;
  }
  return <Login onSubmit={handleLogin} />;
}
