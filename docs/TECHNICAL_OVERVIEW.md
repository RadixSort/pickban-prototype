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
- enemy role matching: `public/enemy-role-assignments.js`
- rank filters: `public/rank-filters.js`
- lane-opponent multiplier and shared-lane rules: `public/lane-opponent-weight.js`, `lib/lane-opponent-weight.js`
- summoner spell names and icons: `public/summoner-spell-metadata.js`
- result ranking: `public/result-ranking.js`
- frontend cache keys: `public/suggestion-cache.js`, `public/build-suggestion-cache.js`
- build counter-filter state: `public/build-counter-filter.js`
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

Live Lolalytics requests use `queue=ranked`, `region=all`, and `patch=30` for the last 30 days. `public/rank-filters.js` centralizes the supported All Ranks through Master+ tiers and their upstream query values; Emerald+ remains the default.

### Suggestions

`POST /suggest` accepts a rank filter, a lane-opponent weight of 1, 2, 3, or 4, allies, enemies, and optional target roles. Enemy entries retain legacy champion-name strings and also accept `{ champion, role }` objects. It validates known champions, roles, team limits, duplicate ally roles, opposing duplicate champions, and target roles before fetching. The API lane-weight fallback is 3. In the browser, defaults follow the viewed role: Support/Jungle use 1, Bottom/Middle use 2, and Top uses 3. A manual selection persists across role switches with the same default and resets when the next role has a different default.

An empty draft returns PBI tier lists. A populated draft fetches tier data first, then ally-synergy and role-scoped enemy-counter rows only for roles with usable tier candidates. Multi-role requests share identical upstream resources.

Draft-aware champion suggestions give every assigned same-lane enemy the selected number of contributions while every other enemy contributes once. Explicit enemy roles override upstream lane inference; legacy string-only requests continue to use the inferred role. Bottom and Support share a lane. If no enemy matches the target lane, exactly one fulfilled enemy result is assigned as the lane opponent using cached target-role lane share, then usable row count and champion key as stable fallbacks. Counter scores and enemy-facing projected-win-rate samples use the same contributions.

Candidates must have at least 10% lane share and 0.5% pick rate. Selected champions and negative Projected Agency results are excluded.

### Ban suggestions

`POST /ban-suggestions` tolerates invalid hover and unavailable-champion records so one bad lane falls back instead of failing the request. Tier data for all five roles is fetched in parallel; only valid hovers require counter data. Every response must contain five ordered suggestions.

### Draft outlook

`POST /draft-outlook` requires five allies with unique roles and accepts zero to five enemies in the same string-or-role-object form as suggestions. It combines ally synergy and enemy counters, using explicit enemy roles for the counter-agency lane adjustment. A request with no usable win-rate samples fails rather than returning a misleading projection.

### Builds and rune import

`POST /build-suggestions` accepts enemy name strings or `{ champion, role }` objects and fetches one mega rune payload and one rendered matchup page per enemy in parallel. The allied role is sent as `lane`; an assigned enemy role is sent as `vslane`, and normalized matchup cache keys include both roles so changing an enemy lane cannot reuse the previous lane's build. `lib/lolalytics-build-parser.js` prefers embedded Qwik data for matchup rune-element distributions and inactive item tabs, with visible HTML sections as fallback. Rendered Qwik rune data overrides mega rune data when it contains a usable element histogram because the mega endpoint can return generic champion-role runes even when a matchup filter is requested. Complete source rune pages are optional. Partial matchup failures are allowed, but runes, spells, boots, and both five-item paths are required for success.

Rune aggregation sums each element's games and wins across the included matchups. It produces both an all-enemy composite and a lane-opponent composite from the same matchup subset used by lane-only items. For each highest-win or most-picked recommendation, the selected keystone determines the primary tree, the independently selected secondary tree determines the secondary pool, and primary runes, two distinct secondary rows, and three legal stat shards are chosen one by one. The displayed page-level metrics are averages of its selected elements, not observations of that exact complete page.

Build aggregation incorporates every included enemy matchup once when merging runes, summoner spells, starting items, skill priorities, boots, and item paths. It has no lane-weight input or role-based contribution multiplier. Explicit enemy roles still override parsed matchup roles when building the lane-only item subset, and Bottom/Support share a lane. When no included enemy is assigned to the allied builder's lane, the server still assigns one lane-only matchup: the highest explicit lane-likelihood value when available, then the largest matchup sample and champion key as stable fallback signals.

The popup opens with every enemy explicitly selected. Its scroll container keeps the Counter Filter sticky above the build content, with a right-anchored opaque background through the five-portrait control footprint followed by a short horizontal fade to full transparency. Portraits toggle individual matchups; removing the final selected portrait or using the red clear action restores the complete selection. During an uncached subset request, the previous recommendation DOM remains mounted and non-interactive, and each render restores the captured scroll offset; this prevents the short loading state from collapsing the scroll range. The red clear action remains rendered at all times and is disabled when every enemy is already selected. An empty selection is accepted only as a defensive all-enemies fallback. Each subset requests the same `/build-suggestions` endpoint and uses the normal build cache, so every recommendation section is derived from exactly the selected enemies. Each payload keeps all-included-enemy rune pages and item paths at their existing top-level fields, plus lane-only rune data under `runes.laneOpponents` and lane-only item paths under `items.laneOpponents`. The rune and item Highest Win and Most Picked columns keep independent **All enemies**/**Lane only** view state.

`POST /rune-import` requires League `ChampSelect`, validates the complete recommendation, and updates the first editable saved page. It skips default pages and avoids a write when the page already matches.

### Live draft

`GET /live-draft` reads local League endpoints only after Auto Import is enabled in the browser. Supported queue IDs are 0 (Practice Tool), 400, 420, and 440. The normalized payload includes visible picks, temporary allied hovers, roles, phase, session identity, hover intents, and champions unavailable for bans.

The browser polls independently of suggestion requests. Session changes, phase exit, or disconnection invalidate ban state so late responses cannot reopen the panel.

## Scoring

Per target role:

- `synergyScore`: average allied matchup values.
- `counterScore`: weighted average of counter values using the selected lane-opponent multiplier.
- Same-role enemies and Bottom/Support pairs receive the selected 1x, 2x, 3x, or 4x contributions; other enemies receive one.
- `projectedWinRate`: average allied win rates and enemy-facing win rates reoriented to the candidate, using those same enemy contributions.
- Low/High skill estimates subtract/add the gap between the tier's best worldwide win rate and candidate base win rate.
- `projectedAgency = synergyScore + counterScore`.
- First-pick `PBI = (winRate - averageWinRate) * 100 * pickRate / (100 - banRate)`, rounded.

Backend draft-aware order is Projected Win Rate, Projected Agency, Counter, then champion name. The frontend can re-sort without changing server results.

The full-team `/draft-outlook` is separate from the user-selectable champion-suggestion multiplier and retains its existing counter-agency lane adjustment.

## Caching and failures

All server caches use an eight-hour TTL and least-recently-used bounds:

- remote Lolalytics resources: 256 entries
- normalized matchup builds: 128
- tier rows and eligible tier stats: 64 each
- aggregate build, draft, and ban responses: 64 each
- ally role likelihoods: 16

Remote cache keys are full URLs. Identical in-flight requests share one promise; pending entries use the 15-second request timeout rather than the normal TTL. Resolved Qwik objects use lifetime-bound `WeakMap` caches.

Browser suggestion and build caches last for the page session and include both teams' role assignments in their keys. Suggestion keys also include the lane-opponent multiplier; a populated champion-suggestion fetch proactively fills the ×1 through ×4 entries, while enemy-free suggestions reuse one equivalent result across all four keys. Build keys instead include the current Counter Filter enemy subset and never include lane weight. Rank-filtered champion lane likelihoods allocate automatic assignments without duplicates, giving contested roles to the higher-probability champion before filling remaining roles. Manual assignments remain locked and may duplicate. Ban results last only for the current champion-select session. Live-draft and rune-import calls are never cached.

Lolalytics requests time out after 15 seconds. Suggestion, draft, and build flows preserve partial failures when a useful result remains. Ban counter failures fall back per lane; the route fails only if five recommendations cannot be produced.

## Startup updates

The git updater runs only on the configured branch with a clean worktree, a newer remote package version, and a fast-forwardable commit. Non-git installs can replace files from the configured GitHub zip. Dependency file changes trigger `npm install --no-audit --no-fund`.

Release commits must update the version in both `package.json` and `package-lock.json`; both update paths use it to detect a new release.

## External assumptions

- Lolalytics mega payloads retain the parsed tier, synergy, counter, and rune fields and honor `vslane`.
- Rendered matchup pages retain usable Qwik data or recognizable build sections.
- League Client lockfile and local gameflow, champion-select, and perks endpoints remain compatible.
- Riot/League references keep a visible non-endorsement footnote.
- Data window, queue, region, request timeout, cache limits, and eligibility thresholds remain hard-coded in `server.js`.

When live data fails without a local change, check these boundaries first.

## Test risk map

- `test/server-api.test.js`: mocked Lolalytics contracts, caching, partial failures, builds, and projections.
- `test/server-http.test.js`: local config, shutdown, live draft, and rune import routes.
- `test/ban-suggestions-api.test.js` and `test/ban-suggestion-state.test.js`: ban hierarchy and stale-response lifecycle.
- `test/riot-live-draft.test.js` and `test/riot-rune-import.test.js`: League normalization and mutation.
- `test/lolalytics-build-parser.test.js` and `test/build-suggestion-results.test.js`: build-source regressions.
- `test/build-counter-filter.test.js` and `test/enemy-role-assignments.test.js`: popup subset selection and probability-prioritized automatic roles.
- `test/ttl-cache.test.js`: cache expiry, recency, and bounds.
