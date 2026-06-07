# PickBan Prototype

PickBan Prototype is a local Node/Express web app for live draft assistance workflows:

- draft pick recommendations for every unassigned allied role
- full-draft win-rate projection once all five allied roles are assigned
- enemy-aware build recommendations for an assigned ally role
- League Client rune-page import from displayed rune recommendations during pick/ban
- opt-in League Client pick/ban import on Windows for Normal Draft and Ranked queues

It runs as one local process, serves plain browser JavaScript from `public/`, and has no build step, database, auth, or hosted deployment flow.

The app header credits Lolalytics and shows the current last-7-days data window plus lifetime live-hit count. The Riot Games non-endorsement/trademark notice is kept as an unframed footnote at the bottom of the app.

## Quick Start

Requirements:

- Node.js 18 or newer
- npm
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
- `PICKBAN_DISABLE_AUTO_UPDATE=1` or `PICKBAN_AUTO_UPDATE=0`: skip the startup update check
- `PICKBAN_AUTO_UPDATE_REMOTE` and `PICKBAN_AUTO_UPDATE_BRANCH`: override the checked git remote and branch; defaults are `origin` and `main`
- `PICKBAN_AUTO_UPDATE_ZIP_URL`: override the no-git release zip URL; defaults to `https://github.com/RadixSort/pickban-prototype/archive/refs/heads/main.zip`
- `LOLALYTICS_BASE_URL`: override the rendered Lolalytics page origin
- `LOLALYTICS_MEGA_URL`: override the mega endpoint origin
- `PICKBAN_RIOT_LOCKFILE_PATH`, `LEAGUE_CLIENT_LOCKFILE_PATH`, or `RIOT_LOCKFILE_PATH`: override the League Client lockfile path for auto import and rune import

There is no build, lint, or bundling command in this repo.

Startup auto-update:

- `npm start` runs `start.js`, which checks `origin/main` before loading `server.js`
- if the local package version differs from `origin/main`, the current branch is `main`, and the working tree is clean, the app fast-forwards to the fetched commit before starting
- if Git is unavailable and the app is not running from a git worktree, startup downloads the `main.zip` release archive, extracts it automatically, and copies its files over the current app folder before starting
- if `package.json` or `package-lock.json` changed during the update, startup runs `npm install --no-audit --no-fund`
- local branches, dirty worktrees, fetch failures, and non-fast-forward states skip auto-update and start the current checkout

## Local Workflow

1. Start the server with `npm start`.
2. Open the app in a browser and build a draft with allied and enemy champions. The same champion cannot appear on both sides.
3. Optionally assign known ally roles. The app will fetch every remaining role.
4. Use `Fetch Suggestions` for role recommendations.
5. When all five allies have unique roles, the main action changes to `Who will win?` and fetches the full-draft outlook instead of open-role suggestions.
6. Use `Build` on an ally row after that ally has a role and all five enemies are selected. It opens enemy-aware build suggestions. During League pick/ban, use `Import Runes` on a displayed rune page to overwrite the first editable saved League rune page as `import - {Champion}`.
7. On Windows, click `Auto Import` during a League pick/ban phase to import visible picks from Normal Draft or Ranked champ select.

Change feedback loops:

- frontend changes in `public/` usually need a browser refresh
- `server.js` and `lib/` changes require restarting `npm start`
- static assets are served with `Cache-Control: no-store`, so a normal refresh is usually enough after frontend edits

## Repo Map

Entry points:

- `start.js`: `npm start` bootstrap that runs the clean-main auto-update check before loading the server
- `server.js`: Express startup, `GET /app-config`, `GET /live-draft`, `POST /rune-import`, `POST /suggest`, `POST /draft-outlook`, `POST /build-suggestions`, `POST /shutdown`, Lolalytics fetch/caching, request validation, and shutdown handling
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
- `lib/lolalytics-tier-list.js`: normalizes Lolalytics tier data into role eligibility data
- `lib/role-suggestion-results.js`: merges ally/enemy rows into ranked role suggestions
- `lib/lolalytics-build-parser.js`: normalizes Lolalytics build payloads into the build modal shape
- `lib/build-suggestion-results.js`: aggregates matchup-specific build data across selected enemies into one summary payload
- `lib/riot-live-draft.js`: reads the local League Client lockfile, normalizes visible champ-select picks, and rewrites the first editable saved rune page for rune import
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
   - role tier data from the Lolalytics mega endpoint
   - ally synergy data
   - enemy counter data from the Lolalytics mega endpoint
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

1. The UI enables `Build` only when an ally role is assigned and all five enemy champions are selected.
2. `POST /build-suggestions` fetches one Lolalytics mega rune payload and matching rendered matchup build page per enemy, then treats the successful enemy matchups as the selected enemy-composition sample.
3. `lib/lolalytics-build-parser.js` normalizes Lolalytics data, and `lib/build-suggestion-results.js` sums games and wins across the matchup records into most-picked and highest-win rune, spell, item, and boot recommendations.
4. The route only returns success when runes, summoner spells, boots, and both five-item build paths can populate the popup.
5. The browser renders `Import Runes` for each displayed rune page. `POST /rune-import` accepts one complete page recommendation, verifies the League Client is in champ select, then overwrites the first editable saved rune page with the recommended selections and the name `import - {Champion}`.

### Auto Import

`GET /live-draft` supports the `Auto Import` button. It reads the Windows League Client lockfile, checks local gameflow/champ-select state, and only returns active data for Normal Draft (`400`), Ranked Solo/Duo (`420`), or Ranked Flex (`440`).

`POST /rune-import` uses the same lockfile credentials for build-modal rune imports. It requires an active League champ-select phase, reads `/lol-perks/v1/pages`, chooses the first editable saved page by page order, and updates it through `/lol-perks/v1/pages/{id}` only when that page does not already match the requested import. Default Riot rune pages are skipped because they are not editable.

If no live champ-select data is found, the connection drops, or the queue is unsupported, the UI shows the disabled banner and leaves current selections unchanged. While active, repeated polls preserve manual edits until the League Client exposes a changed live draft signature.

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
- all five enemy champions are selected
- the app is not already loading role suggestions or shutting down

It opens one enemy-aware build recommendation by aggregating the selected ally's five Lolalytics matchups.

### `Import Runes` fails

Rune import only works while the League Client is in pick/ban and at least one editable saved rune page exists. It overwrites the first editable saved page and skips default Riot rune pages.

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
- Riot registration summary: [`docs/RIOT_APPLICATION_SUMMARY.md`](docs/RIOT_APPLICATION_SUMMARY.md)

## Current Limitations

- live role and draft behavior depends on Lolalytics mega tier, synergy, and counter payloads staying structurally compatible
- enemy-aware build recommendations depend on Lolalytics matchup rune payloads and rendered matchup build-page sections staying structurally compatible
- auto import depends on Riot's local League Client API and the Windows League Client lockfile staying compatible
- rune import depends on Riot's local League Client `/lol-perks/v1/pages` API staying compatible
- runtime settings such as patch window, queue, region, request timeout, and eligibility thresholds are hard-coded in `server.js`; the UI displays the current Lolalytics patch window as a last-7-days lookback
- the supported runtime overrides are `PORT`, the startup auto-update vars, `LOLALYTICS_BASE_URL`, `LOLALYTICS_MEGA_URL`, and the League Client lockfile path vars listed above
- there is no persistence, auth, or deployment story in this repository

## License

This repository is open source under the [MIT License](LICENSE).

The MIT license applies only to the original code in this repository. It does not grant rights to third-party names, trademarks, data, or media, including Riot Games and League of Legends marks or any Lolalytics data, site content, or icon URLs referenced by the app.

This project is independent and is not affiliated with or endorsed by Riot Games or Lolalytics.
