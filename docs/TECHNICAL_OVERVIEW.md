# Technical Overview

This document is the developer-facing map of the codebase: entry points, shared modules, request flow, API shape, and the assumptions baked into the current scoring pipeline.

The app uses live Lolalytics data and is built independently with appreciation for their matchup and tier-list work.

## Stack

- Node.js 18+
- Express 5
- Plain HTML, CSS, and browser JavaScript
- Node's built-in `fetch`
- Node's built-in `node:test`

There is no bundler, database, auth layer, or server-side rendering.

## Entry Points And Commands

- `npm start` -> `node server.js`
- `npm test` -> `node --test`
- `npm run bench:efficiency` -> `node bench/efficiency.js`
- Browser entry point -> `public/index.html`
- Frontend controller -> `public/app.js`

Only one runtime dependency is installed from npm: `express`.

## Repository Layout

- `server.js`
  - Express bootstrapping
  - `GET /app-config`, `POST /suggest`, `POST /shutdown`
  - request validation
  - live Lolalytics fetch/parsing
  - in-memory remote cache
  - score aggregation and response shaping
  - graceful shutdown

- `lib/requested-target-roles.js`
  - normalizes explicit target-role requests
  - defaults to every unassigned ally role when no target role is provided

- `lib/request-normalization.js`
  - normalizes rank filters, ally selections, and enemy selections
  - validates duplicate ally role assignments before role resolution

- `lib/candidate-score-accumulator.js`
  - stores running totals for synergy, counter, and projected win rate
  - finalizes scores without building intermediate per-candidate arrays

- `lib/lolalytics-tier-list.js`
  - parses Lolalytics tier-list HTML
  - supports both list and grid markup
  - maps parsed rows back to local champion metadata

- `lib/role-suggestion-results.js`
  - aggregates ally and enemy matchup rows by candidate champion
  - computes projected scores, partial failures, and response metadata

- `lib/matchup-orientation.js`
  - flips enemy-facing win rates back to the candidate pick's perspective

- `public/app.js`
  - draft state, champion search, ally role assignment UI, and results rendering
  - frontend-only results cache keyed by the current draft state

- `public/roles.js`
- `public/rank-filters.js`
- `public/result-ranking.js`
- `public/suggestion-filters.js`
- `public/suggestion-cache.js`
  - shared helper modules
  - loaded directly in the browser and reused by Node tests or the server with `require(...)`

- `public/champions.json`
  - local champion names, slugs, numeric keys, and icon URLs

- `test/*.test.js`
  - regression coverage for request normalization, score aggregation, shared helpers, and Lolalytics parsers

- `bench/efficiency.js`
  - synthetic benchmark for role aggregation and top-N result-key selection

## Runtime Architecture

The app is a single Express process serving both the UI and the API:

1. `server.js` serves `public/` as static files with `Cache-Control: no-store`.
2. The browser loads `index.html`, `styles.css`, the shared helper modules, `app.js`, and `champions.json`.
3. `app.js` collects the current draft:
   - allied champions
   - enemy champions
   - optional ally role assignments
   - selected rank filter
4. The frontend submits the draft to `POST /suggest`.
5. The backend resolves the target roles to fetch.
6. For each target role, the backend fetches:
   - tier-list HTML for role eligibility and live win rate
   - ally synergy data
   - enemy counter data
7. The backend combines, filters, sorts, and returns the results.
8. The frontend renders one role at a time and lets the user switch between returned role bundles.

## Current Frontend Workflow

The current UI does not ask the user to choose one target role before submitting.

Instead:

1. the user assigns any ally roles they already know
2. the frontend sends the draft without a target-role field
3. the backend fetches every role that is still unassigned
4. the user switches between those roles in the results panel

That behavior is intentional and implemented in `resolveRequestedTargetRoles(...)`.

## Request Validation

`POST /suggest` accepts:

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

The server also supports explicit target-role requests for callers other than the current UI:

```json
{
  "rankFilter": "diamond_plus",
  "roles": ["top", "bottom"],
  "allies": [{ "champion": "Nami", "role": "support" }],
  "enemies": ["Blitzcrank"]
}
```

Supported target-role inputs:

- `roles`: array of role aliases
- `role`: single role alias
- `targetRole`: single role alias

Validation rules enforced by the current code:

- `allies` and `enemies` must be arrays when present
- ally entries can be champion strings or objects with `champion`/`name` and optional `role`/`lane`
- enemy entries must be non-empty champion strings
- champion names must exist in `public/champions.json`
- role aliases normalize to `top`, `jungle`, `middle`, `bottom`, or `support`
- duplicate champions in the same request are ignored
- maximum 4 unique allies
- maximum 5 unique enemies
- at least one champion must be present overall
- duplicate ally role assignments are rejected
- explicitly requested target roles cannot overlap with already-assigned ally roles

If no explicit target-role field is provided, the server defaults to all unassigned roles.

Champion names are normalized by lowercasing and stripping non-alphanumeric characters before lookup.

## API Responses

The primary response shape is multi-role:

```json
{
  "roles": ["top", "middle", "bottom"],
  "resultsByRole": {
    "top": [],
    "middle": [],
    "bottom": [
      {
        "candidate": "Thresh",
        "candidateKey": "412",
        "icon": "https://cdn5.lolalytics.com/champ140/thresh.webp",
        "role": "bottom",
        "winRate": 51.88,
        "projectedWinRate": 52.43,
        "synergyScore": 52.31,
        "counterScore": -50.94,
        "projectedAgency": 0.685
      }
    ]
  },
  "metaByRole": {
    "top": {
      "role": "top",
      "allyCount": 2,
      "enemyCount": 2,
      "assignedRoleCount": 1,
      "partialFailures": [],
      "error": "No top data was returned from Lolalytics for the selected champions."
    },
    "middle": {
      "role": "middle",
      "allyCount": 2,
      "enemyCount": 2,
      "assignedRoleCount": 1,
      "partialFailures": []
    },
    "bottom": {
      "role": "bottom",
      "allyCount": 2,
      "enemyCount": 2,
      "assignedRoleCount": 1,
      "partialFailures": []
    }
  }
}
```

When exactly one role is requested, the server also includes legacy `results` and `meta` fields for compatibility.

Errors use:

```json
{
  "error": "Message here"
}
```

Related endpoints:

- `GET /app-config`: returns the app version, close-button availability, and shutdown token
- `POST /shutdown`: loopback-only local shutdown, protected by the per-process token from `/app-config`

## Scoring And Ranking

For each requested target role:

1. Fetch the live tier list for that role.
2. Fetch ally synergy rows for every selected ally.
3. Fetch enemy counter rows for every selected enemy.
4. Aggregate all rows by candidate champion key.
5. Drop candidates that are already present in the draft.
6. Drop candidates that fail the live tier-list thresholds.
7. Sort the remaining rows.

Scoring formulas:

- `synergyScore = average(synergyValues)`
- `counterScore = average(enemyCounterValues * -1)`
- `projectedWinRate = average(allyMatchupWinRates + (100 - enemyMatchupWinRates))`
- `projectedAgency = 0.5 * synergyScore + 0.5 * counterScore`

Tier-list eligibility thresholds:

- `lanePercent >= 10`
- `pickRate >= 0.5`

Sorting in the backend defaults to:

1. higher `projectedAgency`
2. higher `projectedWinRate`
3. higher `counterScore`
4. alphabetical candidate name

The frontend can re-rank the same result set by `projectedWinRate`.

Behavioral consequences worth knowing:

- ally-only drafts produce `counterScore = 0`
- enemy-only drafts produce `synergyScore = 0`
- assigned ally roles prefer role-specific synergy rows, then fall back to the `all` lane
- low projected win-rate rows are kept and highlighted instead of being hidden

## Caching And Failure Handling

Backend cache behavior:

- cache key: full Lolalytics request URL
- success TTL: 5 minutes
- request timeout: 15 seconds
- scope: in-memory only, cleared on process restart

Frontend cache behavior:

- cache key: rank filter + ally champion keys + ally role assignments + enemy champion keys
- scope: in-memory only for the current browser session

Failure behavior:

- synergy and counter fetches use `Promise.allSettled(...)`
- one failed remote request does not automatically discard successful rows from the same role
- role-specific failures are surfaced in `metaByRole[role].partialFailures`
- if a role returns zero usable candidates after parsing and filtering, that role gets an error payload
- if every requested role fails, the request returns an HTTP error

## External Assumptions

The current implementation assumes:

- Lolalytics tier-list pages keep exposing champion rows in either the current list or grid HTML structures
- `q-data.json` keeps the current Qwik `_objs` reference structure
- the relevant payload sections remain under `enemy`, `team`, and `header`

These are the most likely breakpoints when the app suddenly stops producing suggestions without a local code change.

## Operational Notes

- Default port: `3000`
- Override with `PORT`
- Static assets and API routes are served by the same process
- The top-right close button is only enabled after `/app-config` succeeds
- `Ctrl+C` and `SIGTERM` use the graceful shutdown path
- No build step is required
