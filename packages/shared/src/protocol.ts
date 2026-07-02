import type { ChatMessage } from "./types";

/**
 * The Touchgym `<textarea name="memo">` is the shared transport. Every chat
 * message is serialized as one line with a fixed prefix so we can robustly
 * ignore any unrelated text a human may have typed into the field.
 *
 *   HWT1|<id>|<fromId>|<toId>|<ts>|<ciphertextBase64>
 *
 * `id`, `fromId` and `toId` never contain `|`; the ciphertext is base64 (no
 * `|`, no newlines), so splitting on `|` is unambiguous.
 */
export const LINE_PREFIX = "HWT1";

/**
 * Blank lines kept at the very top of the memo. A casual viewer of the Touchgym
 * member page then sees empty space instead of the chat transport lines. The
 * parser ignores blank lines, so this never affects decoding.
 */
export const MEMO_HIDE_LINES = 10;
const MEMO_HIDE_PREFIX = "\n".repeat(MEMO_HIDE_LINES);

/** Korea Standard Time offset (Touchgym keeps "yesterday + today" in KST). */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Serialize a message into a single memo line. */
export function encodeLine(message: ChatMessage): string {
  return [
    LINE_PREFIX,
    message.id,
    message.fromId,
    message.toId,
    String(message.ts),
    message.ciphertext,
  ].join("|");
}

/** Parse a single line; returns `null` when it is not a chat line. */
export function decodeLine(line: string): ChatMessage | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(LINE_PREFIX + "|")) return null;
  const parts = trimmed.split("|");
  // prefix, id, fromId, toId, ts, ciphertext(>=1)
  if (parts.length < 6) return null;
  const [, id, fromId, toId, tsRaw] = parts;
  const ciphertext = parts.slice(5).join("|");
  const ts = Number(tsRaw);
  if (!id || !fromId || !toId || !Number.isFinite(ts) || !ciphertext) {
    return null;
  }
  return { id, fromId, toId, ts, ciphertext };
}

/** Extract every chat message embedded in a memo, in document order. */
export function parseMemo(memo: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const line of memo.split(/\r?\n/)) {
    const message = decodeLine(line);
    if (message) messages.push(message);
  }
  return messages;
}

/** Render a list of messages back into memo text (sorted by time), behind the
 * blank-line hide prefix. */
export function serializeMemo(messages: ChatMessage[]): string {
  const body = [...messages]
    .sort((a, b) => a.ts - b.ts)
    .map(encodeLine)
    .join("\n");
  return MEMO_HIDE_PREFIX + body;
}

/**
 * Touchgym's memo field stores at most ~16KB. We keep the serialized memo under
 * this; a small margin covers any storage overhead. The permanent archive lives
 * in D1, so trimming this transport buffer loses nothing durable.
 */
export const MEMO_MAX_BYTES = 16 * 1024 - 512;

/**
 * Max length (base64 chars ≈ bytes) allowed for a single message's ciphertext.
 * The memo cap always keeps the single newest message even if the memo as a
 * whole is over budget — so without this limit, one unusually long message
 * could alone approach or exceed MEMO_MAX_BYTES and crowd out (or fail to
 * leave room for) every other message. ~6000 bytes comfortably fits a very
 * long chat message while leaving most of the budget for the rest of the
 * conversation. Enforced both server-side (POST /api/messages) and by callers
 * that write the memo directly (the console client, which bypasses the API).
 */
export const MAX_CIPHERTEXT_LENGTH = 6000;

/**
 * Max plaintext length (UTF-16 code units) the web composer accepts. Chosen so
 * that even worst-case input (every character a 4-byte UTF-8 codepoint, e.g.
 * emoji) still encrypts to well under {@link MAX_CIPHERTEXT_LENGTH}:
 * ciphertext bytes ≈ 4/3 * (44 + 4 * chars), so 1000 chars → ~4700 bytes.
 */
export const MAX_MESSAGE_CHARS = 1000;

const utf8Encoder = new TextEncoder();

/**
 * Serialize messages (oldest→newest) and, if the result exceeds `maxBytes`,
 * drop the OLDEST messages one at a time until it fits. The newest message is
 * always kept (a single line is never dropped to satisfy the cap).
 */
export function serializeMemoCapped(
  messages: ChatMessage[],
  maxBytes: number = MEMO_MAX_BYTES,
): string {
  const kept = [...messages].sort((a, b) => a.ts - b.ts);
  const render = () => MEMO_HIDE_PREFIX + kept.map(encodeLine).join("\n");
  let memo = render();
  while (kept.length > 1 && utf8Encoder.encode(memo).length > maxBytes) {
    kept.shift(); // drop oldest
    memo = render();
  }
  return memo;
}

/** Current hour (0–23) in KST. */
export function kstHour(now: number = Date.now()): number {
  const shifted = now + KST_OFFSET_MS;
  return Math.floor((shifted % DAY_MS) / (60 * 60 * 1000));
}

/** Milliseconds from `now` until the next occurrence of `hour:00` KST. */
export function msUntilKstHour(hour: number, now: number = Date.now()): number {
  const shifted = now + KST_OFFSET_MS;
  const startOfTodayShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  let target = startOfTodayShifted + hour * 60 * 60 * 1000;
  if (target <= shifted) target += DAY_MS;
  return target - shifted;
}

/**
 * Start (unix ms) of "yesterday" in KST. Touchgym only retains yesterday and
 * today, so the backend prunes anything older than this from the memo while
 * keeping a permanent copy in D1.
 */
export function retentionWindowStart(now: number = Date.now()): number {
  const shifted = now + KST_OFFSET_MS;
  const startOfTodayShifted = Math.floor(shifted / DAY_MS) * DAY_MS;
  const startOfYesterdayShifted = startOfTodayShifted - DAY_MS;
  return startOfYesterdayShifted - KST_OFFSET_MS;
}

/**
 * Append `message` to an existing memo, dropping anything past the retention
 * window and then the oldest messages if still over the ~16KB memo cap.
 */
export function appendToMemo(
  memo: string,
  message: ChatMessage,
  now: number = Date.now(),
): string {
  const cutoff = retentionWindowStart(now);
  const kept = parseMemo(memo).filter((m) => m.ts >= cutoff && m.id !== message.id);
  kept.push(message);
  return serializeMemoCapped(kept);
}

/**
 * Drop messages older than the retention window, then the oldest messages if
 * still over the ~16KB memo cap. Returns the new memo text.
 */
export function pruneMemo(memo: string, now: number = Date.now()): string {
  const cutoff = retentionWindowStart(now);
  return serializeMemoCapped(parseMemo(memo).filter((m) => m.ts >= cutoff));
}

/** A short, URL-safe unique id for a new message. */
export function newMessageId(): string {
  return crypto.randomUUID();
}
