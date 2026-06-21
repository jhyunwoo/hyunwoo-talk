# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hyunwoo Talk is a messaging service that bridges two types of users:
1. **Web users** — have full internet access, use the Next.js web app to send/receive messages
2. **Console users** — restricted to the Touchgym site (`w2.touchgym.co.kr`), communicate via browser console scripts injected into the Touchgym admin panel

Messages are relayed through the `<textarea name="memo">` field inside Touchgym member info pages (`/m/member/minfo.php?qa=1&seq=<member_seq>`). The backend polls this field every 10 seconds to detect new incoming messages and pushes outgoing messages by updating the textarea via a POST request. All messages are encrypted/decrypted with a shared password that both parties must agree on in advance.

## Repository Structure

Turborepo monorepo managed with `pnpm`.

```
apps/
  api/      # Hono.js backend, deployed to Cloudflare Workers (wrangler)
  web/      # Next.js 16 frontend (Web Push, infinite scroll chat UI)
  docs/     # Next.js docs site (scaffolded, not yet built out)
packages/
  ui/               # Shared React component library
  eslint-config/    # Shared ESLint configs (base, next, react-internal)
  typescript-config/ # Shared tsconfig presets (base, nextjs, react-library)
```

## Commands

All commands run from the repo root unless noted.

```bash
pnpm dev          # Start all apps in dev mode (turbo)
pnpm build        # Build all apps
pnpm lint         # Lint all packages
pnpm check-types  # Type-check all packages
pnpm format       # Prettier format all TS/TSX/MD files
```

Per-app:
```bash
# API (Cloudflare Workers)
cd apps/api
pnpm dev          # wrangler dev (local Workers runtime)
pnpm deploy       # wrangler deploy --minify
pnpm cf-typegen   # Regenerate Cloudflare binding types

# Web
cd apps/web
pnpm dev          # next dev on port 3000
pnpm build        # next build
```

## Architecture

### Backend (`apps/api`)
- **Hono.js** on **Cloudflare Workers** — entry point: `apps/api/src/index.ts`
- **Cloudflare D1** (SQLite) via **Drizzle ORM** for persistent message storage
- **Hono RPC / Hono Stacks** for typed client generation — keep routes typed end-to-end
- Config: `apps/api/wrangler.jsonc` — D1 binding, KV, and other Cloudflare resources are declared here

Core responsibilities:
- Poll Touchgym member info endpoint every 10 seconds per active session to detect new console-side messages
- Parse `<textarea name="memo">` from the Touchgym HTML response
- Write incoming messages to D1; send Web Push notification to the web user
- On web-user message: append encrypted message to the textarea via a POST to Touchgym's member edit endpoint
- Retain only today's and yesterday's messages in the Touchgym textarea; all history lives in D1

### Frontend (`apps/web`)
- **Next.js 16** (App Router), React 19
- **PWA / Web Push Notifications** for real-time delivery
- Chat UI: infinite scroll for history, text + emoji only
- First login flow collects `userId` and the shared encryption `password`
- Shared components come from `@repo/ui` (workspace package)

### Console Script (not yet in repo)
Injected into `https://w2.touchgym.co.kr/m/member/` browser console:
- `login(id, password)` — sets identity and decryption key; replays and decrypts existing messages
- `sendTo(userId)` — sets recipient
- `send(message)` — encrypts and sends a message
- `resetTarget()` — clears recipient
- Polls member info every 10 seconds for new inbound messages

### Encryption
Symmetric encryption with a shared password. Both parties must use the same password before chatting. Messages in Touchgym's textarea and in transit are encrypted; D1 stores ciphertext.

## Touchgym Integration Details

- Login: POST to `https://touchgym.co.kr/m/login.php?club_id=<club_id>` → extract `PHPSESSID` cookie
- Read member info: `GET https://w2.touchgym.co.kr/m/member/minfo.php?qa=1&seq=<seq>` with `PHPSESSID`
- Write member info: `POST https://w2.touchgym.co.kr/m/member/minfo.php?seq=<seq>&q=w` with updated textarea content
- The `seq` value is the Touchgym member sequence number used as the channel identifier
