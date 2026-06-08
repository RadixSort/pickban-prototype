# Technical Overview

This document is the developer-facing map of the runtime: where requests enter, which modules own which responsibilities, and which external assumptions can break the app.

## Stack

- Node.js 18+
- Express 5
- plain HTML, CSS, and browser JavaScript
- built-in `fetch`
- built-in `node:test`

Only one npm dependency is installed: `express`.

There is no bundler, database, auth layer, server-side rendering, or deployment config in this repository.

## Start Here

If you are onboarding to the codebase, read these files in order:

- `server.js`: the full HTTP surface plus live fetch/caching behavior
- `public/app.js`: the browser controller and UI-state transitions
- `lib/request-normalization.js`: request validation rules
- `lib/riot-live-draft.js`: Windows League Client lockfile access and champ-select normalization
- `lib/server-route-helpers.js`: public response shaping
- `test/server-api.test.js`: route contracts with mocked Lolalytics responses

## Entry Points And Commands

Runtime entry points:

- `start.js`: startup bootstrap used by `npm start`; runs the git auto-update check before loading `server.js`
- `server.js`: starts the Express process and owns every HTTP route
- `public/index.html`: browser entry point
- `public/app.js`: frontend state and controller logic

Commands:

- `npm start`: run the startup bootstrap and local server
- `npm test`: run the Node test suite
- `npm run bench:efficiency`: run the aggregation benchmark

## Module Boundaries

The most important architecture detail is the split between `public/` and `lib/`:

- `public/` contains the browser shell plus small helper modules that are loaded directly in the browser and can also be imported from Node with `require(...)`
- `lib/` contains Node-only logic for validation, parsing, aggregation, and scoring

That means shared business rules often live in `public/`, not `lib/`.

### Server And Shared Modules

- `server.js`
  - static file serving
  - `GET /app-config`
  - `POST /suggest`
  - `POST /draft-outlook`
  - `POST /build-suggestions`
  - `GET /live-draft`
  - `POST /rune-import`
  - `POST /shutdown`
  - Lolalytics fetch/caching helpers
  - app version and Lolalytics lookback metadata for the visible header
  - graceful shutdown

- `lib/startup-auto-update.js`
  - clean-main startup update policy
  - `origin/main` package-version comparison
  - fast-forward-only git update path
  - no-git GitHub release zip download, extraction, file sync, and dependency install orchestration

- `public/app.js`
  - draft state
  - champion search and selection
  - ally role assignment
  - role-results rendering
  - draft projection fetch and rendering
  - build recommendation modal flow
  - build-modal rune import state and League Client import requests

- `public/roles.js`
  - role aliases
  - role labels
  - unassigned-role calculation

- `public/rank-filters.js`
  - rank filter normalization
  - Lolalytics tier query values

- `public/result-ranking.js`
  - role result sorting
  - projected win-rate and agency comparators
  - top-result key selection used by ranking helpers

- `public/suggestion-filters.js`
  - remove champions already in the draft
  - keep low projected win-rate rows visible

- `public/suggestion-cache.js`
  - frontend role-result cache key

- `public/build-suggestion-cache.js`
  - frontend build-recommendation cache key

- `public/build-suggestion-view.js`
  - summary HTML for build-modal recommendation sections
  - per-rune-page import controls rendered with stable page keys

- `public/rune-metadata.js`
  - local rune style and icon metadata used by the build parser and modal renderer

### Node-Only Modules

- `lib/request-normalization.js`
  - champion normalization
  - ally/enemy request validation
  - draft-projection request validation
  - build-suggestion request validation

- `lib/requested-target-roles.js`
  - explicit role normalization for API callers
  - implicit unassigned-role resolution for the current UI

- `lib/server-route-helpers.js`
  - shared `/suggest` request normalization
  - shared role-response shaping
  - build-suggestion payload assembly helpers

- `lib/lolalytics-tier-list.js`
  - normalize tier rows from Lolalytics mega JSON and older page HTML shapes
  - map parsed rows back to local champion metadata
  - enforce role eligibility thresholds
  - calculate PBI from Lolalytics tier fields when the average tier win rate and ban rate are present

- `lib/first-pick-results.js`
  - build empty-draft first-pick results from tier-list eligibility maps
  - return PBI and win-rate rows without matchup scoring

- `lib/role-suggestion-results.js`
  - merge ally synergy rows and enemy counter rows
  - keep partial failures
  - return sorted role suggestions

- `lib/candidate-score-accumulator.js`
  - running totals for synergy, counter, and projected win rate

- `lib/matchup-orientation.js`
  - flip enemy-facing matchup win rates back to the candidate pick perspective

- `lib/lolalytics-build-parser.js`
  - normalize current Lolalytics mega rune payloads into build-modal rune data
  - parse rendered Lolalytics build pages for visible summoner spells, core items, and completed boots

- `lib/build-suggestion-results.js`
  - aggregate matchup-specific build records across selected enemies into one summary payload

- `lib/draft-projection.js`
  - aggregate full-draft ally synergy and enemy counter matchups
  - reject projections that have no usable win-rate samples

- `lib/riot-live-draft.js`
  - find and parse the local League Client lockfile
  - read League Client champ-select and gameflow state from localhost
  - allow only Normal Draft (`400`), Ranked Solo/Duo (`420`), and Ranked Flex (`440`)
  - normalize visible champion IDs and assigned positions into local champion/role metadata
  - validate complete rune recommendations and update the first editable saved League rune page

## Request Flows

## `POST /suggest`

Used by the main draft recommendation flow.

Minimal request example:

```json
{
  "rankFilter": "emerald_plus",
  "allies": [
    { "champion": "Ahri", "role": "middle" },
    { "champion": "Jarvan IV" }
  ],
  "enemies": ["Jinx", "Nautilus"]
}
```

Flow:

1. `normalizeSuggestRequest(...)` composes the shared request-validation path for `/suggest`.
2. `normalizeRequestedRankFilter(...)` resolves the rank filter or falls back to the server default.
3. `normalizeAllySelections(...)` and `normalizeChampionSelections(...)` validate champions against `public/champions.json`.
4. `validateAllyRoleAssignments(...)` rejects duplicate ally role assignments.
5. `validateNoOpposingChampionSelections(...)` rejects drafts that place the same champion on both sides.
6. `resolveRequestedTargetRoles(...)` either:
   - uses explicit `roles`, `role`, or `targetRole`, or
   - infers every still-unassigned role from the current ally selections
7. If both `allies` and `enemies` are empty, `/suggest` enters first-pick mode:
   - fetches role tier data only
   - computes PBI as `(winRate - avgWr) * 100 * pickRate / (100 - banRate)` rounded to the nearest integer
   - returns `mode: "firstPick"` with per-role rows containing `pbi` and `winRate`
8. Otherwise, for each target role, the server fetches:
   - mega tier data for eligibility and live win rate
   - ally synergy rows
   - enemy counter rows
9. `buildRoleSuggestionResults(...)` aggregates, filters, and sorts the candidates.
10. `buildRoleSuggestionResponse(...)` shapes the final multi-role payload and legacy single-role fields.
11. The response returns:
   - `roles`
   - `resultsByRole`
   - `metaByRole`
   - `requestStats`
   - legacy `results` and `meta` when exactly one role was requested

Current validation rules enforced by code:

- `allies` and `enemies` must be arrays when present
- ally entries can be champion strings or objects with `champion`/`name` and optional `role`/`lane`
- enemy entries must be non-empty champion strings
- champion names must exist in `public/champions.json`
- duplicate champions in the same list are ignored
- the same champion cannot appear on both allied and enemy sides
- maximum 5 unique allies
- maximum 5 unique enemies
- at least one champion must be present overall
- duplicate ally role assignments are rejected
- explicitly requested target roles cannot overlap with already-assigned ally roles

## `POST /draft-outlook`

Used by the full-team projection flow after every allied role is assigned.

Minimal request example:

```json
{
  "rankFilter": "emerald_plus",
  "allies": [
    { "champion": "Darius", "role": "top" },
    { "champion": "Jarvan IV", "role": "jungle" },
    { "champion": "Ahri", "role": "middle" },
    { "champion": "Miss Fortune", "role": "bottom" },
    { "champion": "Leona", "role": "support" }
  ],
  "enemies": ["Jinx", "Lux"]
}
```

Flow:

1. `normalizeDraftProjectionRequest(...)` requires exactly five allied champions with unique assigned roles.
2. The server fetches ally-synergy rows for every ordered allied pairing.
3. The server fetches enemy counter rows for each ally role and each selected enemy champion.
4. `buildDraftProjection(...)` aggregates those rows into one full-draft projection.
5. `buildDraftProjectionPayload(...)` shapes the response into:
   - `request`
   - `summary`
   - `projection`
   - `requestStats`

Important behavioral details:

- the route accepts `0` to `5` enemies, but always requires five allied champions with roles
- the response exposes `summary.projectedWinRateMatchupCount` so callers can distinguish fetched rows from rows that actually contributed win-rate data
- if every fetched row is missing a usable win-rate value, the route returns an HTTP error instead of reporting a misleading `0%` ally win rate
- the frontend only exposes this route when the full allied team is selected and fully assigned

## `POST /build-suggestions`

Used by the build recommendation modal.

Minimal request example:

```json
{
  "rankFilter": "emerald_plus",
  "ally": { "champion": "Ahri", "role": "middle" },
  "enemies": ["Zed", "Sejuani", "Ashe", "Neeko", "Sion"]
}
```

Flow:

1. `normalizeBuildSuggestionRequest(...)` validates one ally, a required ally role, exactly five enemies, and no ally/enemy overlap.
2. The server fetches one Lolalytics mega rune payload and one rendered matchup build page per enemy champion.
3. `parseLolalyticsRuneBuildData(...)` converts each payload into:
   - rune style totals
   - rune slot options
   - exact page candidates
4. `parseLolalyticsRenderedBuildPage(...)` converts the visible build page into:
   - summoner spell set options
   - core item slot options
   - completed boot options
5. The server merges rune data with the rendered-page build sections for each matchup, then `buildBuildSuggestionResults(...)` aggregates the successful records into one enemy-composition summary response.
6. `hasUsableBuildSuggestions(...)` only accepts responses that include most-picked and highest-win runes, summoner spells, both five-item paths, and at least one boot option.
7. The response returns:
   - `request`
   - `summary`
   - `runes`
   - `spells`
   - `items`
   - `boots`

The browser exposes this route from the `Build` button only when the selected ally already has a role and all five enemy slots are filled.

Enemy-aware build recommendations are composition-aware aggregates over matchup-specific build data. They do not use the Lolalytics `counter` endpoint that powers role suggestions and draft outlook. For each selected enemy, the route requests the ally-vs-enemy build/rune sources, keeps successful matchups, records failed enemy matchups in `summary.partialFailures`, and aggregates the successful matchup records into one modal payload.

Rendered-page parsing supports both older combined stat text such as `57.6% Win Rate 48 Games` and the current Qwik split text such as `57.6` / `% Win Rate` / `48 Games` for spells or `57.6` / `%` / `48` for items. Build-route tests use the split shape so upstream display changes cannot silently return rune-only data while the popup categories stay empty.

## `POST /rune-import`

Used by each `Import Runes` button rendered in the build recommendation modal.

Minimal request example:

```json
{
  "champion": "Ahri",
  "page": {
    "primaryStyle": { "styleId": 8000 },
    "secondaryStyle": { "styleId": 8200 },
    "selections": {
      "primary": [{ "id": 8008 }, { "id": 9111 }, { "id": 9103 }, { "id": 8014 }],
      "secondary": [{ "id": 8210 }, { "id": 8236 }],
      "modifiers": [{ "id": 5008 }, { "id": 5008 }, { "id": 5001 }]
    }
  }
}
```

Flow:

1. The route validates the champion against local champion metadata and the rune page as a complete League page: 4 primary runes, 2 secondary runes, 3 stat modifiers, and both rune style IDs.
2. `lib/riot-live-draft.js` reads the League Client lockfile using the same env override order as `GET /live-draft`.
3. It reads `/lol-gameflow/v1/session` and refuses to mutate pages unless the phase is `ChampSelect`.
4. It reads `/lol-perks/v1/pages`, skips non-editable default Riot pages, and chooses the first editable saved page by `order`, then `id`.
5. If the target page does not already match the requested import, it sends `PUT /lol-perks/v1/pages/{id}` with the existing page fields plus:
   - `name: "import - {Champion}"`
   - `primaryStyleId`
   - `subStyleId`
   - `selectedPerkIds`
6. The browser stores import status per displayed rune page key so one failed import does not mark the other recommendation as failed.

Important behavioral details:

- rune import is not cached; every click reads the local page state before deciding whether a write is needed
- stat modifier IDs may repeat across modifier rows and are preserved
- the route returns `409` for expected local unavailability such as no champ-select phase or no editable saved rune page
- it never creates or deletes rune pages
- if the first editable page already has the requested name and rune IDs, the route reports success without sending a `PUT`

## `GET /live-draft`

Used by the opt-in Windows auto-import flow during League of Legends pick/ban.

Flow:

1. `lib/riot-live-draft.js` finds the League Client lockfile. Tests and custom setups can override the path with `PICKBAN_RIOT_LOCKFILE_PATH`, `LEAGUE_CLIENT_LOCKFILE_PATH`, or `RIOT_LOCKFILE_PATH`.
2. The server authenticates to the local League Client API with the lockfile port/password.
3. It reads `/lol-gameflow/v1/session` for phase and queue data, and `/lol-champ-select/v1/session` for visible picks and assigned positions.
4. If the phase is not `ChampSelect`, the client is disconnected, or the queue is not Normal Draft/Ranked, the route returns a disabled payload and no draft selections.
5. If the session is supported, the route returns visible allied picks with roles, visible enemy picks, the local player's assigned role, and queue metadata.

The browser polls this route only after the user clicks `Auto Import`. The server checks gameflow before reading champ-select details, so unsupported phases or queues stop after one local League Client request. The browser applies a changed live-draft signature once, then preserves manual edits until the League Client exposes new conflicting live data.

## Scoring, Filtering, And Ranking

Role suggestions are computed per target role.

Filtering:

- candidates already present in the draft are removed
- candidates must appear in the live tier-list eligibility map for the requested role
- eligibility thresholds in `server.js` are:
  - `lanePercent >= 10`
  - `pickRate >= 0.5`

Score formulas:

- `synergyScore = average(ally matchup values)`
- `counterScore = average(enemy matchup values * -1)`
- `projectedWinRate = average(ally matchup win rates + (100 - enemy matchup win rates))`
- `projectedAgency = 0.5 * synergyScore + 0.5 * counterScore`

First-pick tier-list mode:

- active only when no allies and no enemies are selected
- uses Lolalytics tier-list rows directly instead of matchup rows
- default sort is descending `pbi`
- the browser can also sort descending `winRate`

Backend sort order:

1. higher `projectedWinRate`
2. higher `projectedAgency`
3. higher `counterScore`
4. alphabetical candidate name

Important behavioral details:

- low projected win-rate rows stay visible; the UI highlights them instead of filtering them out
- rows that are top-ranked by projected win rate or projected agency are highlighted
- ally-only drafts produce `counterScore = 0`
- enemy-only drafts produce `synergyScore = 0`
- assigned ally roles prefer role-specific synergy data and fall back to the `all` lane when needed

Build-suggestion aggregation:

- games and wins are summed by rune style, rune slot, exact rune page, summoner spell set, item ID per item slot, and completed boot
- most-picked selections use the highest aggregated game count
- highest-win rune pages, summoner spell sets, item choices, and boots default to a `1%` sample threshold before ranking by win rate
- ordered item paths are built slot-by-slot from non-boot items
- only completed boots are kept

## Caching And Failure Handling

Backend caches:

- remote Lolalytics resource cache
  - key: full request URL
  - TTL: 5 minutes

- normalized build cache
  - key: ally champion + ally role + enemy champion + rank filter + patch
  - TTL: 5 minutes

- aggregated build-suggestion response cache
  - key: rank filter + ally champion + ally role + enemies
  - TTL: 5 minutes

- aggregated draft-projection response cache
  - key: rank filter + allies + ally roles + enemies
  - TTL: 5 minutes

- resolved Qwik payload caches
  - stored in `WeakMap`s
  - tied to the payload object lifetime rather than a fixed TTL

Frontend caches:

- role suggestions are cached for the current browser session by rank filter + allies + ally roles + enemies
- build suggestions are cached for the current browser session by rank filter + ally + ally role + enemies
- draft outlook responses are cached for the current browser session under the same draft key as role suggestions
- live-draft responses are not cached; they are short-poll reads from the local League Client after explicit opt-in
- rune imports are not cached; each `Import Runes` click reads fresh local page state and writes only when the target page differs

Failure behavior:

- remote requests time out after 15 seconds
- role suggestion fetches use `Promise.allSettled(...)`, so one failed synergy/counter source does not automatically discard the rest of the role
- role-specific failures are exposed in `metaByRole[role].partialFailures`
- draft-projection failures are exposed in `summary.partialFailures`
- build-suggestion fetches also use `Promise.allSettled(...)`, and enemy-specific failures are exposed in `summary.partialFailures`
- if every requested role fails, `/suggest` returns an HTTP error payload
- if a draft projection has no usable win-rate samples, `/draft-outlook` returns an HTTP error payload
- if every rune build fetch fails, `/build-suggestions` returns an HTTP error payload
- if rendered build-page fetch or parse failures leave the popup without runes, summoner spells, both five-item paths, or boots, `/build-suggestions` returns an HTTP error payload instead of rendering a partial build popup
- `/live-draft` expected failures return disabled payloads so the UI can show the auto-import banner without changing current selections
- `/rune-import` expected failures return `409` with a disabled payload so the modal can show page-specific import feedback

## External Assumptions

The most fragile dependencies are external:

- Riot documents local client APIs but states the League Client API is not officially supported for third-party applications; champ-select import depends on that local API and may change without notice
- the UI must keep a readily visible unframed Riot non-endorsement/trademark footnote if it continues to reference Riot or League-related names, assets, or local client data
- the Windows League Client lockfile must be present and readable while the client is running
- League Client rune import depends on `/lol-gameflow/v1/session` and `/lol-perks/v1/pages` staying compatible
- Lolalytics mega tier, synergy, and counter payloads must continue exposing the currently parsed fields
- Lolalytics mega rune payloads must continue exposing `header`, `summary.runes`, `summary.pick`, and `summary.win`
- Lolalytics rendered build pages must continue exposing recognizable `Summoner Spells` and `Core Build` sections with item/spell image metadata and nearby win-rate/game-count text

If the app suddenly stops returning data without a local code change, these assumptions are the first place to investigate.

## Operational Notes

- default port: `3000`
- supported runtime env vars:
  - `PORT`
  - `PICKBAN_DISABLE_AUTO_UPDATE=1` or `PICKBAN_AUTO_UPDATE=0` to skip the startup update check
  - `PICKBAN_AUTO_UPDATE_REMOTE` and `PICKBAN_AUTO_UPDATE_BRANCH` to override the checked git remote and branch; defaults are `origin` and `main`
  - `PICKBAN_AUTO_UPDATE_ZIP_URL` to override the no-git release zip URL; default is `https://github.com/RadixSort/pickban-prototype/archive/refs/heads/main.zip`
  - `LOLALYTICS_BASE_URL`
  - `LOLALYTICS_MEGA_URL`
  - `PICKBAN_RIOT_LOCKFILE_PATH`, `LEAGUE_CLIENT_LOCKFILE_PATH`, or `RIOT_LOCKFILE_PATH` for local League Client lockfile overrides
- `npm start` checks the configured git remote/branch before loading `server.js`; it updates only when the local package version differs, the current branch matches the target branch, the working tree is clean, and the fetched commit can fast-forward
- if Git is unavailable and no `.git` directory exists beside the app, startup falls back to the configured GitHub zip archive, extracts it with the built-in Node zip reader, and copies archive files into the app directory
- if `package.json` or `package-lock.json` changes during startup auto-update, the bootstrap runs `npm install --no-audit --no-fund` before loading `server.js`
- static assets and API routes are served by the same process
- static assets are served with `Cache-Control: no-store`
- `/app-config` exposes the package version and `lolalyticsDataWindowDays`; the header uses that value to describe the current Lolalytics `patch=7` lookback window as `last 7 days`
- the frontend shows the lifetime Lolalytics live-hit count in the top-right header without enclosing it in the bordered data-source banner
- the close button is only shown after `GET /app-config` succeeds
- `POST /shutdown` only accepts loopback requests with the per-process shutdown token
- `Ctrl+C` and `SIGTERM` both use the graceful shutdown path
- patch window, queue, region, request timeout, and role-eligibility thresholds are hard-coded in `server.js`

## Tests And Benchmarking

- `npm test` runs the full Node test suite
- most tests cover pure helpers or renderers and do not depend on live network access
- `test/server-http.test.js` covers local route behavior such as `/app-config` and input rejection before live fetches
- `test/server-startup.test.js` is a startup/shutdown smoke test for `server.js`
- `test/server-route-helpers.test.js` covers the shared route helper module used by `server.js`
- `test/riot-live-draft.test.js` covers League Client payload normalization
- `test/riot-rune-import.test.js` covers rune-page validation, first editable page selection, and League Client rune-page mutation shaping
- `test/lolalytics-build-parser.test.js` keeps separate regression coverage for mega rune payloads and rendered-page item/boot extraction
- `test/build-suggestion-results.test.js` covers cross-matchup build aggregation, highest-win thresholds, item-path construction, and boot ranking
- `test/server-api.test.js` mocks `LOLALYTICS_MEGA_URL` and `LOLALYTICS_BASE_URL` so future build failures can be isolated to enemy matchup fetches, rune parsing, rendered page parsing, caching, category completeness, or aggregation
- `test/server-http.test.js` covers local League Client route behavior for both champ-select import and rune-page import with a fake local Riot client
- `npm run bench:efficiency` is useful after changing aggregation or ranking behavior
