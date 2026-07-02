import type { ChatMessage, PushSubscriptionPayload } from "@repo/shared";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787";

const REQUEST_TIMEOUT_MS = 15000;

/**
 * fetch with a hard timeout so a stalled request can't hang the caller forever
 * (a hung initial load would otherwise strand the chat on a spinner). If the
 * caller supplies its own signal, we defer to it.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  signal?: AbortSignal,
): Promise<Response> {
  if (signal) return fetch(url, { ...init, signal });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface MessagesResponse {
  messages: ChatMessage[];
  hasMore: boolean;
}

export interface MessageQuery {
  userId: string;
  peerId?: string;
  before?: number;
  after?: number;
  limit?: number;
}

export async function fetchMessages(
  query: MessageQuery,
  signal?: AbortSignal,
): Promise<MessagesResponse> {
  const params = new URLSearchParams({ userId: query.userId });
  if (query.peerId) params.set("peerId", query.peerId);
  if (query.before !== undefined) params.set("before", String(query.before));
  if (query.after !== undefined) params.set("after", String(query.after));
  if (query.limit !== undefined) params.set("limit", String(query.limit));

  const res = await fetchWithTimeout(
    `${API_BASE}/api/messages?${params.toString()}`,
    {},
    signal,
  );
  if (!res.ok) throw new Error(`fetchMessages failed: ${res.status}`);
  return (await res.json()) as MessagesResponse;
}

export async function sendMessage(body: {
  fromId: string;
  toId: string;
  ciphertext: string;
}): Promise<ChatMessage> {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${API_BASE}/api/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("전송 시간이 초과되었습니다. 다시 시도해주세요.");
    }
    throw new Error("네트워크 오류로 전송하지 못했습니다.");
  }
  if (!res.ok) throw new Error(`전송에 실패했습니다 (HTTP ${res.status}).`);
  const data = (await res.json()) as { message: ChatMessage };
  return data.message;
}

export async function getVapidPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/push/vapid-public-key`);
    if (!res.ok) return null;
    const data = (await res.json()) as { publicKey: string | null };
    return data.publicKey;
  } catch {
    return null;
  }
}

export async function subscribePush(
  userId: string,
  subscription: PushSubscriptionPayload,
): Promise<void> {
  await fetch(`${API_BASE}/api/push/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, subscription }),
  });
}

export async function unsubscribePush(endpoint: string): Promise<void> {
  await fetch(`${API_BASE}/api/push/unsubscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

/**
 * Fire-and-forget visitor telemetry. Reports the device/environment details
 * only the browser can see; the server enriches it with ip/geo from the
 * Cloudflare request. Must never throw or block the UI.
 */
export async function recordVisit(userId?: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { effectiveType?: string };
    };
    const payload = {
      userId,
      page: location.pathname + location.search,
      referrer: document.referrer || null,
      language: nav.language || null,
      languages: nav.languages?.length ? nav.languages.join(",") : null,
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      screen: `${window.screen.width}x${window.screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      pixelRatio: window.devicePixelRatio || null,
      cpuCores: nav.hardwareConcurrency ?? null,
      deviceMemory: nav.deviceMemory ?? null,
      touch: (nav.maxTouchPoints ?? 0) > 0,
      connection: nav.connection?.effectiveType ?? null,
    };
    await fetch(`${API_BASE}/api/visit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* telemetry must never break the app */
  }
}
