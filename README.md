# Murdili Radar

Real-time early-token intelligence dashboard for Solana/Pump.fun.

## What it does

- Discovers recent Pump.fun tokens and maintains a live in-memory/persistent watch universe.
- Enriches market data from DEX Screener.
- Checks Solana mint/freeze controls and top-holder concentration.
- Uses GoPlus security data when available.
- Inspects recent creator history from Pump.fun public frontend data.
- Watches public Binance announcements for conservative name/ticker matches; these matches are informational only, are not contract verification, and do not increase Radar Score.
- Produces explainable Radar Score / risk flags and server-sent event alerts.
- RU/EN interface, local watchlist, browser sound alerts.

## Data integrity

The UI never injects demo tokens. If a source is unavailable, source health is displayed and missing fields remain missing.

Radar Score is a research triage score, not a return forecast and not investment advice. A high score does not mean a token will rise or be listed on a centralized exchange.

## Frontend

Static files are in `web/` and are deployed to GitHub Pages by `.github/workflows/pages.yml`. The custom domain is `murdilimax.com`.

The frontend API base is currently:

`https://murdilimax-live-earth-api.onrender.com`

## Backend

Render should run the `server/` directory with:

- Build: `npm install`
- Start: `npm start`
- Runtime: Node 20+

Optional environment variables:

- `DATABASE_URL` — PostgreSQL persistence. Without it, the radar runs in memory.
- `SOLANA_RPC_URL` — dedicated Solana RPC. Defaults to a public endpoint with rate limits.
- `GOPLUS_TOKEN` — optional GoPlus bearer token; the API will also attempt unauthenticated free access.

## Public endpoints

- `GET /api/health`
- `GET /api/radar`
- `GET /api/token/:mint`
- `GET /api/announcements/binance`
- `GET /api/events` — SSE

## Free-mode limitations

The system is deliberately usable without paid data vendors, but free/public endpoints have rate limits and no production SLA. A future paid infrastructure upgrade should prioritize a dedicated Solana RPC and licensed social/X data before adding automated trading or execution.
