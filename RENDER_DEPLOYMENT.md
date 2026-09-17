# Deploying OpenWA on Render Free Plan (512 MB RAM)

This guide covers how to deploy and run **OpenWA** reliably on the **Render Free Web Service** tier within the **512 MB RAM** limit.

---

## 🚀 Key Optimizations for Render Free Tier

| Challenge | Standard Setup | Render Free Optimized Setup |
| :--- | :--- | :--- |
| **RAM (512 MB Limit)** | WhatsApp-Web.js + Chromium (~500MB–800MB RAM) 💥 *OOM Crash* | **`ENGINE_TYPE=baileys`** (~60MB–100MB RAM) ✅ |
| **Node V8 Heap** | Unbounded V8 memory growth | **`NODE_OPTIONS="--max-old-space-size=384"`** ✅ |
| **Optional Services** | Redis + BullMQ queues + Search indexer | Disabled (`QUEUE_ENABLED=false`, `SEARCH_ENABLED=false`) ✅ |
| **Docker Build** | Full Debian Chromium + ffmpeg + Postgres (~2.2 GB image, 15+ min build) | **`Dockerfile.render`** or **Native Node 22** (~180 MB image, <2 min build) ✅ |
| **15-Min Inactivity Sleep** | Web service spins down after 15 minutes of no incoming requests | External free keep-alive ping on **`/api/health`** ✅ |

---

## ⚡ Method 1: 1-Click Deploy via Render Blueprint (Recommended)

Render Blueprints automate creating the web service with the correct environment variables.

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

If you prefer configuring the service manually in the Render dashboard:

1. In Render, click **New +** → **Web Service**.
2. Connect your GitHub repository.
3. Choose your deployment type:

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

## 🔑 Required Environment Variables

Set the following in the **Environment** tab of your Render web service:

| Variable | Recommended Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Production mode |
| `NODE_OPTIONS` | `--max-old-space-size=384` | Restricts V8 heap to prevent exceeding 512MB RAM |
| `HOST` | `0.0.0.0` | Binds to all network interfaces |
| `ENGINE_TYPE` | `baileys` | **Mandatory:** Pure WebSocket engine (no Chromium) |
| `PUPPETEER_SKIP_DOWNLOAD` | `true` | Prevents downloading heavy Chrome binary |
| `DATABASE_TYPE` | `sqlite` | Lightweight local database (or `postgres` if using external DB) |
| `DATABASE_NAME` | `./data/openwa.sqlite` | SQLite database path |
| `SESSION_DATA_PATH` | `./data/sessions` | Where session credentials are stored |
| `AUTO_START_SESSIONS` | `true` | Restarts paired sessions on boot |
| `QUEUE_ENABLED` | `false` | Disables Redis queues |
| `REDIS_ENABLED` | `false` | Disables Redis client |
| `CACHE_ENABLED` | `false` | Disables external cache |
| `SEARCH_ENABLED` | `false` | Disables message search indexer |
| `SERVE_DASHBOARD` | `true` | Serves the web dashboard SPA on root URL |
| `API_MASTER_KEY` | *(Random 32+ chars)* | Master admin API key (must be ≥32 characters) |

---

## ⏰ Keeping OpenWA Awake 24/7 (Preventing 15-Minute Sleep)

Render Free web services spin down after **15 minutes of inactivity**. Because WhatsApp Web/Baileys needs a continuous WebSocket connection to receive incoming messages in real-time, the service must remain awake.

### Solution: Set up an external free keep-alive ping

Render allows **750 free instance hours per month**, which is enough to run 1 service 24/7 continuously (744 hours in a 31-day month).

1. Register for free on a monitoring service like:
   * [Cron-job.org](https://cron-job.org)
   * [UptimeRobot](https://uptimerobot.com)
   * [Better Stack](https://betterstack.com)
2. Create a new HTTP monitor pointing to your Render service:
   * **URL:** `https://<your-render-app-name>.onrender.com/api/health`
   * **Interval:** Every **10 minutes** (or 5 minutes)
   * **Method:** `GET`
3. The `/api/health` route is unauthenticated, lightweight (<1ms response time), and will keep your instance active 24/7.

---

## 💾 Notes on Ephemeral Storage & Re-linking

Render Free tier uses **ephemeral disk storage**. This means:
* When your service is redeployed or manually restarted from the Render dashboard, files written to `./data` are reset.
* To keep your WhatsApp session connected without re-scanning:
  1. Keep your service alive using the keep-alive monitor above.
  2. If you want permanent persistence across redeploys, you can connect an external free PostgreSQL database (e.g. Supabase, Neon, or Render PostgreSQL) by setting:
     ```env
     DATABASE_TYPE=postgres
     DATABASE_HOST=...
     DATABASE_PORT=5432
     DATABASE_USERNAME=...
     DATABASE_PASSWORD=...
     DATABASE_NAME=...
     DATABASE_SSL=true
     ```

---

## 📱 Pairing Your WhatsApp Account

1. Once deployed, open your app URL: `https://<your-app>.onrender.com`
2. Enter your `API_MASTER_KEY` to access the dashboard.
3. Click **New Session** → Select **Baileys** engine.
4. Scan the QR code or request a phone number pairing code using WhatsApp on your phone (**Linked Devices** → **Link a Device**).
