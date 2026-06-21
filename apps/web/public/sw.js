/**
 * Hyunwoo Talk service worker.
 *
 * Handles incoming Web Push events. Payloads carry the end-to-end *ciphertext*
 * only, so to show the real message text the worker reads the shared password
 * out of the same IndexedDB the app uses and decrypts locally. The decryption
 * here mirrors packages/shared/src/crypto.ts exactly.
 */

const DB_NAME = "hyunwoo-talk";
const STORE_NAME = "kv";
const AUTH_KEY = "auth";

const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 210000;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadAuth() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(AUTH_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
}

async function decryptMessage(payloadBase64, password) {
  const payload = base64ToBytes(payloadBase64);
  const salt = payload.subarray(0, SALT_BYTES);
  const iv = payload.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const ciphertext = payload.subarray(SALT_BYTES + IV_BYTES);
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(plaintext);
}

async function handlePush(data) {
  let title = "Hyunwoo Talk";
  let body = "새 메시지가 도착했습니다";
  let tag = "hyunwoo-talk";

  try {
    const message = data && data.message;
    if (message) {
      title = message.fromId || title;
      tag = `chat:${message.fromId || "msg"}`;
      const auth = await loadAuth();
      if (auth && auth.password) {
        try {
          body = await decryptMessage(message.ciphertext, auth.password);
        } catch {
          body = "🔒 새 메시지 (복호화 실패)";
        }
      }
    }
  } catch {
    /* fall back to generic notification */
  }

  await self.registration.showNotification(title, {
    body,
    tag,
    renotify: true,
    icon: "/icon.svg",
    badge: "/icon.svg",
    data: { url: "/" },
  });
}

self.addEventListener("push", (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  event.waitUntil(handlePush(data));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
