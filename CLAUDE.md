# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Hyunwoo Talk** is a 1-on-1 encrypted messaging service that bridges two types of users:
- **Web users**: access via a Next.js web app with Web Push notifications
- **Console users**: restricted to `touchgym.co.kr` — communicate by injecting JavaScript into the browser console of `https://w2.touchgym.co.kr/m/member/`

Messages are ferried through the Touchgym gym management system: the backend polls Touchgym member data every 10 seconds and reads/writes chat content from the `<textarea name="memo">` field in member profiles. Messages are AES-encrypted with a shared password known to both parties before chatting begins.

## Commands

```bash
# Install dependencies
pnpm install

# Run all apps in dev mode
pnpm dev

# Run a single app
pnpm --filter api dev      # Hono on Cloudflare Workers (wrangler dev)
pnpm --filter web dev      # Next.js on http://localhost:3000

# Build
pnpm build

# Type checking
pnpm check-types

# Lint
pnpm lint

# Format
pnpm format
```

## Architecture

This is a **pnpm + Turborepo monorepo**.

### `apps/api` — Backend (Hono.js on Cloudflare Workers)
- Entry: `src/index.ts` (Hono app + `scheduled` cron handler; exports the `Poller` Durable Object and an `AppType` for Hono RPC)
- Config: `wrangler.jsonc` — deployed via `wrangler deploy`
- Cloudflare D1 (database) + Drizzle ORM (`src/db/`, migrations in `drizzle/`)
- Key modules: `src/lib/touchgym.ts` (login/read/write), `src/lib/push.ts` (VAPID + RFC 8291/8188 Web Push via Web Crypto, no Node deps), `src/poller.ts` (Durable Object)
- Responsibilities:
  - A **Durable Object** (`Poller`, one per `MAILBOX_SEQ`) owns the cached `PHPSESSID` and, via an alarm loop, polls the `memo` textarea every 10 seconds. A 1-minute cron heartbeat keeps the alarm alive.
  - Persist all messages to D1 (Touchgym only stores yesterday + today; the DO prunes the memo to that window in KST)
  - Forward new messages to web users via Web Push
  - On outbound message (`POST /api/messages`): the DO appends encrypted content into the Touchgym member's `memo` field via the Touchgym form POST endpoint (single writer, race-free)

### `apps/web` — Frontend (Next.js 16 App Router)
- Entry: `app/` directory (App Router)
- PWA with Web Push Notification support
- Features: infinite scroll chat history, emoji + text only, shared-password login flow

### `packages/shared` — Shared crypto/protocol/types (`@repo/shared`)
- `src/crypto.ts`: AES-GCM + PBKDF2 over the shared password, using only Web Crypto so the *same* code runs in the worker, the browser, and the Touchgym console.
- `src/protocol.ts`: memo line format `HWT1|<id>|<fromId>|<toId>|<ts>|<ciphertextBase64>`, parse/serialize, and KST retention windowing.
- Used by `apps/api` and `apps/web`. The service worker (`apps/web/public/sw.js`) and console script keep byte-for-byte copies since they cannot import the package.

### `console/` — Console client script
- `console/hyunwoo-talk.js`: self-contained script pasted into the Touchgym member-page console. Exposes `login`, `sendTo`, `send`, `resetTarget`, `help`; polls every 10s. Reads/writes the memo directly using the browser's authenticated session (`credentials: "include"`).

### `packages/ui` — Shared React component library (`@repo/ui`)
### `packages/eslint-config` — Shared ESLint config (`@repo/eslint-config`)
### `packages/typescript-config` — Shared TypeScript config (`@repo/typescript-config`)

## Touchgym Integration

The messaging transport is the Touchgym member management system:

- **Login**: POST to `https://touchgym.co.kr/m/login.php?club_id=<club_id>` → extract `PHPSESSID` cookie
- **Read messages**: GET `https://w2.touchgym.co.kr/m/member/minfo.php?qa=1&seq=<seq>` with session cookie → parse `<textarea name="memo">` content
- **Write messages**: POST to `https://w2.touchgym.co.kr/m/member/minfo.php?seq=<seq>&q=w` with updated memo content

## Encryption

All messages are encrypted/decrypted using a shared password agreed upon before first use. Both sides (web user and console user) use the same password. If passwords don't match, decryption fails and chat is blocked.

## Console Script (for console users)

The console script runs in the browser console at `https://w2.touchgym.co.kr/m/member/` and exposes:
- `login(id, password)` — set user ID and decryption password, print existing chat history
- `sendTo(userId)` — set recipient
- `send(message)` — send encrypted message
- `resetTarget()` — clear recipient
- Auto-polls every 10 seconds for new incoming messages
