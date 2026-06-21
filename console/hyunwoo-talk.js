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
  async function fetchMemberDoc() {
    const res = await fetch(
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

    const res = await fetch(
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

  function startPolling() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(() => {
      poll().catch((e) => console.warn("%c[폴링 오류] " + e.message, C.err));
    }, POLL_INTERVAL_MS);
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

  console.log("%c💬 Hyunwoo Talk 콘솔 클라이언트가 로드되었습니다.", "color:#6d6df0;font-weight:bold;font-size:14px");
  help();
})();
