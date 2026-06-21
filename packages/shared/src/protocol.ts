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

/** Render a list of messages back into memo text (sorted by time). */
export function serializeMemo(messages: ChatMessage[]): string {
  return [...messages]
    .sort((a, b) => a.ts - b.ts)
    .map(encodeLine)
    .join("\n");
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

/** Append `message` to an existing memo, pruning anything past retention. */
export function appendToMemo(
  memo: string,
  message: ChatMessage,
  now: number = Date.now(),
): string {
  const cutoff = retentionWindowStart(now);
  const kept = parseMemo(memo).filter((m) => m.ts >= cutoff && m.id !== message.id);
  kept.push(message);
  return serializeMemo(kept);
}

/** Drop messages older than the retention window. Returns the new memo text. */
export function pruneMemo(memo: string, now: number = Date.now()): string {
  const cutoff = retentionWindowStart(now);
  return serializeMemo(parseMemo(memo).filter((m) => m.ts >= cutoff));
}

/** A short, URL-safe unique id for a new message. */
export function newMessageId(): string {
  return crypto.randomUUID();
}
