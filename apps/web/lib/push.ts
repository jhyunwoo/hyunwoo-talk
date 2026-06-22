import { getVapidPublicKey, subscribePush, unsubscribePush } from "./api";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(raw.length) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/**
 * Request notification permission and register a push subscription for
 * `userId`. Returns true on success. Safe to call repeatedly.
 */
export async function enablePush(userId: string): Promise<boolean> {
  if (!pushSupported()) return false;

  const vapidPublicKey = await getVapidPublicKey();
  if (!vapidPublicKey) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  const registration =
    (await navigator.serviceWorker.getRegistration()) ??
    (await registerServiceWorker());
  if (!registration) return false;
  await navigator.serviceWorker.ready;

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;

  await subscribePush(userId, {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
  return true;
}

/**
 * Cancel the push subscription for this device and tell the backend to forget
 * it. Safe to call when nothing is subscribed.
 */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const { endpoint } = subscription;
  await subscription.unsubscribe();
  await unsubscribePush(endpoint);
}
