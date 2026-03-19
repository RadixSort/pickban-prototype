# PickBan Prototype

PickBan Prototype is a local Node/Express web app that ranks League of Legends draft picks with live Lolalytics data. It is meant to run on one machine, without a build step, database, or hosted deployment.

## Start Here

- New to terminals or local apps: [docs/NON_TECHNICAL_GUIDE.md](docs/NON_TECHNICAL_GUIDE.md)
- Want architecture and API details: [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md)

## Requirements

- Node.js 18 or newer
- Internet access while fetching suggestions
- A modern browser

Node 18+ is required because the server uses built-in `fetch` and the test suite uses `node:test`.

## Quick Start

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Run the test suite with:

```bash
npm test
```

## Daily Workflow

1. Start the server with `npm start`.
2. Add up to 4 allied champions and up to 5 enemy champions.
3. Optionally assign known ally roles.
4. Click `Fetch Suggestions`.
5. The app fetches every role that is still unassigned.
6. Use the `Target role` selector in the results panel to switch between returned role bundles.
7. Use `Rank by` to switch between `Projected Agency` and `Projected Win Rate`.

Rules enforced by the current code:

- The same champion cannot appear on both sides.
- You must choose at least one champion before fetching suggestions.
- Ally role assignments are optional, but duplicate ally roles are rejected.
- Returned champions must pass the live tier-list thresholds for the requested role: `lanePercent >= 10` and `pickRate >= 0.5`.
- Results with `Projected Win Rate <= 50%` stay visible and are highlighted instead of being filtered out.

## Commands

- `npm start`: runs `node server.js`
- `npm test`: runs `node --test`
- `npm run bench:efficiency`: runs the synthetic performance benchmark in `bench/efficiency.js`

There is no build, lint, or bundling step in this repository.

## Repo Map

- `server.js`: Express entry point, API routes, Lolalytics fetch/parsing, scoring, and shutdown handling
- `public/index.html`: static shell loaded by the browser
- `public/app.js`: client-side state, draft UI, request submission, and results rendering
- `public/*.js`: shared helper modules loaded in the browser and reused by Node via `require(...)`
- `public/champions.json`: local champion metadata for search and icons
- `lib/request-normalization.js`: request validation and champion/ally normalization
- `lib/requested-target-roles.js`: target-role resolution for explicit or inferred role requests
- `lib/role-suggestion-results.js`: role-level aggregation, filtering, sorting, and response metadata
- `lib/candidate-score-accumulator.js`: running-total score accumulation used by role aggregation
- `lib/lolalytics-tier-list.js`: tier-list HTML parsing and eligibility mapping
- `lib/matchup-orientation.js`: enemy win-rate orientation helper
- `test/*.test.js`: Node test suite for the shared helpers and parsers
- `bench/efficiency.js`: synthetic benchmark for the role aggregation and top-N ranking helpers
- `docs/`: user-facing and technical documentation

## Architecture At A Glance

1. `server.js` serves the static frontend from `public/`.
2. The browser loads `champions.json`, app config, and the shared frontend helpers.
3. The current UI sends `rankFilter`, `allies`, and `enemies` to `POST /suggest`.
4. The backend resolves which target roles to fetch:
   - explicit `roles`, `role`, or `targetRole` fields if provided
   - otherwise every role not already assigned to an allied champion
5. For each target role, the backend fetches live Lolalytics synergy, counter, and tier-list data, then merges the results into one ranked list.
6. The response is returned as `resultsByRole` and `metaByRole`. Single-role responses also include legacy `results` and `meta` fields for compatibility.

Two implementation details matter when you change behavior:

- The backend reuses several helpers from `public/` instead of duplicating logic in `lib/`.
- Remote Lolalytics responses are cached in memory for 5 minutes per URL; frontend results are cached in memory per draft key for the current browser session.

## Setup Notes

- Default port: `3000`
- Override the port on macOS/Linux: `PORT=3001 npm start`
- Override the port on PowerShell: `$env:PORT=3001; npm start`
- Frontend assets are served with `Cache-Control: no-store`, so a normal browser refresh picks up static file changes
- Server-side code changes still require restarting `npm start`

## Troubleshooting

### `npm start` fails immediately

Run `node -v`. If Node is missing or older than 18, install a newer version.

### `http://localhost:3000` does not load

- Confirm `npm start` is still running
- Confirm you opened the same port the server logged
- If port `3000` is busy, start the app on another port

### The UI does not show the role I expected

- The fetch request only returns roles that are still unassigned after ally role selection
- If you assign `support` to an ally, support suggestions are intentionally removed from the available result roles

### I changed code but still see old behavior

- Refresh the page for frontend-only changes
- Restart `npm start` after changing `server.js` or any server-imported helper

### Suggestions fail or only some roles load

- The app depends on live Lolalytics responses
- A timeout or parse failure in one source can still return partial results for other roles
- Look at the `Partial scrape failures` block in the UI for the failing role-specific request

### The browser close button is unavailable

Use `Ctrl+C` in the terminal. The top-right close button depends on a successful `/app-config` load and a local shutdown token.

## Current Limitations

- The app depends on live Lolalytics response formats and may break if their markup or `q-data.json` payload changes
- Runtime settings such as patch window, queue, region, and request thresholds are hard-coded in `server.js`
- There is no persistence, authentication, or hosted deployment flow
