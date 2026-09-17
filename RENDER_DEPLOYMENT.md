# Deploying OpenWA on Render Free Plan (512 MB RAM)
## ⚡ Micro-Optimized for Outbound/Send-Only (Alerts, Notifications & Bots)

This guide covers how to deploy and run **OpenWA** reliably on the **Render Free Web Service** tier within the **512 MB RAM** limit, micro-optimized specifically for **sending messages only** (not receiving).

---

## 🏎️ Send-Only Micro-Optimizations

When using OpenWA strictly for sending messages, alerts, OTPs, or transactional notifications, incoming message pipelines waste CPU, memory, and database I/O. We added dedicated optimizations that reduce active RAM usage to **~45 MB – 75 MB**:

| Component | Normal Behavior | Send-Only Micro-Optimization |
| :--- | :--- | :--- |
| **Inbound Message Stream** | Decodes protobuf, maps body, emits webhooks, saves to DB | **`OUTBOUND_ONLY=true`** — Instantly drops incoming messages from other contacts at the socket level. Zero memory/CPU waste! |
| **Auxiliary Modules** | Loads 30+ NestJS modules (Metrics, Stats, Agent Tools, Catalog, Takeover) | **`LITE_MODE=true`** — Omits auxiliary modules from the DI graph, shaving off ~25MB heap to comfortably run inside <= 100MB RAM. |
| **History Sync** | Downloads and parses past chat messages on connection | **`BAILEYS_SYNC_HISTORY=false`** — Skips all history message sync, avoiding 100MB+ memory spikes. |
| **Inbound Media** | Downloads and decrypts images, videos, voice notes | **`MEDIA_DOWNLOAD_ENABLED=false`** — Zero incoming media downloads or buffer allocations. |
| **Message Store** | Stores 5,000 messages in SQLite / heap | **`BAILEYS_MESSAGE_STORE_LIMIT=50`** — Keeps only the last 50 sent messages needed for WhatsApp's automatic recipient decryption-retry handshake. |
| **LRU Session Caches** | 5,000 entries per chat/contact map | **`BAILEYS_SESSION_STORE_MAX_ENTRIES=100`** — Slashes in-memory Map allocations by 98%. |
| **Online Presence** | Broadcasts online presence, silences phone notifications | **`BAILEYS_MARK_ONLINE_ON_CONNECT=false`** — Stays invisible to prevent inbound traffic. |
| **Node V8 Heap Limit** | Unbounded | **`NODE_OPTIONS="--max-old-space-size=256"`** — Restricts V8 heap to 256MB to prevent memory bloat. |
| **Outgoing Delivery Acks** | Active | **Retained!** When you send a message, delivery acknowledgments (`sent`, `delivered`, `read`) continue working normally. |

---

## ⚡ Method 1: 1-Click Deploy via Render Blueprint (Recommended)

Render Blueprints automate creating the web service with all micro-optimized environment variables.

1. **Push this branch** (`lightweight`) to your GitHub fork:
   ```bash
   git push origin lightweight
   ```
2. Open your [Render Dashboard](https://dashboard.render.com).
3. Click **New +** → **Blueprint**.
4. Connect your **`OpenWA`** GitHub repository.
5. Select the `lightweight` branch.
6. Render will parse [`render.yaml`](./render.yaml) and automatically configure the service.
7. Click **Apply**. Render will build and deploy OpenWA!

---

## 🛠️ Method 2: Manual Deploy on Render Dashboard

1. In Render, click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Configure:

### Option A: Native Node Environment (Fastest & Lightest)
* **Environment:** `Node`
* **Region:** Any (e.g. Oregon or Frankfurt)
* **Branch:** `lightweight`
* **Build Command:**
  ```bash
  PUPPETEER_SKIP_DOWNLOAD=true npm ci && npm run build:all
  ```
* **Start Command:**
  ```bash
  node dist/main
  ```
* **Plan:** Free

### Option B: Docker Environment
* **Environment:** `Docker`
* **Dockerfile Path:** `./Dockerfile.render`
* **Plan:** Free

---

## 🔑 Key Environment Variables for Send-Only

Add these under the **Environment** tab of your Render web service (or use [`render.yaml`](./render.yaml) / [`.env.render.example`](./.env.render.example)):

```env
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=256
HOST=0.0.0.0
ENGINE_TYPE=baileys
OUTBOUND_ONLY=true
LITE_MODE=true
BAILEYS_SYNC_HISTORY=false
BAILEYS_SYNC_FULL_HISTORY=false
MEDIA_DOWNLOAD_ENABLED=false
BAILEYS_MARK_ONLINE_ON_CONNECT=false
BAILEYS_MESSAGE_STORE_LIMIT=50
BAILEYS_SESSION_STORE_MAX_ENTRIES=100
DATABASE_TYPE=sqlite
DATABASE_NAME=./data/openwa.sqlite
SESSION_DATA_PATH=./data/sessions
AUTO_START_SESSIONS=true
QUEUE_ENABLED=false
REDIS_ENABLED=false
CACHE_ENABLED=false
SEARCH_ENABLED=false
MCP_ENABLED=false
SERVE_DASHBOARD=true
PUPPETEER_SKIP_DOWNLOAD=true
API_MASTER_KEY=owa_k1_your_random_32_character_master_key
```

---

## ⏰ Keeping OpenWA Awake 24/7 (Preventing 15-Minute Sleep)

Render Free web services spin down after **15 minutes of inactivity**. Because WhatsApp Web/Baileys needs a continuous WebSocket connection to send messages instantly without a 50-second cold start:

1. Register for free on:
   * [Cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com)
2. Create an HTTP monitor pointing to your Render service:
   * **URL:** `https://<your-render-app-name>.onrender.com/api/health`
   * **Interval:** Every **10 minutes**
   * **Method:** `GET`
3. The `/api/health` route is unauthenticated, takes <1ms, and will keep your instance active 24/7 within Render's 750 free monthly hours.

---

## 📱 Pairing Your WhatsApp Account

1. Once deployed, open your app URL: `https://<your-app>.onrender.com`
2. Enter your `API_MASTER_KEY` to access the dashboard.
3. Click **New Session** → Select **Baileys** engine.
4. Scan the QR code with WhatsApp on your phone (**Linked Devices** → **Link a Device**).
5. Once paired, you can send messages via REST API or the dashboard immediately!
