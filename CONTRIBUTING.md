# Contributing

## Branch Flow

Do not push directly to `main` for normal work.

```bash
git checkout main
git pull
git checkout -b feature/short-description
```

Open a pull request when the change is ready. Keep each PR focused on one feature, fix, or data workflow improvement.

## Local Setup

```bash
npm install
npm run data:download
PORT=5175 node server.mjs
```

Large Eventernote data files are not committed. If you already have the data locally, `npm run data:verify` is enough; otherwise use `npm run data:download`.

## Before Opening A PR

Run:

```bash
npm run check
```

This validates syntax, builds the frontend, and runs a small API smoke test that does not require the full dataset.

## Data Files

Commit small, curated metadata files when they are useful:

- `data/generated/venue-names.json`
- `data/generated/event-venue-overrides.json`
- `data/generated/venue-manual-overrides.json`

Do not commit large reproducible datasets:

- `data/raw/eventernote-events.json`
- `data/generated/eventernote-catalog.json`
- `data/generated/eventernote-latest.json`
- `data/local/`

If a PR changes data-generation behavior, include the command you ran and a short summary from:

```bash
npm run data:report
```

## Code Style

- Prefer small functions over broad rewrites.
- Keep frontend state transitions explicit; route changes should be reflected in the hash.
- Keep server endpoints paginated unless the result set is known to be small.
- Avoid adding dependencies unless they remove meaningful complexity.

Frontend ownership:

- `src/runtime-app.js`: Vue state, page interactions, and the large template.
- `src/api.js`: browser API fetch wrapper.
- `src/domain.js`: shared frontend constants, route parsing, date formatting, and display helpers.
- `src/notebook-store.js`: local notebook persistence.

## Pull Request Checklist

- The app builds with `npm run build`.
- API smoke tests pass with `npm run test:api`.
- New user-facing behavior is documented in `README.md` when relevant.
- Large data files, local tunnels, `dist/`, and `node_modules/` are not staged.
