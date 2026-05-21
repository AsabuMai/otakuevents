# Public Launch Checklist

## Before Server Move

- Run `npm run data:migrate-local` once and confirm local accounts, profiles, favorites, event notes, Q&A, and corrections still load.
- Run `npm run backup:local` and keep the generated archive outside the repo.
- Decide the first admin username, then set it in `ADMIN_USERNAMES`.
- Prepare generated data under `data/generated/` on the target server.
- Choose the public domain and HTTPS reverse proxy path.

## Server Setup

- Copy `.env.example` to `.env` and set production values.
- Mount persistent `data/` and `backups/` directories.
- Start with `docker compose up -d --build` or `PORT=5175 HOST=127.0.0.1 node server.mjs`.
- Check `GET /api/health`.
- Sign in with the admin account and open `/#/admin`.

## Public QA

- Open home, event search, event detail, favorites, profile edit, public profile, sources, and admin review.
- Submit a test event question, answer it, then remove or leave it as a known test item.
- Submit a test event correction and confirm/reject it from `/#/admin`.
- Confirm ordinary users cannot see the admin nav item.
- Confirm profile contact/social fields only appear publicly when visibility allows them.

## After Launch

- Schedule backups for `data/local/otakuevents.db`, WAL files, and `data/local/auth-secret`.
- Schedule Eventernote data sync or document a manual sync cadence.
- Watch server logs and rate-limit responses during the first public traffic window.
- Keep a rollback archive from just before launch.
