# ACKSTREET MD - Pairing Site

A tiny standalone web app that generates a `SESSION_ID` for the ACKSTREET MD
bot. Keep this as a **separate deployment** from the bot itself — you only
need to run it when you (or someone else) needs a fresh session.

## How it works

1. Visitor enters a WhatsApp number.
2. Server opens a temporary Baileys connection and requests a pairing code.
3. The code is shown on the page — visitor enters it in WhatsApp → Linked Devices.
4. Once WhatsApp confirms the link, the server reads the resulting credentials,
   base64-encodes them with an `ACKSTREET-MD~` prefix, and shows that string
   as the `SESSION_ID` to copy.
5. The temporary session on the server is deleted immediately after — the
   site itself never keeps a running WhatsApp connection.

## Run locally

```bash
npm install
npm start
# visit http://localhost:3000
```

## Deploying

Works on any Node.js host (Render, Railway, a small VPS, or even Katabump
using the same zip-and-extract steps as the bot, just pick a different
server slot). Set `PORT` if your host requires a specific one; it defaults
to 3000.

## Security note

Anyone who obtains a valid `SESSION_ID` can log in as that WhatsApp account.
Treat it like a password:
- Don't paste it into public chats, screenshots, or commit it to GitHub.
- Only generate one for a number you own.
- If a `SESSION_ID` ever leaks, log that device out from WhatsApp → Linked Devices immediately.
