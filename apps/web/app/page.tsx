"use client";

import { useEffect, useState } from "react";
import { Login } from "../components/Login";
import { Chat } from "../components/Chat";
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
      })
      .catch(() => setStatus("login"));
  }, []);

  async function handleLogin(next: AuthState) {
    await saveAuth(next);
    setAuth(next);
    setStatus("chat");
  }

  async function handleLogout() {
    await clearAuth();
    setAuth(null);
    setStatus("login");
  }

  if (status === "loading") {
    return <div className="appLoading">불러오는 중…</div>;
  }
  if (status === "chat" && auth) {
    return <Chat auth={auth} onLogout={handleLogout} />;
  }
  return <Login onSubmit={handleLogin} />;
}
