# PickBan Prototype

PickBan Prototype is a local Node/Express web app for three live Lolalytics-backed workflows:

- draft pick recommendations for every unassigned allied role
- full-draft win-rate projection once all five allied roles are assigned
- matchup-specific build recommendations for an assigned ally role, including runes, item paths, and boots

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

Supported runtime overrides:

- `PORT`: override the local listen port
- `LOLALYTICS_BASE_URL`: override the main Lolalytics origin
- `LOLALYTICS_MEGA_URL`: override the mega endpoint origin

There is no build, lint, or bundling command in this repo.

## Local Workflow

1. Start the server with `npm start`.
2. Open the app in a browser and build a draft with allied and enemy champions. The same champion cannot appear on both sides.
3. Optionally assign known ally roles. The app will fetch every remaining role.
4. Use `Fetch Suggestions` for role recommendations.
5. When all five allies have unique roles, the main action changes to `Who will win?` and fetches the full-draft outlook instead of open-role suggestions.
6. Use `Build` on an ally row after that ally has a role. With enemies selected it opens matchup build suggestions; without enemies it opens generic champion build recommendations in the same popup.

Change feedback loops:

- frontend changes in `public/` usually need a browser refresh
- `server.js` and `lib/` changes require restarting `npm start`
- static assets are served with `Cache-Control: no-store`, so a normal refresh is usually enough after frontend edits

## Repo Map

Entry points:

- `server.js`: Express startup, `GET /app-config`, `POST /suggest`, `POST /draft-outlook`, `POST /build-suggestions`, `POST /shutdown`, Lolalytics fetch/caching, request validation, and shutdown handling
- `public/index.html`: browser entry point
- `public/app.js`: frontend controller, draft state, fetch flows, modal state, and rendering

Core module groups:

- `public/*.js`: browser-loaded helper modules that are also reusable from Node via `require(...)`
- `lib/*.js`: Node-only request normalization, parsing, aggregation, and scoring helpers
- `test/*.test.js`: Node test suite for shared helpers, parsers, rendering helpers, and server HTTP/startup coverage
- `bench/efficiency.js`: synthetic benchmark for aggregation and top-result selection

High-value files when you are new to the codebase:

- `lib/request-normalization.js`: validates and normalizes `/suggest`, `/draft-outlook`, and `/build-suggestions` payloads
- `lib/requested-target-roles.js`: resolves explicit roles or infers unassigned roles from ally assignments
- `lib/server-route-helpers.js`: shared request normalization and response shaping for the Express routes
- `lib/draft-projection.js`: aggregates full-team ally synergy and enemy counter rows into one projected matchup summary
- `lib/lolalytics-tier-list.js`: parses tier-list HTML into role eligibility data
- `lib/role-suggestion-results.js`: merges ally/enemy rows into ranked role suggestions
- `lib/lolalytics-build-parser.js`: normalizes Lolalytics matchup `q-data.json` payloads into rune, item, and boots data
- `lib/build-suggestion-results.js`: aggregates matchup build data across enemies into one summary payload
- `public/result-ranking.js`: shared ranking and top-N helpers
- `public/suggestion-cache.js` and `public/build-suggestion-cache.js`: frontend cache keys
- `public/build-suggestion-view.js`: HTML rendering for the build recommendation modal

## Architecture Overview

The app has three code layers:

1. `server.js` is the only HTTP entry point. It serves the static UI and exposes the local API routes.
2. `public/` contains the browser shell plus small shared modules that both the browser and Node can import.
3. `lib/` contains the Node-only logic for normalization, parsing, and result aggregation.

The three main request flows are:

### Role Suggestions

1. `public/app.js` collects `rankFilter`, `allies`, and `enemies`.
2. `POST /suggest` uses `lib/server-route-helpers.js` to normalize the request and resolve target roles.
3. For each requested role, the server fetches:
   - role tier-list HTML
   - ally synergy data
   - enemy counter data
4. `lib/role-suggestion-results.js` filters out in-draft champions, applies tier-list eligibility, computes scores, and sorts the results.
5. The response returns `roles`, `resultsByRole`, `metaByRole`, and `requestStats`.

### Draft Outlook

1. When all five allied champions are selected and every ally has a unique role, the main action switches to `Who will win?`.
2. `POST /draft-outlook` validates the five-ally full-draft request.
3. The server fetches:
   - ally synergy rows across the full allied lineup
   - enemy counter rows for each ally-role matchup
4. `lib/draft-projection.js` combines those rows into one team-vs-team projection.
5. If Lolalytics returns no usable win-rate samples, the route fails closed instead of returning a misleading 0%-vs-100% projection.
6. The response returns `request`, `summary`, `projection`, and `requestStats`.

### Build Recommendations

1. The UI enables `Build` when an ally role is assigned.
2. If enemies are selected, `POST /build-suggestions` fetches one Lolalytics matchup build payload per enemy.
3. If no enemies are selected, the same route fetches the generic champion build payload for the assigned ally role.
4. `lib/lolalytics-build-parser.js` normalizes those payloads.
5. `lib/build-suggestion-results.js` merges the data into one summary that includes runes, ordered item paths, and completed boots.

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

Sanity-check build recommendations:

```bash
curl -s http://localhost:3000/build-suggestions \
  -H 'content-type: application/json' \
  -d '{
    "rankFilter": "emerald_plus",
    "ally": { "champion": "Ahri", "role": "middle" },
    "enemies": ["Zed", "Sejuani"]
  }'
```

Sanity-check full-draft projection:

```bash
curl -s http://localhost:3000/draft-outlook \
  -H 'content-type: application/json' \
  -d '{
    "rankFilter": "emerald_plus",
    "allies": [
      { "champion": "Darius", "role": "top" },
      { "champion": "Jarvan IV", "role": "jungle" },
      { "champion": "Ahri", "role": "middle" },
      { "champion": "Miss Fortune", "role": "bottom" },
      { "champion": "Leona", "role": "support" }
    ],
    "enemies": ["Jinx", "Lux"]
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

### The main button says `Who will win?`

That means all five allied champions are selected and all five allied roles are assigned. Clear one role or remove one ally if you want to go back to role suggestions.

### The `Build` button is disabled

The current UI only enables that flow when:

- the ally has an assigned role
- the app is not already loading role suggestions or shutting down

With enemies selected it opens matchup build suggestions. Without enemies it opens generic champion build recommendations in the same popup.

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
