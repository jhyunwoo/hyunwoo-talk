# Hyunwoo Talk — Console Client

For **console users** who can only reach `touchgym.co.kr`. It turns the
Touchgym member-edit page into a chat client by reading and writing the
`<textarea name="memo">` field, encrypting everything with a shared password.

## Usage

1. Log in to Touchgym and open the member management page:
   `https://w2.touchgym.co.kr/m/member/`
2. Open DevTools (`F12`) → **Console**.
3. Edit `SEQ` at the top of [`hyunwoo-talk.js`](./hyunwoo-talk.js) to the
   member `seq` that both parties use as the shared mailbox (must match the
   backend's `MAILBOX_SEQ`).
4. Paste the **entire** file into the console and press Enter.
5. Run the commands:

```js
login("hyunwoo", "babo1015!"); // your id + shared password; prints history
sendTo("seoyeon");             // set the recipient
send("안녕! 잘 지내?");          // send an encrypted message
resetTarget();                 // clear the recipient
help();                        // show commands
```

Incoming messages addressed to you are polled every **10 seconds** and printed
automatically.

## How it works

- Messages are stored in the member's `memo` textarea, one per line:
  `HWT1|<id>|<fromId>|<toId>|<ts>|<ciphertextBase64>`
- The body is AES-GCM encrypted with PBKDF2 over the shared password — the same
  algorithm used by the web app, backend, and service worker
  (`packages/shared/src/crypto.ts`). A mismatched password simply fails to
  decrypt, so chatting is impossible without agreeing on the password first.
- Only "yesterday + today" is kept in the memo; the backend archives everything
  permanently in D1.

> The script relies on your existing authenticated Touchgym browser session
> (`credentials: "include"`), so no password is sent anywhere except into the
> normal Touchgym form POST.
