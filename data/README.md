# Eventnote Data Layer

The frontend does not import generated Eventernote data. The local Node server reads data files, builds indexes in memory, and serves paginated JSON APIs.

Server-side files:

- `raw/eventernote-events.json`: original Zenodo historical dataset
- `generated/eventernote-catalog.json`: generated historical API catalog
- `generated/eventernote-latest.json`: latest Eventernote crawl overlay
- `generated/venue-names.json`: cached Eventernote place names
- `generated/event-venue-overrides.json`: event-page venue overrides
- `generated/venue-manual-overrides.json`: manual venue overrides

Scripts:

- `scripts/build-eventernote-catalog.mjs`: builds the full server catalog
- `scripts/sync-eventernote-latest.mjs`: crawls Eventernote date pages and event detail pages
- `scripts/sync-eventernote-detail-batches.mjs`: runs latest sync month-by-month
- `scripts/fetch-eventernote-venues.mjs`: caches venue display names from Eventernote place pages
- `scripts/fetch-eventernote-event-venues.mjs`: resolves venue names from event detail pages
- `scripts/lib/classify.mjs`: shared type/work/tag classification rules

Source:

- Zenodo DOI: `10.5281/zenodo.11151063`
- Source page: https://zenodo.org/records/11151063
- Historical dataset coverage: through `2024-04-30`
- Latest overlay coverage depends on the most recent crawl and may include future events already published by Eventernote.

Large generated files are reproducible and should not be committed.

## Bootstrap For A Fresh Clone

The repository intentionally does not include the large raw and generated datasets:

- `data/raw/eventernote-events.json` is about 100 MB
- `data/generated/eventernote-catalog.json` is about 266 MB
- `data/generated/eventernote-latest.json` is about 95 MB

To run the full local app, you need at least:

```text
data/generated/eventernote-catalog.json
```

Optional but recommended:

```text
data/generated/eventernote-latest.json
data/generated/venue-names.json
data/generated/event-venue-overrides.json
data/generated/venue-manual-overrides.json
```

Check your local data state with:

```bash
npm run data:verify
```

Download and extract the current shared data pack from GitHub Releases:

```bash
npm run data:download
```

To use a different zip URL:

```bash
npm run data:download -- https://example.com/otakuevents-data.zip
```

To share the exact local dataset with teammates, create a runnable data pack:

```bash
npm run data:pack
```

This writes a zip file under `releases/`, for example:

```text
releases/otakuevents-data-20260518.zip
```

Upload that zip to GitHub Releases, Google Drive, OneDrive, or another shared storage. Teammates should unzip it at the repository root so the files land back under `data/`.

### Option A: Copy From A Teammate

Ask a teammate for the current `data/generated/` files and place them under the same paths in this repo. This is the quickest way to get the app running with the current working dataset.

### Option B: Rebuild From Source

Download the historical Eventernote dataset from Zenodo:

- https://zenodo.org/records/11151063
- DOI: `10.5281/zenodo.11151063`

Place the raw JSON at:

```text
data/raw/eventernote-events.json
```

Then rebuild:

```bash
node scripts/build-eventernote-catalog.mjs
node scripts/sync-eventernote-latest.mjs --days=30 --detail-limit=1200
node scripts/clean-eventernote-latest.mjs
```

The latest sync scripts fetch Eventernote pages from the network and can take a while.

## Test Fixtures

CI does not require the full dataset. `scripts/smoke-test-api.mjs` creates a tiny temporary catalog and starts `server.mjs` with:

```bash
EVENTNOTE_DATA_DIR=/path/to/fixture-data
```

This keeps API smoke tests fast and reproducible.
