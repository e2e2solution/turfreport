# Vathiyayath Sports Hub

Web + mobile app to manage daily cricket, football, and badminton match bookings with payments and Excel report generation.

## Features

- **Add daily entries** — name, sport, match date, time (24/7), total amount
- **Advance & balance payments** — GPay / Cash with dates (advance is optional)
- **Status** — PENDING or CLOSED
- **Remarks** column
- **Daily collection total** — sums all GPay + Cash collected on a selected date
- **Update records** — edit or delete existing entries
- **Excel report** — downloads a formatted `.xlsx` matching your spreadsheet layout

## Quick Start

```bash
# Install dependencies
npm run install:all

# Terminal 1 — start backend (port 3001)
npm run dev:server

# Terminal 2 — start frontend (port 5173)
npm run dev:client
```

Open **http://localhost:5173** on your phone or desktop.

## Mobile Usage

The UI is mobile-first with a bottom navigation bar. Open the app URL on your phone (same Wi-Fi network) using your computer's IP address, e.g. `http://192.168.1.5:5173`.

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** SQLite (file-based, no setup needed)
- **Report:** ExcelJS for `.xlsx` export
