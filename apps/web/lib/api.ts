import type { ChatMessage, PushSubscriptionPayload } from "@repo/shared";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787";

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

  const res = await fetch(`${API_BASE}/api/messages?${params.toString()}`, {
    signal,
  });
  if (!res.ok) throw new Error(`fetchMessages failed: ${res.status}`);
  return (await res.json()) as MessagesResponse;
}

export async function sendMessage(body: {
  fromId: string;
  toId: string;
  ciphertext: string;
}): Promise<ChatMessage> {
  const res = await fetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`sendMessage failed: ${res.status}`);
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
