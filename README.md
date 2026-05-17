# Eventnote Japan

Local Vue/Node prototype for browsing Japanese anime, seiyuu, anisong, and related Eventernote activity data.

The browser does not import the generated datasets directly. `server.mjs` loads the local catalog, merges the latest crawl, builds in-memory indexes, and exposes paginated `/api/*` endpoints.

## Run

```bash
PORT=5175 node server.mjs
```

Then open:

```text
http://127.0.0.1:5175/
```

On a phone in the same Wi-Fi, use the machine LAN IP, for example:

```text
http://192.168.0.10:5175/
```

For a temporary public preview, run:

```bash
tools/cloudflared tunnel --url http://127.0.0.1:5175
```

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
