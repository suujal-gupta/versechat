# VERSECHAT

Real-time chat web app (React + Node.js + Socket.IO). Black-and-white UI with a glowing cursor-reactive grid background and an interactive VERSECHAT wordmark.

## Features
- **Auth**: register, sign in, sign out, JWT sessions (bcrypt-hashed passwords), session survives refresh
- **One-to-one chat** and **group chats**, delivered over WebSockets (Socket.IO)
- **Persistent storage**: users, conversations, messages, reactions and read state saved to `server/data/db.json`
- Online/offline status, typing indicators, read receipts (✓ delivered / ✓✓ seen), unread badges
- Reactions, replies, edit and delete, message search, emoji picker, profile status
- Image and file sharing with basic safety checks (blocked extensions, executable-signature check, 15 MB limit)
- Browser notifications and unread count in the tab title
- **Voice notes** — tap 🎤 to record, send, and play back with a waveform player
- **Camera button** — 📷 opens the camera (native camera app on phones, in-app camera on desktop) and sends the **original full-resolution photo**; tap any photo to view/download the original
- **Editable profile picture** — upload, drag-to-crop & zoom, change or remove; shown everywhere
- **Private nicknames** (like Instagram) — tap a contact's name in a chat to set a nickname only *you* can see
- **Chat summarization** — ✨ summarizes the last 50 / 200 / today's messages (AI via Anthropic API, or a built-in offline summary)
- **1:1 video calls** — 📹 WebRTC peer-to-peer calls (Socket.IO signaling), mute / camera toggle, call history in the chat
- Responsive layout (phone and desktop)

## Architecture
```
client/  React + Vite (CursorGrid + TechText from React Bits)
server/  Express REST (auth, data, uploads) + Socket.IO (messages, presence, typing, reactions)
         JSON-file database, uploads in server/uploads
```
In production the Node server also serves the built frontend, so one port does everything.

## Run on one network (two devices, same Wi-Fi)
Requires Node.js 18+.
```bash
npm run install:all     # installs server + client dependencies
npm run build           # builds the frontend into client/dist
npm start               # starts the server on 0.0.0.0:3000
```
The terminal prints addresses such as `http://192.168.1.23:3000` **and** a secure one such as `https://192.168.1.23:3443`.

> **Voice notes, the in-app camera and video calls need HTTPS** (browsers only allow microphone/camera on `https://` or `localhost`).
> On other devices use the **https** address, and accept the one-time "not secure" certificate warning (Advanced → Proceed). The certificate is generated automatically into `server/data/` — nothing to configure. Set `HTTPS=0` to turn it off.

Open that address on **both** devices (they must be on the same Wi-Fi), register two different accounts, and start chatting.

If the second device cannot connect, allow Node.js / port 3000 through your computer's firewall, and make sure the router does not have "client isolation" (common on guest and campus Wi-Fi).

## Development
```bash
npm run dev:server      # terminal 1 — API + sockets on :3000
npm run dev:client      # terminal 2 — Vite on :5173 (proxies to :3000)
```

## Configuration
No secrets are committed. Optional environment variables:
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Server port |
| `HTTPS_PORT` | `3443` | Secure (self-signed) port used for mic / camera / video calls |
| `HTTPS` | on | Set to `0` to disable the HTTPS listener |
| `JWT_SECRET` | auto-generated into `server/data/jwt.secret` | Token signing key |
| `ANTHROPIC_API_KEY` | *(unset)* | Enables AI chat summaries. Stays on the server. Without it, a built-in offline summary is used |
| `SUMMARY_MODEL` | `claude-sonnet-5-5` | Model used for summaries |
| `ICE_SERVERS` | Google STUN | JSON array of WebRTC ICE servers; add a TURN server for calls across strict networks |

Example: `ANTHROPIC_API_KEY=sk-ant-... npm start`

## Testing in a clean environment
1. Fresh clone, run the three commands above.
2. Open the app in two browsers (or two devices), create `alice` and `bob`.
3. From alice: **＋** → pick bob → send a message. It appears instantly for bob.
4. Check typing indicator, reactions, edit/delete, image upload, group creation (needs 3 accounts), and refresh to confirm messages persist.
