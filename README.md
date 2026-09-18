# Live Earth

Native GitHub Pages + Render version of Live Earth. The public frontend is built from this repository and served at **murdilimax.com**. The API is a Node/Express service on Render, with PostgreSQL for durable viewer places and Server-Sent Events for realtime gift updates.

Public views:
- `https://murdilimax.com/` — interactive globe
- `https://murdilimax.com/?obs=1` — OBS vertical scene
- `https://murdilimax.com/?control=1` — owner setup

The TikTok connector runs locally on the streaming Mac and forwards LIVE gift/chat events to the Render API using a private rotating bridge token.
