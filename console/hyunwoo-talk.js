/* =========================================================================
 * Hyunwoo Talk — Touchgym console client
 * =========================================================================
 *
 * For "console users" who can only reach touchgym.co.kr. Open the member
 * management page:
 *
 *     https://w2.touchgym.co.kr/m/member/
 *
 * open DevTools (F12) → Console, paste this entire file, press Enter, then:
 *
 *     login("hyunwoo", "babo1015!")   // your id + shared password
 *     sendTo("seoyeon")               // who you are talking to
 *     send("안녕! 잘 지내?")            // send an encrypted message
 *     resetTarget()                   // clear the recipient
 *
 * Incoming messages addressed to you are polled every 10 seconds and printed
 * to the console automatically. Messages are AES-GCM encrypted with the shared
 * password — both sides must use the same password.
 *
 * ── Loading without a file (stash the script in a Touchgym memo) ──────────
 * Pasting this raw file is awkward when you only have the Touchgym UI. The
 * memo field also corrupts raw JS (it HTML-escapes < > & " ' and can mangle
 * newlines), so a script copied back out won't run. Instead, store the
 * base64 build and load it with a one-liner:
 *
 *   1. Copy ALL of `console/hyunwoo-talk.b64.txt` (one line) into any member's
 *      memo field and save. base64 is only [A-Za-z0-9+/=], so the memo can't
 *      corrupt it.
 *   2. Later, copy that memo text and run this single line in the console:
 *
 *          eval(atob(prompt()))
 *
 *      Paste the base64 into the prompt → the full client loads (Hangul/emoji
 *      intact, because the build \u-escapes all non-ASCII before encoding).
 *
 * Regenerate the base64 build after editing this file:
 *
 *          node console/build-b64.mjs
 *
 * Edit SEQ below to the Touchgym member `seq` that both parties use as the
 * shared mailbox (the same value the backend uses for MAILBOX_SEQ).
 * ========================================================================= */

(function () {
  "use strict";

  // ---- Configuration -----------------------------------------------------
  const SEQ = "5966856"; // <-- shared mailbox member seq
  const POLL_INTERVAL_MS = 10000;
  // Use the origin of the page you're on (the club's app host, e.g. wN.touchgym.co.kr).
  const APP_ORIGIN = window.location.origin;

  // ---- Protocol (mirrors packages/shared/src/protocol.ts) ----------------
  const LINE_PREFIX = "HWT1";
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;

  function encodeLine(m) {
    return [LINE_PREFIX, m.id, m.fromId, m.toId, String(m.ts), m.ciphertext].join("|");
  }

  function decodeLine(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(LINE_PREFIX + "|")) return null;
    const parts = trimmed.split("|");
    if (parts.length < 6) return null;
    const id = parts[1], fromId = parts[2], toId = parts[3];
    const ts = Number(parts[4]);
    const ciphertext = parts.slice(5).join("|");
    if (!id || !fromId || !toId || !isFinite(ts) || !ciphertext) return null;
    return { id, fromId, toId, ts, ciphertext };
  }

  function parseMemo(memo) {
    const out = [];
    for (const line of memo.split(/\r?\n/)) {
      const m = decodeLine(line);
      if (m) out.push(m);
    }
    return out;
  }

  function retentionWindowStart(now) {
    const shifted = now + KST_OFFSET_MS;
    const startToday = Math.floor(shifted / DAY_MS) * DAY_MS;
    return startToday - DAY_MS - KST_OFFSET_MS;
  }

  function serializeMemo(list) {
    return list
      .slice()
      .sort((a, b) => a.ts - b.ts)
      .map(encodeLine)
      .join("\n");
  }

  function appendToMemo(memo, message) {
    const cutoff = retentionWindowStart(Date.now());
    const kept = parseMemo(memo).filter((m) => m.ts >= cutoff && m.id !== message.id);
    kept.push(message);
    return serializeMemo(kept);
  }

  // ---- Crypto (mirrors packages/shared/src/crypto.ts) --------------------
  const SALT_BYTES = 16;
  const IV_BYTES = 12;
  const PBKDF2_ITERATIONS = 210000;
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function bytesToBase64(bytes) {
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  async function deriveKey(password, salt) {
    const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
      "deriveKey",
    ]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
      km,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  async function encryptMessage(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const key = await deriveKey(password, salt);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext)),
    );
    const out = new Uint8Array(SALT_BYTES + IV_BYTES + ct.length);
    out.set(salt, 0);
    out.set(iv, SALT_BYTES);
    out.set(ct, SALT_BYTES + IV_BYTES);
    return bytesToBase64(out);
  }
  async function decryptMessage(payloadB64, password) {
    const payload = base64ToBytes(payloadB64);
    const salt = payload.subarray(0, SALT_BYTES);
    const iv = payload.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES);
    const ct = payload.subarray(SALT_BYTES + IV_BYTES);
    const key = await deriveKey(password, salt);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return dec.decode(pt);
  }
  async function tryDecrypt(payloadB64, password) {
    try {
      return await decryptMessage(payloadB64, password);
    } catch {
      return null;
    }
  }

  // ---- Touchgym memo read/write -----------------------------------------
  const REQUEST_TIMEOUT_MS = 15000;

  // fetch with a hard timeout so a stuck request releases its socket instead of
  // hanging forever (Touchgym's hosts can stall; leaked sockets pile up and
  // eventually trigger ERR_NO_BUFFER_SPACE for every request on the page).
  async function fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchMemberDoc() {
    const res = await fetchWithTimeout(
      `${APP_ORIGIN}/m/member/minfo.php?qa=1&seq=${encodeURIComponent(SEQ)}`,
      { credentials: "include" },
    );
    if (!res.ok) throw new Error("멤버 정보 요청 실패: HTTP " + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc.querySelector('textarea[name="memo"]')) {
      throw new Error("memo 필드를 찾을 수 없습니다. 로그인 상태와 SEQ를 확인하세요.");
    }
    return doc;
  }

  function readMemoFromDoc(doc) {
    const ta = doc.querySelector('textarea[name="memo"]');
    return ta ? ta.value : "";
  }

  async function readMemo() {
    return readMemoFromDoc(await fetchMemberDoc());
  }

  async function writeMemo(newMemo, doc) {
    const memberDoc = doc || (await fetchMemberDoc());
    const form = memberDoc.querySelector('form[name="form"]');
    if (!form) throw new Error("회원 정보 폼을 찾을 수 없습니다.");

    const body = new URLSearchParams();
    form.querySelectorAll("input, select, textarea").forEach((el) => {
      const name = el.getAttribute("name");
      if (!name) return;
      const type = (el.getAttribute("type") || el.tagName).toLowerCase();
      if (["submit", "button", "image", "file", "reset"].includes(type)) return;
      if (type === "checkbox" || type === "radio") {
        if (el.checked) body.append(name, el.value);
        return;
      }
      body.append(name, el.value);
    });
    body.set("memo", newMemo);

    const res = await fetchWithTimeout(
      `${APP_ORIGIN}/m/member/minfo.php?seq=${encodeURIComponent(SEQ)}&q=w`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      },
    );
    if (!res.ok) throw new Error("메모 저장 실패: HTTP " + res.status);
  }

  // ---- State & rendering -------------------------------------------------
  const state = {
    myId: null,
    password: null,
    targetId: null,
    seen: new Set(),
    timer: null,
    pollGen: 0,
  };

  const C = {
    me: "color:#6d6df0;font-weight:bold",
    them: "color:#21a366;font-weight:bold",
    sys: "color:#888",
    err: "color:#d33;font-weight:bold",
    ok: "color:#21a366;font-weight:bold",
  };

  function fmtTime(ts) {
    return new Date(ts).toLocaleString("ko-KR", { hour12: false });
  }

  async function printMessage(m) {
    const text = await tryDecrypt(m.ciphertext, state.password);
    const who = m.fromId === state.myId ? `${m.fromId} (나)` : m.fromId;
    const style = m.fromId === state.myId ? C.me : C.them;
    const shown = text === null ? "🔒 (복호화 실패: 비밀번호 불일치)" : text;
    console.log(
      `%c${who} %c→ ${m.toId} %c[${fmtTime(m.ts)}]\n   ${shown}`,
      style,
      C.sys,
      C.sys,
    );
  }

  // ---- Polling -----------------------------------------------------------
  async function poll() {
    if (!state.myId || !state.password) return;
    let memo;
    try {
      memo = await readMemo();
    } catch (e) {
      console.warn("%c[폴링 오류] " + e.message, C.err);
      return;
    }
    const messages = parseMemo(memo).sort((a, b) => a.ts - b.ts);
    for (const m of messages) {
      if (state.seen.has(m.id)) continue;
      state.seen.add(m.id);
      // Only surface messages addressed to me (and not echoes of my own).
      if (m.toId === state.myId && m.fromId !== state.myId) {
        await printMessage(m);
      }
    }
  }

  // Self-chaining poll loop: the next poll is scheduled only AFTER the current
  // one settles, so there is never more than one request in flight. (setInterval
  // would keep firing into a stalled network and stack up hung sockets.) The
  // generation token supersedes any prior loop when login() restarts polling.
  function startPolling() {
    const gen = ++state.pollGen;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    const tick = async () => {
      if (gen !== state.pollGen) return;
      try {
        await poll();
      } catch (e) {
        console.warn("%c[폴링 오류] " + e.message, C.err);
      } finally {
        if (gen === state.pollGen) state.timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    state.timer = setTimeout(tick, POLL_INTERVAL_MS);
  }

  // ---- Touchgym heartbeat throttle --------------------------------------
  // The member page runs its own SSL-check heartbeat (getLog2ssl → $.ajax to
  // c4.touchgym.co.kr/checking_ssl.php → scheduleLog → repeat). When that host
  // stalls, the loop retries hard and exhausts the browser's socket pool
  // (net::ERR_NO_BUFFER_SPACE), which then breaks every request on the page —
  // including our polling. We wrap getLog2ssl to admit at most one real call
  // per HEARTBEAT_MIN_MS, owning the rescheduling during the cooldown so the
  // heartbeat stays alive but can no longer flood. Reload the page to undo.
  const HEARTBEAT_MIN_MS = 30000;

  function throttleTouchgymHeartbeat() {
    if (typeof window.getLog2ssl !== "function") {
      console.warn(
        "%c[하트비트 throttle] getLog2ssl 함수를 찾지 못해 적용하지 않았습니다 (Touchgym 페이지 구조 변경?).",
        C.sys,
      );
      return;
    }
    if (window.getLog2ssl.__hwtThrottled) return; // already wrapped

    const orig = window.getLog2ssl;
    let last = 0;
    let cooldown = false;

    function throttled() {
      const wait = last + HEARTBEAT_MIN_MS - Date.now();
      if (wait > 0) {
        // Too soon: skip the network call. Because we don't fire the ajax, the
        // page's own complete→scheduleLog won't run, so we reschedule one retry
        // ourselves after the cooldown. `cooldown` prevents stacking timers.
        if (!cooldown) {
          cooldown = true;
          setTimeout(function () {
            cooldown = false;
            throttled();
          }, wait);
        }
        return;
      }
      last = Date.now();
      return orig.apply(this, arguments);
    }

    throttled.__hwtThrottled = true;
    window.getLog2ssl = throttled;
    console.log(
      `%c[하트비트 throttle] Touchgym SSL 점검 호출을 최소 ${HEARTBEAT_MIN_MS / 1000}초 간격으로 제한합니다.`,
      C.ok,
    );
  }

  // ---- Public API --------------------------------------------------------
  async function login(id, password) {
    if (!id || !password) {
      console.log("%c사용법: login(\"내ID\", \"공유비밀번호\")", C.err);
      return;
    }
    state.myId = String(id);
    state.password = String(password);
    state.seen = new Set();

    console.log(`%c[로그인] ${state.myId} 으로 설정되었습니다. 기존 대화를 불러옵니다…`, C.ok);

    let memo;
    try {
      memo = await readMemo();
    } catch (e) {
      console.log("%c[오류] " + e.message, C.err);
      return;
    }

    const messages = parseMemo(memo).sort((a, b) => a.ts - b.ts);
    if (messages.length === 0) {
      console.log("%c(저장된 대화가 없습니다)", C.sys);
    }
    for (const m of messages) {
      state.seen.add(m.id);
      await printMessage(m);
    }

    startPolling();
    console.log(
      `%c[준비 완료] 10초마다 새 메시지를 확인합니다. sendTo("상대ID") 로 대상을 지정하세요.`,
      C.ok,
    );
  }

  function sendTo(userId) {
    if (!userId) {
      console.log("%c사용법: sendTo(\"상대방ID\")", C.err);
      return;
    }
    state.targetId = String(userId);
    console.log(`%c[대상 설정] 이제 ${state.targetId} 에게 메시지를 보냅니다.`, C.ok);
  }

  function resetTarget() {
    state.targetId = null;
    console.log("%c[대상 초기화] 전송 대상이 해제되었습니다.", C.sys);
  }

  async function send(message) {
    if (!state.myId || !state.password) {
      console.log('%c먼저 login("내ID","비밀번호") 를 실행하세요.', C.err);
      return;
    }
    if (!state.targetId) {
      console.log('%c먼저 sendTo("상대ID") 로 대상을 지정하세요.', C.err);
      return;
    }
    if (typeof message !== "string" || !message.trim()) {
      console.log("%c보낼 메시지를 입력하세요.", C.err);
      return;
    }

    const msg = {
      id:
        (crypto.randomUUID && crypto.randomUUID()) ||
        Date.now() + "-" + Math.random().toString(16).slice(2),
      fromId: state.myId,
      toId: state.targetId,
      ts: Date.now(),
      ciphertext: await encryptMessage(message.trim(), state.password),
    };

    try {
      const doc = await fetchMemberDoc();
      const memo = readMemoFromDoc(doc);
      await writeMemo(appendToMemo(memo, msg), doc);
    } catch (e) {
      console.log("%c[전송 실패] " + e.message, C.err);
      return;
    }

    state.seen.add(msg.id);
    console.log(`%c나 → ${msg.toId} %c[${fmtTime(msg.ts)}]\n   ${message.trim()}`, C.me, C.sys);
  }

  function help() {
    console.log(
      `%cHyunwoo Talk 콘솔 명령어\n` +
        `  login(id, password)  — 내 ID와 공유 비밀번호 설정 + 대화 불러오기\n` +
        `  sendTo(userId)       — 메시지 받을 상대 지정\n` +
        `  send(message)        — 암호화된 메시지 전송\n` +
        `  resetTarget()        — 전송 대상 해제\n` +
        `  help()               — 이 도움말`,
      C.sys,
    );
  }

  // Expose on window so the functions are callable from the console.
  Object.assign(window, { login, sendTo, send, resetTarget, help });

  // Tame the Touchgym page's runaway SSL-check heartbeat so it can't exhaust
  // the browser's sockets (net::ERR_NO_BUFFER_SPACE) while we wait for messages.
  throttleTouchgymHeartbeat();

  console.log("%c💬 Hyunwoo Talk 콘솔 클라이언트가 로드되었습니다.", "color:#6d6df0;font-weight:bold;font-size:14px");
  help();
})();
