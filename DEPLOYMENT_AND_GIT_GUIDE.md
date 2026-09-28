# Vathiyayath Sports Hub — Deployment & Git Guide

Use this document when you open a **new Cursor window** for a different project. It explains how **this app** was set up, pushed to Git, and deployed to the cloud.

---

## What this app is

| Layer | Technology |
|-------|------------|
| Staff web app | React + Vite (`client/`) |
| Owner mobile app | React build + Capacitor Android APK |
| Trainer mobile app | Separate React build + Capacitor Android APK |
| Backend API | Node.js + Express (`server/`) |
| Database | **MongoDB Atlas** (`vsh_app`) — all staff/owner/trainer data |
| Local backup | Optional JSON dumps in `server/backups/` |
| Hosting | [Render](https://render.com) (free tier) |
| Source code | [GitHub](https://github.com/e2e2solution/turfreport) |

**Live cloud URL (example):** `https://vsh-sports-hub.onrender.com`

---

## Project folder structure

```
t11/                          ← repo root (folder name can be anything)
├── client/                   ← React frontend
│   ├── src/                  ← staff + owner + trainer UI code
│   ├── android/              ← Owner APK (Capacitor)
│   ├── android-trainer/      ← Trainer APK (Capacitor)
│   ├── dist/                 ← staff web build (gitignored)
│   ├── dist-owner/           ← owner build (gitignored)
│   └── dist-trainer/         ← trainer build (gitignored)
├── server/                   ← Express API
│   ├── index.js              ← main server; serves built client in production
│   ├── .env                  ← secrets (NEVER commit — see .gitignore)
│   ├── data.db               ← legacy SQLite (gitignored; migrate once to Mongo)
│   ├── db/mongo.js           ← Mongo connection
│   ├── db/collections.js     ← Mongo CRUD helpers
│   └── scripts/migrate-sqlite-to-mongo.js
├── render.yaml               ← Render deploy config (auto-read by Render)
├── .github/workflows/        ← GitHub Actions to build APKs
├── package.json              ← root scripts (install:all, dev, build, etc.)
└── README.md
```

---

## Part 1 — Run locally (development)

### 1. Install Node.js

Install **Node.js 20+** from [nodejs.org](https://nodejs.org).

### 2. Install dependencies

Open terminal in the project folder:

```bash
npm run install:all
```

This runs `npm install` inside both `server/` and `client/`.

### 3. Create local environment file

Copy the example and edit values:

```bash
copy server\.env.example server\.env
```

Edit `server/.env` — at minimum set:

- `AUTH_USERNAME` / `AUTH_PASSWORD` — staff login
- `MONGODB_URI` — MongoDB Atlas connection string (**required**)
- `MONGODB_DB=vsh_app` — app database name
- `OWNER_PIN` — owner app PIN (default `123`)
- `TRAINER_PASSWORD` — trainer app password (default `123`)

### 3b. One-time data migration (SQLite → Mongo)

If you still have `server/data.db` from before the Mongo cutover:

```bash
npm run migrate:mongo --prefix server
```

This upserts all tables into `vsh_app` and merges any old `vsh_owner` collections.

Atlas **Network Access** must allow your IP (or `0.0.0.0/0` for Render).
### 4. Start backend and frontend (two terminals)

**Terminal 1 — API server (port 3001):**

```bash
npm run dev:server
```

**Terminal 2 — React dev server (port 5173):**

```bash
npm run dev:client
```

Open **http://localhost:5173** in the browser.

### 5. Use on phone (same Wi‑Fi)

Find your PC IP (e.g. `192.168.1.5`) and open `http://192.168.1.5:5173` on the phone.

> Owner/trainer apps in **another district** cannot use a local IP. They need the **Render cloud URL** (Part 3).

---

## Part 2 — Add project to Git & GitHub

This repo is hosted at:

**https://github.com/e2e2solution/turfreport.git**

### First-time setup (new project)

```bash
cd C:\Users\AjayKumarD\t11

# Initialize git (skip if already a repo)
git init

# Stage all files (secrets are excluded by .gitignore)
git add .

# First commit
git commit -m "Initial commit: Vathiyayath Sports Hub"

# Create empty repo on GitHub (via website or gh CLI), then:
git remote add origin https://github.com/e2e2solution/turfreport.git
git branch -M main
git push -u origin main
```

### Files that must NEVER go to Git

Already listed in `.gitignore`:

| File / folder | Why |
|---------------|-----|
| `server/.env` | passwords, MongoDB URI, JWT secret |
| `client/.env.owner` | cloud URL baked into APK |
| `server/data.db` | local SQLite data |
| `node_modules/` | reinstall with npm |
| `client/dist*` | built output — Render builds these |

### Day-to-day Git workflow

```bash
# See what changed
git status
git diff

# Stage and commit
git add .
git commit -m "Describe what you changed"

# Push to GitHub (triggers Render auto-deploy if connected)
git push origin main
```

### Using GitHub CLI (optional)

```bash
gh repo create my-new-app --private --source=. --push
```

---

## Part 3 — Deploy to Render (cloud server)

Render hosts the **backend + built web apps** so owner/trainer can connect from anywhere.

### Architecture

```
Staff PC (local)                    Render (cloud)
┌─────────────────┐                ┌──────────────────────────┐
│ server on :3001 │──CLOUD_SYNC──► │ Express API + static UI  │
│ SQLite bookings │                │ MongoDB Atlas connection │
└─────────────────┘                └──────────────────────────┘
                                              ▲
Owner phone / Trainer phone ──────────────────┘
(HTTPS URL baked into APK or entered in app)
```

### Step-by-step on Render

1. Sign up at [render.com](https://render.com) and connect your **GitHub** account.
2. Click **New → Blueprint** (or **New Web Service**).
3. Select repo: `e2e2solution/turfreport`.
4. Render reads `render.yaml` automatically:

```yaml
# render.yaml (already in repo)
services:
  - type: web
    name: vsh-sports-hub
    runtime: node
    plan: free
    buildCommand: npm install --prefix server && npm install --prefix client --include=dev && npm run build --prefix client && npm run build:trainer --prefix client
    startCommand: NODE_ENV=production npm start --prefix server
    healthCheckPath: /api/health
```

5. Set **environment variables** in Render dashboard (Settings → Environment):

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | long random string (Render can auto-generate) |
| `AUTH_USERNAME` | staff login username |
| `AUTH_PASSWORD` | staff login password |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `MONGODB_DB` | `vsh_owner` |
| `OWNER_PIN` | owner app PIN |
| `OWNER_SYNC_KEY` | long random string (same on staff PC for sync) |
| `TRAINER_PASSWORD` | trainer login password |

6. Click **Deploy**. First deploy takes ~5–10 minutes.
7. Your URL will look like: `https://vsh-sports-hub.onrender.com`
8. Test: open `https://YOUR-URL.onrender.com/api/health` — should return `{"ok":true,...}`.

### After code changes

```bash
git add .
git commit -m "your change"
git push origin main
```

Render **auto-deploys** on every push to `main`. You can also click **Manual Deploy** in the Render dashboard.

### Staff PC → cloud sync (optional but recommended)

On the **local staff PC** `server/.env`, add:

```env
CLOUD_SYNC_URL=https://vsh-sports-hub.onrender.com
OWNER_SYNC_KEY=<same value as on Render>
```

When the staff PC cannot reach MongoDB directly, reports are forwarded to the cloud server.

---

## Part 4 — MongoDB Atlas (cloud database)

1. Create free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas).
2. Create a database user (username + password).
3. **Network Access** → Add IP Address → `0.0.0.0/0` (allows Render to connect).
4. Get connection string: **Connect → Drivers → Node.js**.
5. Replace `<db_password>` with your real password.
6. Put the URI in:
   - `server/.env` → `MONGODB_URI=...` (local)
   - Render dashboard → `MONGODB_URI` (cloud)

Database name: `vsh_owner` (set via `MONGODB_DB`).

---

## Part 5 — Build Android APKs

There are **two apps**: Owner (`com.vshub.owner`) and Trainer.

### Option A — Build on GitHub (recommended, no Android Studio needed)

1. Go to GitHub repo → **Actions** tab.
2. Run workflow:
   - **Build Owner APK** or **Build Trainer APK**
3. Optionally enter `cloud_url` (e.g. `https://vsh-sports-hub.onrender.com`).
   - Or set repo secret `VITE_API_BASE` once in Settings → Secrets.
4. When done, download APK from **Artifacts** (kept 30 days).

### Option B — Build locally on Windows

**Owner APK:**

```bash
# Set cloud URL (create client/.env.owner from example)
copy client\.env.owner.example client\.env.owner
# Edit VITE_API_BASE=https://your-app.onrender.com

npm run build:owner-apk
# APK at: client\android\app\build\outputs\apk\debug\app-debug.apk
```

**Trainer APK:**

```bash
npm run build:trainer-apk
# APK at: client\android-trainer\app\build\outputs\apk\debug\app-debug.apk
```

Requires **Java JDK 21** and Android SDK (or Android Studio).

### Install APK on phone

1. Copy APK to phone (USB, WhatsApp, Google Drive).
2. Enable **Install from unknown sources** for your file manager.
3. Tap APK to install.
4. Owner app: enter cloud URL if not baked in, then PIN.
5. Trainer app: enter cloud URL and trainer password.

---

## Part 6 — How production serving works

When `NODE_ENV=production` (Render), `server/index.js`:

1. Runs Express API on `/api/*`.
2. Serves built React files from `client/dist/` (staff web).
3. Serves owner app at `/owner` from `client/dist-owner/`.
4. Serves trainer app at `/trainer` from `client/dist-trainer/`.

Build command on Render creates `dist` and `dist-trainer` before starting the server.

---

## Part 7 — Start a NEW app in another Cursor window

Use this checklist to replicate the same setup for a different project.

### 1. Create the project

```
my-new-app/
├── client/          ← Vite + React
├── server/          ← Express API
├── package.json     ← root scripts
├── render.yaml      ← copy and rename service
└── .gitignore       ← exclude .env, node_modules, dist
```

### 2. Copy patterns from this repo

| What to copy | From |
|--------------|------|
| Root `package.json` scripts | `install:all`, `dev:server`, `dev:client`, `build` |
| `render.yaml` | Change `name`, env vars |
| `.gitignore` | Same pattern |
| `server/index.js` production static serving | Serve `client/dist` when `NODE_ENV=production` |
| GitHub Actions | `.github/workflows/build-owner-apk.yml` (rename artifacts) |

### 3. New GitHub repo

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-ORG/my-new-app.git
git push -u origin main
```

### 4. New Render service

- Connect new GitHub repo.
- Add `render.yaml` or configure build/start commands manually.
- Set all env vars fresh (new `JWT_SECRET`, `OWNER_SYNC_KEY`, etc.).

### 5. New MongoDB database (optional)

- Same Atlas cluster, different `MONGODB_DB` name — or a new cluster.

### 6. New Android app ID (if using Capacitor)

Edit `client/capacitor.config.json`:

```json
{
  "appId": "com.yourcompany.newapp",
  "appName": "Your App Name"
}
```

---

## Quick reference — common commands

| Task | Command |
|------|---------|
| Install everything | `npm run install:all` |
| Dev backend | `npm run dev:server` |
| Dev frontend | `npm run dev:client` |
| Build for production | `npm run build` |
| Start production locally | `npm run start:prod` |
| Build owner APK | `npm run build:owner-apk` |
| Build trainer APK | `npm run build:trainer-apk` |
| Push to GitHub | `git add . && git commit -m "msg" && git push` |
| Check cloud health | Open `/api/health` on your Render URL |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Owner app says "Cannot reach server" | Use `https://...onrender.com`, not `localhost` or `192.168.x.x` |
| Render build fails on Vite | Ensure `npm install --prefix client --include=dev` (devDeps needed for build) |
| MongoDB connection failed | Check Atlas password, IP whitelist `0.0.0.0/0`, `MONGODB_URI` on Render |
| Staff push not reaching owner | Set `CLOUD_SYNC_URL` + `OWNER_SYNC_KEY` on staff PC `.env` |
| Render shows old features | Push latest code, then **Manual Deploy** on Render |
| APK can't connect | Rebuild APK with correct `VITE_API_BASE` / `cloud_url` |
| Free Render sleeps | First request after ~15 min idle may take 30–60 seconds to wake |

---

## Current repo details (this project)

| Item | Value |
|------|-------|
| GitHub remote | `https://github.com/e2e2solution/turfreport.git` |
| Branch | `main` |
| Render service name | `vsh-sports-hub` |
| MongoDB database | `vsh_owner` |
| Owner Android ID | `com.vshub.owner` |

---

*Last updated: August 2026 — matches repo state at `t11` workspace.*
