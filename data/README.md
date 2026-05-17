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
