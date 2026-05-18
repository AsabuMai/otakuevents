# OtakuEvents

Local Vue/Node prototype for browsing Japanese anime, seiyuu, anisong, and related Eventernote activity data.

The browser does not import the generated datasets directly. `server.mjs` loads the local catalog, merges the latest crawl, builds in-memory indexes, and exposes paginated `/api/*` endpoints.

## Quick Start

```bash
npm install
npm run data:download
PORT=5175 node server.mjs
```

Then open:

```text
http://127.0.0.1:5175/
```

`npm run data:download` downloads the current data pack from GitHub Releases and extracts it under `data/`. If you already have the data locally, use `npm run data:verify` instead. Large source/generated datasets are not committed to Git.

On a phone in the same Wi-Fi, use the machine LAN IP, for example:

```text
http://192.168.0.10:5175/
```

For a temporary public preview, run:

```bash
tools/cloudflared tunnel --url http://127.0.0.1:5175
```

## Checks

```bash
npm run build
npm run test:api
npm run check
```

`npm run test:api` uses a small generated fixture via `EVENTNOTE_DATA_DIR`, so it works in CI without the full Eventernote dataset.

## Data

- Raw historical source: `data/raw/eventernote-events.json`
- Generated historical catalog: `data/generated/eventernote-catalog.json`
- Latest crawl overlay: `data/generated/eventernote-latest.json`
- Venue cache: `data/generated/venue-names.json`
- Source dataset: https://zenodo.org/records/11151063
- DOI: `10.5281/zenodo.11151063`

Generated large JSON files are intentionally ignored by git and can be rebuilt or refreshed with the scripts below.

## Scripts

```bash
npm run data:download
npm run data:verify
node scripts/build-eventernote-catalog.mjs
node scripts/sync-eventernote-latest.mjs --days=30 --detail-limit=1200
node scripts/sync-eventernote-detail-batches.mjs --start-month=2024-05 --end-month=2027-12 --detail-limit=12000 --force-detail
```

Shared classification rules live in `scripts/lib/classify.mjs` and are used by both crawlers and the server.

## Features

- Calendar-first activity browsing by day and month
- Keyword, location, and type filters that update the calendar and day list
- Event detail pages with performer, venue, work, and source links
- Performer, work, and venue directories backed by paginated API responses
- Local participation notes
- Source metadata page

## Collaboration

Use feature branches and pull requests instead of pushing directly to `main`.

```bash
git checkout main
git pull
git checkout -b feature/your-change
```

Before opening a PR, run `npm run check`. More details are in [`CONTRIBUTING.md`](CONTRIBUTING.md).
