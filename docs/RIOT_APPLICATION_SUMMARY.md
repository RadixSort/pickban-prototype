# Riot Application Summary

This summary is intended for Riot Developer Portal registration or review.

## Product

PickBan Prototype is a local-only League of Legends draft assistance web app. It runs on the user's computer as a Node/Express process and serves a browser UI at `localhost`.

The app helps a player make draft and build decisions during champion select by combining the player's manually selected draft state, optional local League Client champion-select state, and public Lolalytics recommendation data.

## User-Facing Features

- Suggest champions for unassigned allied roles based on selected allies, selected enemies, role eligibility, matchup synergy, and matchup counter data.
- Project a full allied draft win-rate estimate once all five allied champions have assigned roles.
- Show build recommendations for a selected allied champion and role after all five enemies are selected, including runes, summoner spells, items, and boots.
- Optionally import visible champion-select picks, pending allied pick hovers, and assigned allied roles from the local League Client after the user clicks `Auto Import`.
- Optionally import one displayed rune recommendation into the local League Client after the user clicks `Import Runes`.

## Riot/League Client API Usage

The app uses the local League Client API only on the user's own machine, authenticated through the local lockfile while the League Client is running.

Current local League Client endpoints:

- `GET /lol-gameflow/v1/session`
  - Used to confirm the user is in champion select before reading or changing champion-select-related data.
  - Used to check queue compatibility for champion pick import.
- `GET /lol-champ-select/v1/session`
  - Used only after gameflow confirms a supported champion-select queue.
  - Reads visible allied/enemy champion IDs, pending pick actions, local player cell ID, and assigned positions.
- `GET /lol-perks/v1/pages`
  - Used only when the user clicks `Import Runes` during champion select.
  - Reads saved rune pages to find the first editable user-created page.
- `PUT /lol-perks/v1/pages/{id}`
  - Used only when the user clicks `Import Runes` and the first editable page does not already match the requested recommendation.
  - Updates that page name to `import - {Champion}` and writes the selected rune IDs/style IDs.

The app does not create or delete rune pages. It skips default non-editable Riot rune pages.

## Data Handling

- No hosted backend is used.
- No accounts, passwords, Riot IDs, summoner names, PUUIDs, match history, chat, inventory, store, wallet, or payment data are collected.
- No data is sold, shared, uploaded, or persisted to a third-party service by this app.
- Draft selections and recommendation responses live in browser memory and server memory only for the local app session.
- The app does not automate gameplay, input, matchmaking, queue actions, champion locking, bans, purchases, chat, or account actions.

## Third-Party Data

The app fetches public Lolalytics data for role suggestions, draft projections, and full-enemy-team build recommendations. Requests are cached and coalesced locally to reduce repeated upstream hits without changing result quality.

Lolalytics data is used for recommendations only. The app is independent and is not affiliated with or endorsed by Riot Games or Lolalytics.

## Impact Controls

- League Client champion-select details are read only after gameflow confirms a supported champ-select phase and queue.
- Rune page writes are only triggered by a direct user click.
- Rune page writes are skipped when the target page already matches the requested import.
- Live Lolalytics responses are cached for a short TTL and duplicate in-flight requests share one upstream fetch.
