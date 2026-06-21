/**
 * Touchgym integration — the messaging transport.
 *
 * The login flow (verified against the live site) is multi-hop and spans
 * several subdomains, so we keep a small cookie jar and follow redirects
 * manually:
 *
 *  1. GET  https://touchgym.co.kr/m/login.php?club_id=<id>     (→ www, sets PHPSESSID)
 *  2. POST https://www.touchgym.co.kr/m/login.php?q=w&URL=     body: club_id, userid, passwd
 *         → 302 https://<wN>.touchgym.co.kr/m/auth.php?authkey=...&dbinfo=...
 *  3. follow auth.php → sets the *working* PHPSESSID on the club's app origin
 *         and lands on /m/member/notice1.php
 *
 * The club's app origin (e.g. `https://w3.touchgym.co.kr`) is **not** fixed —
 * it depends on the club's `dbinfo` shard — so {@link touchgymLogin} discovers
 * it from the redirect chain and returns it alongside the session id. Member
 * endpoints (read/write memo) then use that origin + PHPSESSID.
 */

const LOGIN_ENTRY = "https://touchgym.co.kr/m/login.php";
const LOGIN_POST = "https://www.touchgym.co.kr/m/login.php?q=w&URL=";

// Verified login form field names.
const FIELD_CLUB = "club_id";
const FIELD_ID = "userid";
const FIELD_PASSWORD = "passwd";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

export interface TouchgymCredentials {
  clubId: string;
  loginId: string;
  password: string;
}

/** A logged-in Touchgym session: where the member area lives + its cookie. */
export interface TouchgymSession {
  /** Club app origin discovered at login, e.g. `https://w3.touchgym.co.kr`. */
  appOrigin: string;
  /** PHPSESSID authorized for the member area on `appOrigin`. */
  sid: string;
}

/** Thrown when a request indicates the session is no longer authenticated. */
export class TouchgymSessionExpiredError extends Error {
  constructor(message = "Touchgym session expired") {
    super(message);
    this.name = "TouchgymSessionExpiredError";
  }
}

// ---- Minimal cookie jar (host -> name -> value) -------------------------

type CookieJar = Map<string, Map<string, string>>;

function getSetCookies(headers: Headers): string[] {
  const accessor = (headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie;
  if (typeof accessor === "function") return accessor.call(headers);
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

function storeCookies(jar: CookieJar, requestHost: string, headers: Headers) {
  for (const raw of getSetCookies(headers)) {
    const firstPair = raw.split(";")[0] ?? "";
    const eq = firstPair.indexOf("=");
    if (eq < 0) continue;
    const name = firstPair.slice(0, eq).trim();
    const value = firstPair.slice(eq + 1).trim();
    const domainMatch = raw.match(/domain=([^;]+)/i);
    const host = domainMatch
      ? domainMatch[1]!.trim().replace(/^\./, "")
      : requestHost;
    if (!jar.has(host)) jar.set(host, new Map());
    jar.get(host)!.set(name, value);
  }
}

function cookieHeaderFor(jar: CookieJar, host: string): string {
  const out: string[] = [];
  for (const [storedHost, cookies] of jar) {
    if (host === storedHost || host.endsWith("." + storedHost)) {
      for (const [name, value] of cookies) out.push(`${name}=${value}`);
    }
  }
  return out.join("; ");
}

/** Fetch following redirects manually while carrying the cookie jar. */
async function fetchWithJar(
  jar: CookieJar,
  startUrl: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  maxRedirects = 6,
): Promise<{ res: Response; url: string }> {
  let url = startUrl;
  let method = init.method ?? "GET";
  let body: string | undefined = init.body;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const parsed = new URL(url);
    const headers: Record<string, string> = {
      "user-agent": BROWSER_UA,
      ...(init.headers ?? {}),
    };
    const cookie = cookieHeaderFor(jar, parsed.host);
    if (cookie) headers["cookie"] = cookie;

    const res = await fetch(url, { method, headers, body, redirect: "manual" });
    storeCookies(jar, parsed.host, res.headers);

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.arrayBuffer().catch(() => undefined);
      if (!location) return { res, url };
      url = new URL(location, url).toString();
      method = "GET";
      body = undefined;
      continue;
    }
    return { res, url };
  }
  throw new Error("Touchgym login exceeded redirect limit");
}

/** Authenticate and return the session (app origin + PHPSESSID). */
export async function touchgymLogin(
  creds: TouchgymCredentials,
): Promise<TouchgymSession> {
  const jar: CookieJar = new Map();

  // Step 1: establish an initial session cookie.
  const entryUrl = `${LOGIN_ENTRY}?club_id=${encodeURIComponent(creds.clubId)}`;
  await fetchWithJar(jar, entryUrl);

  // Step 2: submit credentials and follow the auth handshake to the app origin.
  const body = new URLSearchParams();
  body.set(FIELD_CLUB, creds.clubId);
  body.set(FIELD_ID, creds.loginId);
  body.set(FIELD_PASSWORD, creds.password);

  const { url: finalUrl } = await fetchWithJar(jar, LOGIN_POST, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      referer: entryUrl,
    },
    body: body.toString(),
  });

  // A successful login lands on a member page; a failure bounces to login.php.
  if (/\/login\.php/i.test(finalUrl)) {
    throw new Error(
      "Touchgym login failed — check club id / id / password.",
    );
  }

  const appHost = new URL(finalUrl).host;
  const appOrigin = `https://${appHost}`;
  const sid = jar.get(appHost)?.get("PHPSESSID");
  if (!sid) {
    throw new Error("Touchgym login succeeded but no session cookie was issued.");
  }
  return { appOrigin, sid };
}

// ---- Member memo read/write --------------------------------------------

/** Load a member's edit page HTML. Throws if the session looks logged out. */
export async function fetchMemberHtml(
  session: TouchgymSession,
  seq: string,
): Promise<string> {
  const url = `${session.appOrigin}/m/member/minfo.php?qa=1&seq=${encodeURIComponent(seq)}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "user-agent": BROWSER_UA,
      cookie: `PHPSESSID=${session.sid}`,
      referer: `${session.appOrigin}/m/member/`,
    },
    redirect: "manual",
  });

  if (res.status >= 300 && res.status < 400) {
    throw new TouchgymSessionExpiredError();
  }
  if (!res.ok) {
    throw new Error(`Touchgym member fetch failed: HTTP ${res.status}`);
  }

  const html = await res.text();
  if (!/name="memo"/i.test(html)) {
    throw new TouchgymSessionExpiredError("Member page missing memo field");
  }
  return html;
}

/** Read the memo textarea contents out of a member page. */
export function extractMemo(html: string): string {
  const match = html.match(
    /<textarea[^>]*name="memo"[^>]*>([\s\S]*?)<\/textarea>/i,
  );
  if (!match) return "";
  return decodeHtmlEntities(match[1] ?? "");
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, "&");
}

function getAttr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? match[1] : undefined;
}

/**
 * Parse all submittable fields out of the member edit form so we can re-POST
 * them unchanged (except memo) and avoid wiping the member's data.
 */
function extractFormFields(html: string): Record<string, string> {
  const formMatch = html.match(/<form name="form"[\s\S]*?<\/form>/i);
  const scope = formMatch ? formMatch[0] : html;
  const fields: Record<string, string> = {};

  const inputRe = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(scope)) !== null) {
    const tag = m[0];
    const name = getAttr(tag, "name");
    if (!name) continue;
    const type = (getAttr(tag, "type") ?? "text").toLowerCase();
    if (["image", "submit", "button", "file", "reset"].includes(type)) continue;
    if (type === "checkbox" || type === "radio") {
      if (/\bchecked\b/i.test(tag)) fields[name] = getAttr(tag, "value") ?? "on";
      continue;
    }
    fields[name] = decodeHtmlEntities(getAttr(tag, "value") ?? "");
  }

  const selectRe = /<select\b[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/gi;
  while ((m = selectRe.exec(scope)) !== null) {
    const name = m[1]!;
    const inner = m[2] ?? "";
    const selected =
      inner.match(/<option[^>]*\bselected\b[^>]*value="([^"]*)"/i) ??
      inner.match(/<option[^>]*value="([^"]*)"[^>]*\bselected\b/i);
    fields[name] = selected ? (selected[1] ?? "") : "";
  }

  return fields;
}

/**
 * Write a new memo value back to the member, preserving all other fields.
 * `memberHtml` must be a freshly fetched member page for this `seq`.
 */
export async function writeMemo(
  session: TouchgymSession,
  seq: string,
  memberHtml: string,
  memo: string,
): Promise<void> {
  const fields = extractFormFields(memberHtml);
  fields["memo"] = memo;
  fields["seq2"] = fields["seq2"] ?? seq;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);

  const url = `${session.appOrigin}/m/member/minfo.php?seq=${encodeURIComponent(seq)}&q=w`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "user-agent": BROWSER_UA,
      cookie: `PHPSESSID=${session.sid}`,
      "content-type": "application/x-www-form-urlencoded",
      referer: `${session.appOrigin}/m/member/minfo.php?qa=1&seq=${encodeURIComponent(seq)}`,
    },
    body,
    redirect: "manual",
  });

  // Saving normally responds with a redirect; treat 2xx/3xx as success.
  if (res.status >= 400) {
    throw new Error(`Touchgym memo write failed: HTTP ${res.status}`);
  }
}
