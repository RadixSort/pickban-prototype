# Technical Overview

This document explains how the PickBan Prototype is structured, where its data comes from, and how the role-specific ranking is computed.

## Stack

- Node.js
- Express 5
- Plain HTML, CSS, and browser-side JavaScript
- No database
- No authentication layer

## High-Level Architecture

The project is a single-process local web app:

1. `server.js` starts an Express server.
2. The server exposes static files from `public/`.
3. The browser loads `index.html`, `styles.css`, `app.js`, and `champions.json`.
4. The frontend collects user-selected champions, the target role, and optional ally role assignments.
5. The frontend sends those selections to `POST /suggest`.
6. The frontend can also load `GET /app-config` and request `POST /shutdown` when the user clicks `Close App`.
7. The backend fetches live data from Lolalytics, calculates scores, sorts the results, and returns JSON.
8. The frontend renders the ranked results table.

## File Responsibilities

- `server.js`
  - static file hosting
  - local app config and shutdown endpoints
  - request validation
  - live Lolalytics fetches
  - q-data payload parsing
  - in-memory caching
  - result aggregation and ranking
  - graceful shutdown for `Ctrl+C`, `SIGTERM`, and browser-triggered app close

- `public/champions.json`
  - local champion metadata
  - search source for the pickers
  - champion names, numeric keys, and icons

- `public/app.js`
  - selection state
  - target role selection
  - optional ally role assignments
  - search suggestion logic
  - request submission
  - loading, error, and result rendering

- `public/roles.js`
  - shared role labels
  - alias normalization
  - target-role and ally-role dropdown options

- `public/index.html`
  - page structure
  - two draft pickers
  - actions and results areas

- `public/styles.css`
  - visual styling
  - responsive layout behavior

## Data Sources

The project combines:

- local champion metadata from `public/champions.json`
- live Lolalytics responses for synergy and counter data
- live Lolalytics tier-list rows for role eligibility and win rates

### Local Metadata

`public/champions.json` contains champion:

- `id`
- `key`
- `name`
- `icon`

The server builds lookup maps by champion key and normalized name. The frontend uses the same file to power the type-ahead search.

### Remote Data

Two remote Lolalytics sources are used:

- synergy data from the Lolalytics mega endpoint
- counter data from the Lolalytics champion build `q-data.json` endpoint
- tier-list data from the Lolalytics role-specific tier-list page

The server uses these lookup settings:

- patch window: `7`
- tier: selected from `all`, `platinum_plus`, default Emerald+ (no tier query), `diamond_plus`, or `d2_plus`
- queue: `ranked`
- region: `all`

## Request And Validation Flow

The frontend sends a `POST /suggest` request with this shape:

```json
{
  "rankFilter": "emerald_plus",
  "role": "support",
  "allies": [
    { "champion": "Ahri", "role": "middle" },
    { "champion": "Jarvan IV" }
  ],
  "enemies": ["Jinx", "Nautilus"]
}
```

Validation rules:

- `allies` must be an array if provided
- `enemies` must be an array if provided
- `role` defaults to `support` when omitted
- each enemy entry must be a non-empty string
- each ally entry must be either a non-empty champion string or an object with a champion name and optional role
- champion names must exist in the local metadata file
- target role and ally role values are normalized to `top`, `jungle`, `middle`, `bottom`, or `support`
- ally role assignments cannot reuse the target role or duplicate each other
- duplicate champions are ignored within the same request
- maximum 4 unique allied champions
- maximum 5 unique enemy champions
- at least one total champion must be provided

Champion names are normalized by lowercasing and stripping non-alphanumeric characters, so minor punctuation differences are tolerated.

## Scoring Model

For each selected allied champion:

- the server fetches target-role synergy rows
- if an ally role is assigned, the server tries that role first and falls back to `all`
- each returned candidate gets a synergy value appended to its candidate record

For each selected enemy champion:

- the server fetches target-role counter rows
- each returned candidate gets a counter value appended to its candidate record

The final output for each candidate is:

- `synergyScore = average(synergyValues)`
- `counterScore = average(rawCounterValues with the sign flipped)`
- `projectedWinRate = average(all synergy and counter matchup win rates)`
- `projectedAgency = 0.5 * synergyScore + 0.5 * counterScore`

Before a candidate is returned, it must also appear on the live tier list for the requested role with:

- `lanePercent >= 10`
- `pickRate >= 0.5`

The returned row also includes the live role `winRate` from that tier list.

Default backend sorting rules:

1. higher `projectedAgency`
2. higher `projectedWinRate`
3. higher `counterScore`
4. alphabetical candidate name

The frontend can also re-rank the same results by `projectedWinRate`.

Behavioral implications:

- if a candidate only has synergy data, `counterScore` becomes `0`
- if a candidate only has counter data, `synergyScore` becomes `0`
- this means one-sided inputs intentionally lower the missing half of the score instead of excluding it from the formula

## Partial Failures

Synergy and counter fetches are executed with `Promise.allSettled`, not `Promise.all`.

That means:

- one failed source does not automatically discard successful sources
- the API can still return ranked results if at least some remote data was usable
- failure messages are collected in `meta.partialFailures`

If no usable rows are produced at all, the API returns a `502` error.

## Response Shape

Successful responses look like this:

```json
{
  "results": [
    {
      "candidate": "Thresh",
      "candidateKey": "412",
      "icon": "https://cdn5.lolalytics.com/champ140/thresh.webp",
      "role": "support",
      "winRate": 51.88,
      "projectedWinRate": 52.43,
      "synergyScore": 52.31,
      "counterScore": -50.94,
      "projectedAgency": 0.685
    }
  ],
  "meta": {
    "role": "support",
    "allyCount": 2,
    "enemyCount": 2,
    "partialFailures": []
  }
}
```

Error responses use:

```json
{
  "error": "Message here"
}
```

The frontend also requests `GET /app-config` to obtain the local shutdown token used by `POST /shutdown`.

## Caching And Timeouts

The backend keeps a simple in-memory cache keyed by request URL.

- cache duration: 5 minutes
- request timeout: 15 seconds

This reduces duplicate requests during repeated local testing, but the cache is lost whenever the server restarts.

## Frontend Interaction Notes

The browser app:

- preloads all champions from `champions.json`
- adds a normalized `searchText` field in memory
- filters out champions already selected on either side
- shows up to 8 search suggestions per input
- uses the top match when the user presses `Enter`
- disables inputs when the side-specific max is reached or while loading

## Operational Notes

- Default port is `3000`
- The port can be changed with the `PORT` environment variable
- Static assets and the API are served from the same Express process
- The browser `Close App` control sends a loopback-only shutdown request with a per-process token
- `Ctrl+C` now performs graceful shutdown and force-closes lingering sockets if needed
- No build step is required

## Known Risks And Limitations

- The implementation depends on external Lolalytics response formats, including their q-data structure.
- If Lolalytics changes field names or array indexes, the prototype may stop returning results.
- Cache is process-local and not suitable for multi-instance deployment.
- There is no persistence, analytics, auth, or rate-limit protection.
- The current scoring model gives equal weight to synergy and counter values without any calibration layer.

## Suggested Next Improvements

- move hard-coded patch, tier, queue, and region values into configuration
- add automated tests for request validation and score aggregation
- add a health check endpoint
- add better user-facing explanations for partial failure cases
- add a packaged deployment option for non-technical users
