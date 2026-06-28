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
 * Ensure a push subscription exists for `userId` and is registered with the
 * backend. When `allowPrompt` is false the permission state is only *read*
 * (never prompted), so this is safe to call on mount: iOS Safari rejects
 * `Notification.requestPermission()` outside a user gesture — even when
 * permission was already granted — which would otherwise make a previously
 * enabled device look disabled (e.g. after the PWA is deleted and reopened).
 */
async function ensureSubscription(
  userId: string,
  allowPrompt: boolean,
): Promise<boolean> {
  if (!pushSupported()) return false;

  if (allowPrompt) {
    if ((await Notification.requestPermission()) !== "granted") return false;
  } else if (Notification.permission !== "granted") {
    return false;
  }

  const vapidPublicKey = await getVapidPublicKey();
  if (!vapidPublicKey) return false;

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
 * Turn on push from a user gesture (the bell button). May show the browser
 * permission prompt. Returns true once subscribed.
 */
export function enablePush(userId: string): Promise<boolean> {
  return ensureSubscription(userId, true);
}

/**
 * Reflect/restore push state on load WITHOUT prompting. Returns true when
 * permission is already granted and a subscription is active — re-creating and
 * re-syncing the subscription to the backend if it was lost (e.g. the PWA was
 * reinstalled). Returns false otherwise; never prompts.
 */
export function refreshPush(userId: string): Promise<boolean> {
  return ensureSubscription(userId, false);
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
