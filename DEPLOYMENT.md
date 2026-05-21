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

## Docker Compose

Create `.env` from `.env.example`, then run:

```bash
cp .env.example .env
docker compose up -d --build
```

The compose file binds the app to localhost:

```text
127.0.0.1:5175
```

Put Caddy, Nginx, Cloudflare Tunnel, or another reverse proxy in front of it for HTTPS and your public domain.

The compose setup mounts:

```text
./data    -> /var/lib/otakuevents/data
./backups -> /var/lib/otakuevents/backups
```

## Accounts

The built-in account and user interaction system stores local write data in SQLite:

```text
data/local/otakuevents.db
data/local/auth-secret
```

These files are intentionally ignored by Git. Passwords are hashed with Node's `scrypt`, and login sessions are signed HttpOnly cookies. Set `AUTH_COOKIE_SECURE=1` when serving only over HTTPS and you want cookies marked `Secure`.

Administrator access is username based. Create a normal account in the site first, then add that username to `ADMIN_USERNAMES`:

```bash
ADMIN_USERNAMES=wuzijian,ops_user
```

The username `admin` is always treated as an administrator. After restarting the server, sign in with that account and open:

```text
/#/admin
```

The admin page shows pending event corrections and recent event Q&A. Ordinary users can still submit questions, answers, confirmations, and corrections from event detail pages, but only admin users can confirm or reject corrections.

Older local JSON stores are migrated into SQLite automatically on startup. To run and inspect the migration explicitly:

```bash
npm run data:migrate-local
```

Back up the SQLite database and auth secret together:

```text
data/local/otakuevents.db
data/local/auth-secret
```

If SQLite WAL files are present while the server is running, include them in hot backups too:

```text
data/local/otakuevents.db-wal
data/local/otakuevents.db-shm
```

Run the bundled backup script from the repo root:

```bash
npm run backup:local
```

With Docker:

```bash
docker compose exec otakuevents npm run backup:local
```

Use `BACKUP_DIR=/path/to/backups` when you want archives somewhere other than `./backups`.

## Restore Local Data

Stop the server before restoring so SQLite files are not changing underneath the copy:

```bash
docker compose down
```

Then unpack the backup archive into the mounted local data directory:

```bash
mkdir -p data/local
tar -xzf backups/otakuevents-local-YYYY-MM-DDTHH-MM-SS.tar.gz -C data/local
```

For a non-Docker server, restore into the `local/` directory under `EVENTNOTE_DATA_DIR`:

```bash
mkdir -p /var/lib/otakuevents/data/local
tar -xzf /var/lib/otakuevents/backups/otakuevents-local-YYYY-MM-DDTHH-MM-SS.tar.gz -C /var/lib/otakuevents/data/local
```

Start the server again and verify:

```bash
docker compose up -d
curl http://127.0.0.1:5175/api/health
```

Sign in with an existing account after restore. If sessions were invalidated, login again; the restored `auth-secret` preserves existing session cookies when possible.

## Production Environment

Recommended environment:

```bash
NODE_ENV=production
HOST=127.0.0.1
PORT=5175
EVENTNOTE_DATA_DIR=/var/lib/otakuevents/data
AUTH_COOKIE_SECURE=1
ADMIN_USERNAMES=your_admin_username
RATE_LIMIT_ENABLED=1
```

`ADMIN_USERNAMES` is a comma-separated list. The username `admin` is always treated as an administrator.

## Rate Limits

The Node server includes basic in-memory rate limits:

- auth: 20 login/register requests per 15 minutes per IP
- writes: 80 non-GET API requests per 15 minutes per IP
- suggestions: 240 suggestion requests per minute per IP
- general API reads: 600 requests per minute per IP

Set `RATE_LIMIT_ENABLED=0` to disable this for local testing.

## Temporary Public Preview

For a quick demo from a laptop:

```bash
PORT=5175 HOST=127.0.0.1 node server.mjs
tools/cloudflared tunnel --url http://127.0.0.1:5175
```

This creates a temporary `trycloudflare.com` URL. It is not a production deployment.

## Production TODO

- Add a scheduled data sync job.
- Add a restore script or documented restore runbook.
- Add admin audit logging if multiple operators will review corrections.
- Put Cloudflare or another reverse proxy in front of the server if not using Docker compose locally.
- Decide whether the latest Eventernote sync runs inside the app host or as a separate job.
