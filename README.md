# PickBan Prototype

PickBan Prototype is a local Node/Express web app for two live Lolalytics-backed workflows:

- draft pick recommendations for every unassigned allied role
- matchup-specific rune and boots suggestions for an assigned ally role

It runs as one local process, serves plain browser JavaScript from `public/`, and has no build step, database, auth, or hosted deployment flow.

## Quick Start

Requirements:

- Node.js 18 or newer
- internet access while fetching live data
- a modern browser

Install and run:

```bash
npm install
npm start
```

Open `http://localhost:3000`.

Run the test suite:

```bash
npm test
```

Useful variants:

```bash
PORT=3001 npm start
npm run bench:efficiency
```

Advanced runtime overrides:

- `LOLALYTICS_BASE_URL`: override the main Lolalytics origin
- `LOLALYTICS_MEGA_URL`: override the mega endpoint origin

There is no build, lint, or bundling command in this repo.

## Local Workflow

1. Start the server with `npm start`.
2. Open the app in a browser and build a draft with allied and enemy champions. The same champion cannot appear on both sides.
3. Optionally assign known ally roles. The app will fetch every remaining role.
4. Use `Fetch Suggestions` for role recommendations.
5. Use `Runes & Boots` on an ally row after that ally has a role and at least one enemy is selected.

Change feedback loops:

- frontend changes in `public/` usually need a browser refresh
- `server.js` and `lib/` changes require restarting `npm start`
- static assets are served with `Cache-Control: no-store`, so a normal refresh is usually enough after frontend edits

## Repo Map

Entry points:

- `server.js`: Express startup, `GET /app-config`, `POST /suggest`, `POST /build-suggestions`, `POST /shutdown`, Lolalytics fetch/caching, request validation, and shutdown handling
- `public/index.html`: browser entry point
- `public/app.js`: frontend controller, draft state, fetch flows, modal state, and rendering

Core module groups:

- `public/*.js`: browser-loaded helper modules that are also reusable from Node via `require(...)`
- `lib/*.js`: Node-only request normalization, parsing, aggregation, and scoring helpers
- `test/*.test.js`: Node test suite for shared helpers, parsers, rendering helpers, and server HTTP/startup coverage
- `bench/efficiency.js`: synthetic benchmark for aggregation and top-result selection

High-value files when you are new to the codebase:

- `lib/request-normalization.js`: validates and normalizes `/suggest` and `/build-suggestions` payloads
- `lib/requested-target-roles.js`: resolves explicit roles or infers unassigned roles from ally assignments
- `lib/server-route-helpers.js`: shared request normalization and response shaping for the Express routes
- `lib/lolalytics-tier-list.js`: parses tier-list HTML into role eligibility data
- `lib/role-suggestion-results.js`: merges ally/enemy rows into ranked role suggestions
- `lib/lolalytics-build-parser.js`: normalizes Lolalytics matchup `q-data.json` payloads into rune/boots data
- `lib/build-suggestion-results.js`: aggregates matchup build data across enemies into one summary payload
- `public/result-ranking.js`: shared ranking and top-N helpers
- `public/suggestion-cache.js` and `public/build-suggestion-cache.js`: frontend cache keys
- `public/build-suggestion-view.js`: HTML rendering for the runes/boots modal

## Architecture Overview

The app has three code layers:

1. `server.js` is the only HTTP entry point. It serves the static UI and exposes the local API routes.
2. `public/` contains the browser shell plus small shared modules that both the browser and Node can import.
3. `lib/` contains the Node-only logic for normalization, parsing, and result aggregation.

The two main request flows are:

### Role Suggestions

1. `public/app.js` collects `rankFilter`, `allies`, and `enemies`.
2. `POST /suggest` uses `lib/server-route-helpers.js` to normalize the request and resolve target roles.
3. For each requested role, the server fetches:
   - role tier-list HTML
   - ally synergy data
   - enemy counter data
4. `lib/role-suggestion-results.js` filters out in-draft champions, applies tier-list eligibility, computes scores, and sorts the results.
5. The response returns `roles`, `resultsByRole`, `metaByRole`, and `requestStats`.

### Matchup Runes & Boots

1. The UI enables `Runes & Boots` only when an ally role is assigned and at least one enemy exists.
2. `POST /build-suggestions` validates the ally-role request.
3. The server fetches Lolalytics matchup build payloads for each enemy.
4. `lib/lolalytics-build-parser.js` normalizes those payloads.
5. `lib/build-suggestion-results.js` merges the matchup data into one rune-and-boots summary.

Important implementation detail: several modules in `public/` are intentionally shared with Node. If logic must stay consistent between browser state and server/test code, check `public/` before adding a new duplicate helper in `lib/`.

## Practical API Checks

Sanity-check role suggestions:

```bash
curl -s http://localhost:3000/suggest \
  -H 'content-type: application/json' \
  -d '{
    "rankFilter": "emerald_plus",
    "allies": [
      { "champion": "Ahri", "role": "middle" },
      { "champion": "Jarvan IV" }
    ],
    "enemies": ["Jinx", "Nautilus"]
  }'
```

Sanity-check matchup runes and boots:

```bash
curl -s http://localhost:3000/build-suggestions \
  -H 'content-type: application/json' \
  -d '{
    "rankFilter": "emerald_plus",
    "ally": { "champion": "Ahri", "role": "middle" },
    "enemies": ["Zed", "Sejuani"]
  }'
```

## Troubleshooting

### `npm start` fails immediately

Run `node -v`. This repo expects Node 18+ because it uses built-in `fetch` and `node:test`.

### `http://localhost:3000` does not load

- confirm `npm start` is still running
- confirm the port matches the one you started with
- if port `3000` is busy, start with `PORT=3001 npm start`

### Frontend changes are not showing up

- refresh the browser after editing files in `public/`
- restart the server after editing `server.js` or files imported by the server

### Role results are missing or only some roles load

- the backend uses live Lolalytics responses, so timeouts and upstream parse changes can fail by role
- partial role failures are surfaced in the UI and in `metaByRole[role].partialFailures`
- if every requested role fails, `/suggest` returns an HTTP error

### The `Runes & Boots` button is disabled

The current UI only enables that flow when:

- the ally has an assigned role
- at least one enemy champion is selected
- the app is not already loading role suggestions or shutting down

### Requests fail immediately before any live fetches

The server rejects invalid local input first. Common causes are:

- the same champion was selected on both allied and enemy sides
- a role alias could not be normalized
- the request exceeded the ally or enemy limits

### The top-right close button is missing

The button is only shown after `GET /app-config` succeeds and the browser receives the per-process shutdown token. `Ctrl+C` in the terminal always remains the fallback.

## Related Docs

- developer architecture: [`docs/TECHNICAL_OVERVIEW.md`](docs/TECHNICAL_OVERVIEW.md)
- non-technical setup and usage: [`docs/NON_TECHNICAL_GUIDE.md`](docs/NON_TECHNICAL_GUIDE.md)

## Current Limitations

- live behavior depends on Lolalytics HTML and `q-data.json` staying structurally compatible
- runtime settings such as patch window, queue, region, request timeout, and eligibility thresholds are hard-coded in `server.js`
- the only supported runtime overrides are `PORT`, `LOLALYTICS_BASE_URL`, and `LOLALYTICS_MEGA_URL`
- there is no persistence, auth, or deployment story in this repository

## License

This repository is open source under the [MIT License](LICENSE).

The MIT license applies only to the original code in this repository. It does not grant rights to third-party names, trademarks, data, or media, including Riot Games and League of Legends marks or any Lolalytics data, site content, or icon URLs referenced by the app.

This project is independent and is not affiliated with or endorsed by Riot Games or Lolalytics.
