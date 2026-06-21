/**
 * Web Push (RFC 8030 / 8291 / 8188 + VAPID RFC 8292), implemented purely with
 * the Web Crypto API so it runs natively on Cloudflare Workers with no Node
 * dependency.
 *
 * Payloads are encrypted with the `aes128gcm` content encoding for the
 * subscriber's keys; the push service never sees the plaintext. (And since our
 * payload is *already* the end-to-end ciphertext, the message body is doubly
 * protected.)
 */
import type { PushSubscriptionPayload } from "@repo/shared/types";

export interface VapidDetails {
  subject: string;
  publicKey: string; // base64url, uncompressed P-256 point (65 bytes)
  privateKey: string; // base64url, raw scalar d (32 bytes)
}

export interface PushResult {
  ok: boolean;
  status: number;
}

/** Bytes backed by a plain ArrayBuffer (what Web Crypto's BufferSource wants). */
type Bytes = Uint8Array<ArrayBuffer>;

function utf8(text: string): Bytes {
  return new Uint8Array(new TextEncoder().encode(text)) as Bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(input: string): Bytes {
  let s = input.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length) as Bytes;
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatBytes(...chunks: Uint8Array[]): Bytes {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total) as Bytes;
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function hkdf(
  salt: Bytes,
  ikm: Bytes,
  info: Bytes,
  length: number,
): Promise<Bytes> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits) as Bytes;
}

/** Import the VAPID keypair as an ECDSA signing key via JWK. */
async function importVapidSigningKey(vapid: VapidDetails): Promise<CryptoKey> {
  const pub = base64UrlToBytes(vapid.publicKey); // 0x04 || x(32) || y(32)
  const x = pub.subarray(1, 33);
  const y = pub.subarray(33, 65);
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(x),
      y: bytesToBase64Url(y),
      d: vapid.privateKey,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** Build the signed VAPID JWT for an audience (the push endpoint origin). */
async function createVapidJwt(
  audience: string,
  vapid: VapidDetails,
): Promise<string> {
  const header = bytesToBase64Url(
    utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })),
  );
  const payload = bytesToBase64Url(
    utf8(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
      }),
    ),
  );
  const signingInput = `${header}.${payload}`;
  const signingKey = await importVapidSigningKey(vapid);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      utf8(signingInput),
    ),
  );
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

/** Encrypt `plaintext` for a subscription using aes128gcm (RFC 8291/8188). */
async function encryptPayload(
  subscription: PushSubscriptionPayload,
  plaintext: Bytes,
): Promise<Bytes> {
  const uaPublic = base64UrlToBytes(subscription.keys.p256dh); // 65 bytes
  const authSecret = base64UrlToBytes(subscription.keys.auth); // 16 bytes

  // Ephemeral server ECDH keypair.
  const asKeyPair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", asKeyPair.publicKey)) as ArrayBuffer,
  ) as Bytes;

  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    (await crypto.subtle.deriveBits(
      // Runtime key is `public` per the Web Crypto spec; the cast works around
      // a workers-types naming quirk.
      { name: "ECDH", public: uaPublicKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      asKeyPair.privateKey,
      256,
    )) as ArrayBuffer,
  ) as Bytes;

  // RFC 8291: derive the input keying material.
  const keyInfo = concatBytes(
    utf8("WebPush: info\0"),
    uaPublic,
    asPublic,
  );
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // RFC 8188: per-record salt -> CEK and nonce.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(
    salt,
    ikm,
    utf8("Content-Encoding: aes128gcm\0"),
    16,
  );
  const nonce = await hkdf(
    salt,
    ikm,
    utf8("Content-Encoding: nonce\0"),
    12,
  );

  const contentKey = await crypto.subtle.importKey(
    "raw",
    cek,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  // Single record: append the 0x02 padding-delimiter for the final record.
  const record = concatBytes(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      contentKey,
      record,
    ),
  );

  // Header: salt(16) | rs(4, big-endian) | idlen(1) | keyid(asPublic, 65).
  const recordSize = 4096;
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, recordSize, false);
  header[20] = asPublic.length;
  header.set(asPublic, 21);

  return concatBytes(header, ciphertext);
}

/** Send an encrypted Web Push message. Resolves with the HTTP status. */
export async function sendWebPush(
  subscription: PushSubscriptionPayload,
  payload: string,
  vapid: VapidDetails,
  ttlSeconds = 60 * 60 * 24,
): Promise<PushResult> {
  const body = await encryptPayload(subscription, utf8(payload));
  const endpoint = new URL(subscription.endpoint);
  const audience = `${endpoint.protocol}//${endpoint.host}`;
  const jwt = await createVapidJwt(audience, vapid);

  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  });

  return { ok: res.ok, status: res.status };
}
