/** Cloudflare bindings & environment variables for the worker. */
export interface Bindings {
  /** D1 database (Drizzle). */
  DB: D1Database;
  /** Durable Object namespace for the per-mailbox poller. */
  POLLER: DurableObjectNamespace;

  /** Touchgym member `seq` used as the shared mailbox. */
  MAILBOX_SEQ: string;
  /** Touchgym club id (the `club_id` query param on login.php). */
  TOUCHGYM_CLUB_ID: string;
  /** Touchgym admin login id (secret). */
  TOUCHGYM_ID: string;
  /** Touchgym admin password (secret). */
  TOUCHGYM_PASSWORD: string;

  /** `mailto:` subject for VAPID. */
  VAPID_SUBJECT: string;
  /** VAPID public key, base64url (uncompressed P-256 point). */
  VAPID_PUBLIC_KEY: string;
  /** VAPID private key, base64url raw scalar `d` (secret). */
  VAPID_PRIVATE_KEY: string;

  /** Allowed CORS origin, or `*`. */
  CORS_ORIGIN: string;

  /** Shared admin password gating the analytics dashboard endpoints (secret). */
  ADMIN_TOKEN: string;
}

export interface AppEnv {
  Bindings: Bindings;
}
