# Deployment Notes

The current app is a single Node HTTP server plus static frontend files. It reads generated Eventernote JSON files from disk at startup and keeps indexes in memory.

## Runtime

Use Node.js 22 or newer.

```bash
npm ci --omit=dev
npm run data:download
PORT=5175 HOST=0.0.0.0 node server.mjs
```

The server expects:

```text
data/generated/eventernote-catalog.json
```

Optional overlays and caches:

```text
data/generated/eventernote-latest.json
data/generated/venue-names.json
data/generated/event-venue-overrides.json
data/generated/venue-manual-overrides.json
```

Use `EVENTNOTE_DATA_DIR` when data is mounted somewhere outside the repo:

```bash
EVENTNOTE_DATA_DIR=/var/lib/otakuevents/data PORT=5175 HOST=0.0.0.0 node server.mjs
```

The directory should contain a `generated/` subdirectory.

Health check endpoint:

```text
/api/health
```

This endpoint does not load the full catalog; it only reports whether the expected data files exist.

## Temporary Public Preview

For a quick demo from a laptop:

```bash
PORT=5175 HOST=127.0.0.1 node server.mjs
tools/cloudflared tunnel --url http://127.0.0.1:5175
```

This creates a temporary `trycloudflare.com` URL. It is not a production deployment.

## Production TODO

- Put generated JSON data on persistent storage.
- Add a scheduled data sync job.
- Add process supervision such as systemd, pm2, Docker, Fly.io, Render, or another host-managed service.
- Put Cloudflare or another reverse proxy in front of the server.
- Decide whether the latest Eventernote sync runs inside the app host or as a separate job.
