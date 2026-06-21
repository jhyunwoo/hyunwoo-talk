/**
 * Password-based authenticated encryption shared by every Hyunwoo Talk layer.
 *
 * The algorithm is intentionally simple and portable so that the *identical*
 * implementation works in the browser (web app), in a Cloudflare Worker /
 * service worker, and pasted verbatim into the Touchgym browser console — all
 * of which expose the Web Crypto API (`crypto.subtle`). No external
 * dependency is required.
 *
 * Wire format of an encrypted payload (before base64):
 *
 *   ┌────────────┬──────────┬───────────────────────────┐
 *   │ salt (16B) │ iv (12B) │ AES-GCM ciphertext + tag  │
 *   └────────────┴──────────┴───────────────────────────┘
 *
 * Key derivation is PBKDF2-SHA256 (210k iterations) over the shared password
 * with the random per-message salt. Because both parties agree on the password
 * beforehand, a mismatched password simply fails to decrypt — which is exactly
 * the "chat is impossible without a matching password" requirement.
 */

const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 210_000;
const KEY_BITS = 256;

const decoder = new TextDecoder();

/** Bytes backed by a plain ArrayBuffer (what Web Crypto's BufferSource wants). */
type Bytes = Uint8Array<ArrayBuffer>;

/** UTF-8 encode into an ArrayBuffer-backed array. */
function utf8(text: string): Bytes {
  return new Uint8Array(new TextEncoder().encode(text)) as Bytes;
}

function alloc(length: number): Bytes {
  return new Uint8Array(length) as Bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Bytes {
  const binary = atob(base64);
  const bytes = alloc(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(password: string, salt: Bytes): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    utf8(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Encrypt `plaintext` with `password`, returning a base64 payload. */
export async function encryptMessage(
  plaintext: string,
  password: string,
): Promise<string> {
  const salt = crypto.getRandomValues(alloc(SALT_BYTES));
  const iv = crypto.getRandomValues(alloc(IV_BYTES));
  const key = await deriveKey(password, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, utf8(plaintext)),
  );

  const payload = alloc(SALT_BYTES + IV_BYTES + ciphertext.length);
  payload.set(salt, 0);
  payload.set(iv, SALT_BYTES);
  payload.set(ciphertext, SALT_BYTES + IV_BYTES);
  return bytesToBase64(payload);
}

/**
 * Decrypt a base64 payload produced by {@link encryptMessage}.
 *
 * Throws if the password is wrong or the payload is corrupt — callers should
 * treat a thrown error as "could not decrypt".
 */
export async function decryptMessage(
  payloadBase64: string,
  password: string,
): Promise<string> {
  const payload = base64ToBytes(payloadBase64);
  if (payload.length < SALT_BYTES + IV_BYTES) {
    throw new Error("Ciphertext payload is too short");
  }
  const salt = payload.subarray(0, SALT_BYTES) as Bytes;
  const iv = payload.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES) as Bytes;
  const ciphertext = payload.subarray(SALT_BYTES + IV_BYTES) as Bytes;
  const key = await deriveKey(password, salt);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return decoder.decode(plaintext);
}

/** Convenience: decrypt but return `null` instead of throwing on failure. */
export async function tryDecryptMessage(
  payloadBase64: string,
  password: string,
): Promise<string | null> {
  try {
    return await decryptMessage(payloadBase64, password);
  } catch {
    return null;
  }
}
