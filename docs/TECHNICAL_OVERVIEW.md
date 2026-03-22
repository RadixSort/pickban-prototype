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
- `lib/server-route-helpers.js`: public response shaping
- `test/server-api.test.js`: route contracts with mocked Lolalytics responses

## Entry Points And Commands

Runtime entry points:

- `server.js`: starts the Express process and owns every HTTP route
- `public/index.html`: browser entry point
- `public/app.js`: frontend state and controller logic

Commands:

- `npm start`: run the local server
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
  - `POST /shutdown`
  - Lolalytics fetch/caching helpers
  - graceful shutdown

- `public/app.js`
  - draft state
  - champion search and selection
  - ally role assignment
  - role-results rendering
  - draft projection fetch and rendering
  - build recommendation modal flow

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
  - summary HTML for runes, ordered item paths, and boots

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
  - parse tier-list HTML from Lolalytics
  - map parsed rows back to local champion metadata
  - enforce role eligibility thresholds

- `lib/role-suggestion-results.js`
  - merge ally synergy rows and enemy counter rows
  - keep partial failures
  - return sorted role suggestions

- `lib/candidate-score-accumulator.js`
  - running totals for synergy, counter, and projected win rate

- `lib/matchup-orientation.js`
  - flip enemy-facing matchup win rates back to the candidate pick perspective

- `lib/lolalytics-build-parser.js`
  - normalize matchup `q-data.json` into rune pages, item slot options, and completed boots

- `lib/build-suggestion-results.js`
  - merge matchup build data across enemies into one summary payload for runes, items, and boots

- `lib/draft-projection.js`
  - aggregate full-draft ally synergy and enemy counter matchups
  - reject projections that have no usable win-rate samples

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
7. For each target role, the server fetches:
   - tier-list HTML for eligibility and live win rate
   - ally synergy rows
   - enemy counter rows
8. `buildRoleSuggestionResults(...)` aggregates, filters, and sorts the candidates.
9. `buildRoleSuggestionResponse(...)` shapes the final multi-role payload and legacy single-role fields.
10. The response returns:
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

Used by the matchup-specific build recommendation modal.

Minimal request example:

```json
{
  "rankFilter": "emerald_plus",
  "ally": { "champion": "Ahri", "role": "middle" },
  "enemies": ["Zed", "Sejuani"]
}
```

Flow:

1. `normalizeBuildSuggestionRequest(...)` validates one ally, a required ally role, an optional enemy list, and no ally/enemy overlap.
2. If enemies are selected, the server fetches one Lolalytics matchup build payload per enemy champion. Otherwise it fetches the generic champion build payload for the assigned role.
3. `parseLolalyticsMatchupBuildData(...)` converts each payload into:
   - rune style totals
   - rune slot options
   - exact page candidates
   - ordered item slot options
   - completed boots
4. `buildBuildSuggestionResults(...)` merges those matchup records into one summary response.
5. The response returns:
   - `request`
   - `summary`
   - `runes`
   - `items`
   - `boots`

The browser exposes this route from the `Build` button whenever the selected ally already has a role. When enemies are selected it fetches matchup build data; when no enemies are selected it fetches the generic champion build data for the assigned role and renders it in the same modal.

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

Backend sort order:

1. higher `projectedWinRate`
2. higher `projectedAgency`
3. higher `counterScore`
4. alphabetical candidate name

Important behavioral details:

- low projected win-rate rows stay visible; the UI highlights them instead of filtering them out
- ally-only drafts produce `counterScore = 0`
- enemy-only drafts produce `synergyScore = 0`
- assigned ally roles prefer role-specific synergy data and fall back to the `all` lane when needed

Build-suggestion aggregation:

- highest-win rune pages default to a `1%` sample threshold
- highest-win boots default to a `1%` sample threshold
- only completed boots are kept

## Caching And Failure Handling

Backend caches:

- remote Lolalytics resource cache
  - key: full request URL
  - TTL: 5 minutes

- normalized matchup build cache
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

Failure behavior:

- remote requests time out after 15 seconds
- role suggestion fetches use `Promise.allSettled(...)`, so one failed synergy/counter source does not automatically discard the rest of the role
- role-specific failures are exposed in `metaByRole[role].partialFailures`
- draft-projection failures are exposed in `summary.partialFailures`
- build-suggestion fetches also use `Promise.allSettled(...)`, and enemy-specific failures are exposed in `summary.partialFailures`
- if every requested role fails, `/suggest` returns an HTTP error payload
- if a draft projection has no usable win-rate samples, `/draft-outlook` returns an HTTP error payload
- if every matchup build fetch fails, `/build-suggestions` returns an HTTP error payload

## External Assumptions

The most fragile dependencies are external:

- Lolalytics tier-list pages must continue exposing champion rows in the currently supported HTML structures
- Lolalytics `q-data.json` payloads must continue exposing the current Qwik `_objs` reference format
- the relevant sections must remain under the current payload areas used by the parsers

If the app suddenly stops returning data without a local code change, these assumptions are the first place to investigate.

## Operational Notes

- default port: `3000`
- supported runtime env vars:
  - `PORT`
  - `LOLALYTICS_BASE_URL`
  - `LOLALYTICS_MEGA_URL`
- static assets and API routes are served by the same process
- static assets are served with `Cache-Control: no-store`
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
- `npm run bench:efficiency` is useful after changing aggregation or ranking behavior
