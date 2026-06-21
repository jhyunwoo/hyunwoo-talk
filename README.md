# Hyunwoo Talk

A 1-on-1, **end-to-end encrypted** messaging service that bridges two kinds of
users by ferrying messages through the **Touchgym** gym-management system:

- **Web users** — use the Next.js PWA with Web Push notifications.
- **Console users** — restricted to `touchgym.co.kr`; chat by pasting a script
  into the browser console at `https://w2.touchgym.co.kr/m/member/`.

Both sides read and write the `<textarea name="memo">` field of a shared
Touchgym member profile. Every message is AES-GCM encrypted with a password the
two parties agree on beforehand — without a matching password, decryption fails
and chatting is impossible.

```
 Console user                    Touchgym member "memo"                  Web user
 (browser console) ── write ──▶  HWT1|id|from|to|ts|ciphertext  ◀── poll ── Worker ──▶ Web PWA
                   ◀── poll ───                                  ── push ─▶ (Web Push)
                                          (D1 archive, permanent)
```

## Monorepo layout

| Path                       | What                                                                 |
| -------------------------- | ------------------------------------------------------------------- |
| `apps/api`                 | Hono on Cloudflare Workers — D1 + Drizzle, Durable Object poller, Web Push, Touchgym integration |
| `apps/web`                 | Next.js 16 PWA — login, chat, infinite scroll, push, service worker |
| `packages/shared`          | `@repo/shared` — shared crypto (AES-GCM/PBKDF2), memo line protocol, types |
| `console/`                 | Self-contained console client script + usage docs                   |
| `packages/ui` / `eslint-config` / `typescript-config` | Shared internal config/components                |
| `apps/docs`                | Unused create-turbo starter app (safe to delete)                    |

The crypto + wire protocol live in `packages/shared` and are used by both the
worker and the web app; the service worker (`apps/web/public/sw.js`) and the
console script (`console/hyunwoo-talk.js`) contain byte-for-byte equivalent
copies (they can't import the package).

## Prerequisites

- Node ≥ 18, `pnpm` 9
- A Cloudflare account (`wrangler login`) for the API
- Touchgym admin credentials (club id, id, password) and the member `seq` to use
  as the shared mailbox

## Setup

```bash
pnpm install
```

### 1. API (`apps/api`)

```bash
cd apps/api

# Create the D1 database and copy its id into wrangler.jsonc (d1_databases[0].database_id)
pnpm exec wrangler d1 create hyunwoo-talk

# Apply migrations
pnpm db:migrate:local      # local dev
pnpm db:migrate:remote     # production

# Generate VAPID keys for Web Push, put PUBLIC in wrangler.jsonc, PRIVATE in secrets
npx web-push generate-vapid-keys
```

Configure secrets/vars:

- `wrangler.jsonc` → `vars`: `MAILBOX_SEQ`, `TOUCHGYM_CLUB_ID`, `VAPID_PUBLIC_KEY`, `VAPID_SUBJECT`, `CORS_ORIGIN`
- Secrets (prod): `wrangler secret put TOUCHGYM_ID|TOUCHGYM_PASSWORD|VAPID_PRIVATE_KEY`
- Local dev: copy `.dev.vars.example` → `.dev.vars` and fill in the same secrets

```bash
pnpm dev        # wrangler dev → http://localhost:8787
pnpm deploy     # deploy to Cloudflare
```

### 2. Web (`apps/web`)

```bash
cd apps/web
cp .env.example .env.local   # set NEXT_PUBLIC_API_BASE to your worker URL
pnpm dev                     # http://localhost:3000
```

Open the app, enter **your id**, the **peer's id**, and the **shared password**,
then start chatting. Grant notification permission to receive Web Push while the
app is backgrounded. (Web Push requires HTTPS — works on `localhost` and on any
deployed HTTPS origin.)

### 3. Console client (`console/`)

See [`console/README.md`](./console/README.md). In short: open
`https://w2.touchgym.co.kr/m/member/`, set `SEQ` in `console/hyunwoo-talk.js`,
paste the file into the DevTools console, then `login(id, password)`,
`sendTo(peerId)`, `send("…")`.

## How it works

- **Transport**: messages are appended to a member's `memo` as lines
  `HWT1|<id>|<fromId>|<toId>|<ts>|<ciphertextBase64>`.
- **Backend poller**: a Durable Object logs into Touchgym (caching the
  `PHPSESSID`), polls the memo every **10 seconds**, archives new messages to D1
  permanently, pushes notifications to the recipient, and prunes the memo to
  "yesterday + today" (KST) — matching what Touchgym retains. A 1-minute cron
  keeps the alarm loop alive.
- **Sending from the web**: the client encrypts locally and POSTs the ciphertext
  to `/api/messages`; the Durable Object writes it into the memo and D1.
- **End-to-end encryption**: the backend only ever sees ciphertext. The web
  service worker even decrypts push payloads locally using the password stored
  in IndexedDB.

## Deployment (Cloudflare)

Both apps run on Cloudflare Workers. Live deployment:

- **API**: https://api.moveto.workers.dev (Worker + D1 + Durable Object + 1-min cron)
- **Web**: https://hyunwoo-talk-web.moveto.workers.dev (Next.js via the [OpenNext](https://opennext.js.org/cloudflare) Cloudflare adapter)

```bash
# API — apps/api
pnpm exec wrangler d1 create hyunwoo-talk     # then put the id in wrangler.jsonc
pnpm db:migrate:remote
printf '%s' "<value>" | pnpm exec wrangler secret put TOUCHGYM_ID        # + TOUCHGYM_PASSWORD, VAPID_PRIVATE_KEY
pnpm exec wrangler deploy --minify

# Web — apps/web (OpenNext → Workers). NEXT_PUBLIC_API_BASE is read from .env.production
pnpm --filter web run deploy   # = opennextjs-cloudflare build && opennextjs-cloudflare deploy
```

The web app talks to the API over HTTP, so set `NEXT_PUBLIC_API_BASE` (in
`apps/web/.env.production`) to the deployed API URL before building. The API's
`CORS_ORIGIN` (default `*`) must allow the web origin.

## Common commands

```bash
pnpm dev           # run all apps
pnpm build         # build all
pnpm check-types   # typecheck all
pnpm lint          # lint
pnpm format        # prettier
```

## Security notes

- The Touchgym **login form field names** (`id` / `passwd`) are a best-effort
  default in `apps/api/src/lib/touchgym.ts`; adjust if a club's form differs.
- The shared password never leaves the client; it is used purely for AES-GCM
  encryption/decryption.
- This service piggybacks on Touchgym's member `memo` field — use only the
  designated mailbox member `seq` and with appropriate authorization.
