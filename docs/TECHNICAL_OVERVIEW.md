# Technical Summary

This document is the developer-facing map of the app runtime, module boundaries, request flows, and external assumptions.

## Runtime

- Node.js 18+
- Express 5
- plain HTML, CSS, and browser JavaScript
- built-in `fetch`
- built-in `node:test`

Only one npm dependency is installed: `express`.

There is no bundler, database, auth layer, server-side rendering, hosted backend, or deployment config in this repository.

## Commands

- `npm install`: install dependencies
- `npm start`: run `start.js`, then start the local server
- `npm test`: run the Node test suite
- `npm run bench:efficiency`: run the aggregation benchmark

Useful runtime overrides:

- `PORT`: local listen port; default is `3000`
- `PICKBAN_DISABLE_AUTO_UPDATE=1` or `PICKBAN_AUTO_UPDATE=0`: skip the startup update check
- `PICKBAN_AUTO_UPDATE_REMOTE` and `PICKBAN_AUTO_UPDATE_BRANCH`: startup update target; defaults are `origin` and `main`
- `PICKBAN_AUTO_UPDATE_ZIP_URL`: no-git update zip URL; default is the GitHub `main.zip`
- `LOLALYTICS_BASE_URL`: rendered Lolalytics page origin
- `LOLALYTICS_MEGA_URL`: Lolalytics mega endpoint origin
- `PICKBAN_RIOT_LOCKFILE_PATH`, `LEAGUE_CLIENT_LOCKFILE_PATH`, or `RIOT_LOCKFILE_PATH`: League Client lockfile override

## Entry Points

- `start.js`: startup bootstrap used by `npm start`
- `server.js`: Express process, HTTP routes, live fetches, caching, validation glue, and graceful shutdown
- `public/index.html`: browser entry point
- `public/app.js`: frontend state, draft editing, fetch flows, modal state, and rendering

The app runs as one local process and serves static browser files from `public/`.

## Module Boundaries

- `public/*.js`: browser-loaded helpers; several are also imported by Node tests and server code with `require(...)`
- `lib/*.js`: Node-only request normalization, League Client access, parsing, aggregation, and scoring helpers
- `test/*.test.js`: Node test coverage for shared helpers, parsers, route contracts, startup, and League Client behavior
- `bench/efficiency.js`: synthetic aggregation benchmark

Important shared-rule modules:

- `public/roles.js`: role labels, aliases, and unassigned-role calculation
- `public/rank-filters.js`: rank filter normalization and Lolalytics tier query values
- `public/result-ranking.js`: result ranking and top-result helpers
- `public/suggestion-cache.js` and `public/build-suggestion-cache.js`: frontend cache keys
- `lib/request-normalization.js`: request validation and champion normalization
- `lib/requested-target-roles.js`: explicit or inferred target-role resolution
- `lib/server-route-helpers.js`: shared request normalization and response shaping

## HTTP Surface

- `GET /app-config`: package version, visible Lolalytics lookback window, shutdown token, and request stats
- `GET /ally-role-likelihoods`: role-likelihood data used by the role-assignment UI
- `GET /live-draft`: opt-in local League Client champ-select import
- `POST /rune-import`: local League Client rune-page import
- `POST /suggest`: first-pick or draft-aware role suggestions
- `POST /draft-outlook`: full allied draft projection
- `POST /build-suggestions`: enemy-composition build recommendations
- `POST /shutdown`: loopback-only graceful shutdown with per-process token

Static assets are served with `Cache-Control: no-store`.

## Request Flows

### Role Suggestions

`POST /suggest` accepts a rank filter, allies, enemies, and optional target roles.

Validation:

- allies and enemies must be arrays when present
- ally entries can be champion strings or objects with `champion`/`name` and optional `role`/`lane`
- enemy entries must be non-empty champion strings
- champions must exist in `public/champions.json`
- duplicate champions in the same list are ignored
- the same champion cannot appear on both teams
- maximum 5 unique allies and 5 unique enemies
- duplicate ally role assignments are rejected
- explicit target roles cannot overlap assigned ally roles

With no selected champions, `/suggest` returns first-pick tier-list rows by role. With a draft state, it fetches Lolalytics tier data first, then fetches ally-synergy and `vslane`-scoped enemy-counter data only for target roles with usable tier rows.

Response shape includes `roles`, `resultsByRole`, `metaByRole`, `requestStats`, and legacy `results`/`meta` fields when exactly one role was requested.

### Draft Outlook

`POST /draft-outlook` requires exactly five allied champions with unique assigned roles. It accepts 0 to 5 enemies.

The server fetches allied synergy rows and enemy counter rows, then `lib/draft-projection.js` aggregates them into one team projection. If no usable win-rate samples are available, the route returns an error instead of a misleading projection.

Response shape includes `request`, `summary`, `projection`, and `requestStats`.

### Build Recommendations

`POST /build-suggestions` requires one ally with an assigned role and exactly five enemies.

For each enemy, the server fetches one Lolalytics mega rune payload and one rendered matchup build page. `lib/lolalytics-build-parser.js` parses the sources, and `lib/build-suggestion-results.js` aggregates successful matchup records into runes, summoner spells, starting items, five-item paths, and boots.

The route only succeeds when runes, summoner spells, boots, and both five-item paths can populate the modal. Starting items render when available but are not required for success.

Response shape includes `request`, `summary`, `runes`, `spells`, `startingItems`, `items`, and `boots`.

### Rune Import

`POST /rune-import` validates a complete rune recommendation, reads the local League Client lockfile, confirms the gameflow phase is `ChampSelect`, reads `/lol-perks/v1/pages`, and updates the first editable saved rune page by page order.

The route never creates or deletes rune pages. It skips default Riot pages, preserves repeated stat modifier IDs, and reports success without writing when the target page already matches the requested import.

### Live Draft Import

`GET /live-draft` is used only after the user clicks **Auto Import**.

`lib/riot-live-draft.js` reads the local League Client lockfile, authenticates to the local client, checks `/lol-gameflow/v1/session`, and reads `/lol-champ-select/v1/session` only for supported champ-select queues:

- Normal Draft (`400`)
- Ranked Solo/Duo (`420`)
- Ranked Flex (`440`)

The payload includes visible allied picks with roles, pending allied pick hovers as temporary allies, visible enemy picks, the local player's assigned role, and queue metadata. Expected unavailable states return a disabled payload without changing the browser's current draft.

## Scoring And Ranking

Role suggestions are computed per target role.

Candidate filters:

- remove champions already present in the draft
- require role eligibility from live tier-list data
- require `lanePercent >= 10`
- require `pickRate >= 0.5`

Scores:

- `synergyScore = average(ally matchup values)`
- `counterScore = average(enemy matchup values * -1)`
- `projectedWinRate = average(ally matchup win rates + (100 - enemy matchup win rates))`
- `projectedAgency = 0.5 * synergyScore + 0.5 * counterScore`
- first-pick `pbi = (winRate - avgWr) * 100 * pickRate / (100 - banRate)`, rounded to the nearest integer

Backend role-result sort order:

1. higher `projectedWinRate`
2. higher `projectedAgency`
3. higher `counterScore`
4. alphabetical candidate name

Low projected win-rate rows stay visible; the UI highlights weak rows instead of filtering them out.

## Caching And Failure Handling

Backend caches:

- Lolalytics resource cache: full URL key, 5-minute TTL
- normalized matchup build cache: ally, role, enemy, rank filter, patch key, 5-minute TTL
- aggregated build cache: rank filter, ally, role, enemies key, 5-minute TTL
- aggregated draft-projection cache: rank filter, allies, roles, enemies key, 5-minute TTL
- resolved Qwik payload caches: `WeakMap`s tied to payload object lifetime

Frontend caches:

- role suggestions: current browser session
- build suggestions: current browser session
- draft outlooks: current browser session
- live-draft and rune-import calls: never cached

Remote requests time out after 15 seconds. Role, draft, and build fetches preserve partial failures when enough data remains to build a useful result. Routes fail closed when every role fails, a draft projection has no usable win-rate samples, or a build payload cannot populate the required modal sections.

## Startup Update

`npm start` runs `start.js`, which calls `lib/startup-auto-update.js` before loading `server.js`.

The git update path only updates when:

- auto-update is enabled
- the current branch matches the configured branch
- the working tree is clean
- the local package version differs from the fetched remote package version
- the fetched commit can fast-forward

When the app is not running from a git worktree, startup can download the configured GitHub release zip and copy it over the app folder. If `package.json` or `package-lock.json` changes during update, startup runs `npm install --no-audit --no-fund`.

Release commits must bump both `package.json` and `package-lock.json` because both update paths compare package versions before replacing local files.

## External Assumptions

- Lolalytics mega tier, synergy, counter, and rune payloads must keep exposing the parsed fields; counter requests must keep honoring `vslane` for target-role-specific matchups.
- Lolalytics rendered matchup build pages must keep recognizable spell, starting item, core item, and boot sections.
- The League Client lockfile must be readable while the Windows client is running.
- Local League Client gameflow, champ-select, and perks endpoints must remain compatible.
- The UI must keep a visible Riot non-endorsement/trademark footnote while it references Riot or League-related names, assets, or local client data.
- Patch window, queue, region, request timeout, and role-eligibility thresholds are currently hard-coded in `server.js`.

If live data suddenly stops returning without a local code change, start with these assumptions.

## Manual API Checks

Run these while `npm start` is running.

Role suggestions:

```bash
curl -s http://localhost:3000/suggest \
  -H 'content-type: application/json' \
  -d '{"rankFilter":"emerald_plus","allies":[{"champion":"Ahri","role":"middle"},{"champion":"Jarvan IV"}],"enemies":["Jinx","Nautilus"]}'
```

Build recommendations:

```bash
curl -s http://localhost:3000/build-suggestions \
  -H 'content-type: application/json' \
  -d '{"rankFilter":"emerald_plus","ally":{"champion":"Ahri","role":"middle"},"enemies":["Zed","Sejuani","Ashe","Neeko","Sion"]}'
```

Draft outlook:

```bash
curl -s http://localhost:3000/draft-outlook \
  -H 'content-type: application/json' \
  -d '{"rankFilter":"emerald_plus","allies":[{"champion":"Darius","role":"top"},{"champion":"Jarvan IV","role":"jungle"},{"champion":"Ahri","role":"middle"},{"champion":"Miss Fortune","role":"bottom"},{"champion":"Leona","role":"support"}],"enemies":["Jinx","Lux"]}'
```

## Testing

- `npm test` runs the full suite.
- Most tests cover pure helpers or renderers and do not depend on live network access.
- `test/server-api.test.js` mocks Lolalytics origins for route-contract coverage.
- `test/server-http.test.js` covers local HTTP behavior, including app config, shutdown, live draft, and rune import cases.
- `test/riot-live-draft.test.js` and `test/riot-rune-import.test.js` cover local League Client normalization and rune-page mutation shaping.
- `test/lolalytics-build-parser.test.js` and `test/build-suggestion-results.test.js` cover build parsing and aggregation regressions.
- `npm run bench:efficiency` is useful after changing aggregation or ranking behavior.
