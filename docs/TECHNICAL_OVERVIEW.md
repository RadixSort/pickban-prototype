# Technical Overview

This is the developer map for runtime boundaries, request behavior, and external risks. User setup and operation belong in the [README](../README.md).

## Runtime and commands

- Node.js 18+, Express 5, plain HTML/CSS/browser JavaScript, built-in `fetch`, and `node:test`.
- One local process serves `public/`; there is no bundler, database, auth, hosted backend, or deployment config.
- `npm start`: run the startup updater, then the server.
- `npm test`: run all tests serially.
- `npm run bench:efficiency`: compare aggregation, top-N ranking, and Qwik resolution hot paths.

Runtime overrides:

- `PORT` (default `3000`).
- `PICKBAN_DISABLE_AUTO_UPDATE=1` or `PICKBAN_AUTO_UPDATE=0` disables startup updates.
- `PICKBAN_AUTO_UPDATE_REMOTE`, `PICKBAN_AUTO_UPDATE_BRANCH`, and `PICKBAN_AUTO_UPDATE_ZIP_URL` configure update sources.
- `LOLALYTICS_BASE_URL` and `LOLALYTICS_MEGA_URL` override live-data origins.
- `PICKBAN_RIOT_LOCKFILE_PATH`, `LEAGUE_CLIENT_LOCKFILE_PATH`, or `RIOT_LOCKFILE_PATH` overrides League lockfile discovery.

## Code map

- `start.js`: startup bootstrap.
- `server.js`: Express routes, live fetch orchestration, caching, and shutdown.
- `public/app.js`: browser state, draft editing, live import, request flows, and rendering.
- `public/*.js`: focused browser helpers; shared rules are also loaded by Node tests and server code.
- `lib/*.js`: Node-only normalization, parsing, League Client access, scoring, caching, and response construction.
- `test/*.test.js`: unit and local HTTP coverage; live origins are mocked.
- `bench/efficiency.js`: synthetic hot-path comparisons.

Keep cross-runtime rules in their existing focused modules:

- roles: `public/roles.js`
- rank filters: `public/rank-filters.js`
- result ranking: `public/result-ranking.js`
- frontend cache keys: `public/suggestion-cache.js`, `public/build-suggestion-cache.js`
- ban UI lifecycle: `public/ban-suggestion-state.js`
- request validation: `lib/request-normalization.js`, `lib/requested-target-roles.js`
- route response shaping: `lib/server-route-helpers.js`
- bounded server cache: `lib/ttl-cache.js`

## HTTP surface

- `GET /app-config`: version, data window, shutdown token, and request stats.
- `GET /ally-role-likelihoods`: lane shares for role assignment.
- `GET /live-draft`: opt-in local League Client champion-select state.
- `POST /rune-import`: update the first editable League rune page.
- `POST /ban-suggestions`: one ban recommendation for each role.
- `POST /suggest`: first-pick or draft-aware open-role suggestions.
- `POST /draft-outlook`: projection for five role-assigned allies.
- `POST /build-suggestions`: build aggregation for one ally into one to five enemies.
- `POST /shutdown`: loopback-only shutdown guarded by a per-process token.

Static assets use `Cache-Control: no-store`.

## Request behavior

### Suggestions

`POST /suggest` accepts a rank filter, allies, enemies, and optional target roles. It validates known champions, team limits, duplicate roles, opposing duplicate champions, and target roles before fetching.

An empty draft returns PBI tier lists. A populated draft fetches tier data first, then ally-synergy and role-scoped enemy-counter rows only for roles with usable tier candidates. Multi-role requests share identical upstream resources.

Candidates must have at least 10% lane share and 0.5% pick rate. Selected champions and negative Projected Agency results are excluded.

### Ban suggestions

`POST /ban-suggestions` tolerates invalid hover and unavailable-champion records so one bad lane falls back instead of failing the request. Tier data for all five roles is fetched in parallel; only valid hovers require counter data. Every response must contain five ordered suggestions.

### Draft outlook

`POST /draft-outlook` requires five allies with unique roles and accepts zero to five enemies. It combines ally synergy and enemy counters. A request with no usable win-rate samples fails rather than returning a misleading projection.

### Builds and rune import

`POST /build-suggestions` fetches one mega rune payload and one rendered matchup page per enemy in parallel. `lib/lolalytics-build-parser.js` prefers embedded Qwik data for inactive item tabs, with visible HTML sections as fallback. Partial matchup failures are allowed, but runes, spells, boots, and both five-item paths are required for success.

`POST /rune-import` requires League `ChampSelect`, validates the complete recommendation, and updates the first editable saved page. It skips default pages and avoids a write when the page already matches.

### Live draft

`GET /live-draft` reads local League endpoints only after Auto Import is enabled in the browser. Supported queue IDs are 400, 420, and 440. The normalized payload includes visible picks, temporary allied hovers, roles, phase, session identity, hover intents, and champions unavailable for bans.

The browser polls independently of suggestion requests. Session changes, phase exit, or disconnection invalidate ban state so late responses cannot reopen the panel.

## Scoring

Per target role:

- `synergyScore`: average allied matchup values.
- `counterScore`: average counter values after opponent-lane weighting.
- Counter weight is `0.5` across unrelated lanes and `1` for same-lane, Bottom/Support pairs, or missing lane metadata.
- `projectedWinRate`: average allied win rates and enemy-facing win rates reoriented to the candidate.
- Low/High skill estimates subtract/add the gap between the tier's best worldwide win rate and candidate base win rate.
- `projectedAgency = synergyScore + counterScore`.
- First-pick `PBI = (winRate - averageWinRate) * 100 * pickRate / (100 - banRate)`, rounded.

Backend draft-aware order is Projected Win Rate, Projected Agency, Counter, then champion name. The frontend can re-sort without changing server results.

## Caching and failures

All server caches use an eight-hour TTL and least-recently-used bounds:

- remote Lolalytics resources: 256 entries
- normalized matchup builds: 128
- tier rows and eligible tier stats: 64 each
- aggregate build, draft, and ban responses: 64 each
- ally role likelihoods: 16

Remote cache keys are full URLs. Identical in-flight requests share one promise; pending entries use the 15-second request timeout rather than the normal TTL. Resolved Qwik objects use lifetime-bound `WeakMap` caches.

Browser suggestion and build caches last for the page session. Ban results last only for the current champion-select session. Live-draft and rune-import calls are never cached.

Lolalytics requests time out after 15 seconds. Suggestion, draft, and build flows preserve partial failures when a useful result remains. Ban counter failures fall back per lane; the route fails only if five recommendations cannot be produced.

## Startup updates

The git updater runs only on the configured branch with a clean worktree, a newer remote package version, and a fast-forwardable commit. Non-git installs can replace files from the configured GitHub zip. Dependency file changes trigger `npm install --no-audit --no-fund`.

Release commits must update the version in both `package.json` and `package-lock.json`; both update paths use it to detect a new release.

## External assumptions

- Lolalytics mega payloads retain the parsed tier, synergy, counter, and rune fields and honor `vslane`.
- Rendered matchup pages retain usable Qwik data or recognizable build sections.
- League Client lockfile and local gameflow, champion-select, and perks endpoints remain compatible.
- Riot/League references keep a visible non-endorsement footnote.
- Patch window, queue, region, request timeout, cache limits, and eligibility thresholds remain hard-coded in `server.js`.

When live data fails without a local change, check these boundaries first.

## Test risk map

- `test/server-api.test.js`: mocked Lolalytics contracts, caching, partial failures, builds, and projections.
- `test/server-http.test.js`: local config, shutdown, live draft, and rune import routes.
- `test/ban-suggestions-api.test.js` and `test/ban-suggestion-state.test.js`: ban hierarchy and stale-response lifecycle.
- `test/riot-live-draft.test.js` and `test/riot-rune-import.test.js`: League normalization and mutation.
- `test/lolalytics-build-parser.test.js` and `test/build-suggestion-results.test.js`: build-source regressions.
- `test/ttl-cache.test.js`: cache expiry, recency, and bounds.
