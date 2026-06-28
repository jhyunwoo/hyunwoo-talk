/* =========================================================================
 * Regenerate hyunwoo-talk.b64.txt from hyunwoo-talk.js
 * =========================================================================
 *
 * Why base64: the Touchgym member memo field mangles raw JS (HTML-escapes
 * <, >, &, quotes; can normalize newlines/smart-quotes), so a script pasted in
 * and copied back is corrupted. base64 only uses [A-Za-z0-9+/=] — characters
 * the memo never touches — so it survives the round-trip intact.
 *
 * Why \u-escape first: the script contains Hangul/emoji. The loader uses the
 * browser's `atob`, which yields a Latin1 (byte) string — multi-byte UTF-8
 * would be misread (mojibake). Escaping every non-ASCII code unit to \uXXXX
 * makes the source pure ASCII, so `eval(atob(...))` reconstructs the exact
 * original text (Hangul + emoji via surrogate pairs) with no decoding step.
 *
 * Run after editing hyunwoo-talk.js:   node console/build-b64.mjs
 * ========================================================================= */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "hyunwoo-talk.js"), "utf8");

// Escape every UTF-16 code unit > 0x7F (astral chars become surrogate pairs,
// each a valid \uXXXX), leaving ASCII — including existing backslashes — as-is.
let ascii = "";
for (let i = 0; i < src.length; i++) {
  const code = src.charCodeAt(i);
  ascii += code > 0x7f ? "\\u" + code.toString(16).padStart(4, "0") : src[i];
}

const b64 = Buffer.from(ascii, "utf8").toString("base64");
writeFileSync(join(dir, "hyunwoo-talk.b64.txt"), b64 + "\n");
console.log(
  `wrote hyunwoo-talk.b64.txt — ${b64.length} base64 chars ` +
    `(from ${src.length} source chars)`,
);
