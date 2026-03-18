# PickBan Prototype

PickBan Prototype is a small local web app that helps rank League of Legends support picks during champion draft. You choose up to 4 allied champions and up to 5 enemy champions, can optionally assign lanes to the allied picks, and then fetch live Lolalytics data to build a ranked support shortlist.

This project is meant to be run on your own computer. It is not packaged as a hosted product yet.

## Start Here

- If you are new to computers, terminals, or local apps, read [docs/NON_TECHNICAL_GUIDE.md](docs/NON_TECHNICAL_GUIDE.md).
- If you want the implementation details, read [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md).

## What You Need

- Node.js 18 or newer
- An internet connection while fetching suggestions
- A modern web browser such as Chrome, Edge, Firefox, or Safari

Node.js 18+ is required because the server uses the built-in `fetch` API.

## Quick Start

1. Open a terminal in this project folder.
2. Install dependencies:

```bash
npm install
```

3. Start the app:

```bash
npm start
```

4. Open your browser and go to:

```text
http://localhost:3000
```

5. Leave the terminal window open while you use the app.

To stop the app later, click `Close App` in the browser.

If you prefer, you can still return to the terminal and press `Ctrl+C`.

## How To Use The App

1. In the **Allied Champions** box, type the name of an ally champion and click a suggestion.
2. Repeat until you have added the allied champions you want to consider.
3. If you want, use the **Assign lanes** section to set `Top`, `Jungle`, `Mid`, or `Bot` for some or all allied champions.
4. In the **Enemy Champions** box, add the enemy champions you are drafting against.
5. Click **Fetch Suggestions**.
6. Review the ranked support table.
7. Click any selected champion chip if you want to remove it and try a different draft.

Rules built into the app:

- You can add up to 4 allied champions.
- You can add up to 5 enemy champions.
- Ally lane assignment is optional.
- The same champion cannot be selected on both sides.
- You must choose at least one champion before fetching suggestions.
- Suggested champions must appear on the live support tier list with at least `10%` lane share and `0.5%` pick rate.

## What The Scores Mean

- `SynergyScore`: the average support synergy value gathered from the allied champions you selected.
- `CounterScore`: the average support counter value gathered from the enemy champions you selected.
- `FinalScore`: `50% SynergyScore + 50% CounterScore`.
- `WinRate`: the champion's live support win rate from the Lolalytics support tier list.

Higher scores rank closer to the top.

Important behavior:

- If you only enter allied champions, the counter portion is treated as `0`.
- If you only enter enemy champions, the synergy portion is treated as `0`.
- If you assign ally lanes, the app tries lane-specific synergy first and falls back to all-lane data if needed.
- If some live requests fail, the app can still show partial results and will list those failures above the results table.

## Troubleshooting

### I pulled new commits but the page still looks old

1. Stop the current server with `Close App` or `Ctrl+C`.
2. Start it again with `npm start`.
3. Refresh the browser tab.

The app now serves its local files with `no-store`, so a normal refresh should pick up the newest frontend code. The version badge in the bottom-right corner should show the current app version, starting at `v0.3.0`.

### The app does not start

Check that Node.js is installed:

```bash
node -v
```

If the version is below 18, install a newer version of Node.js.

### The browser says the page cannot be reached

- Make sure `npm start` is still running in the terminal.
- Make sure you opened `http://localhost:3000`.

### The app does not stop when I press `Ctrl+C`

- Use the `Close App` button in the browser instead.
- If the browser page is already gone, return to the terminal and press `Ctrl+C` again.

### Port 3000 is already in use

Start the app on a different port:

On macOS or Linux:

```bash
PORT=3001 npm start
```

On Windows PowerShell:

```powershell
$env:PORT=3001; npm start
```

Then open `http://localhost:3001`.

### Fetching suggestions fails

- Confirm you are connected to the internet.
- Lolalytics may be temporarily slow or unavailable.
- Wait a moment and try again.

### I only see some results and an error message

That usually means one or more live data requests failed, but other requests still succeeded. The app shows partial results whenever it can.

## Project Layout

- `server.js`: Express server, API endpoint, live Lolalytics requests, scoring, and caching
- `public/index.html`: page structure
- `public/app.js`: browser-side interactions and rendering
- `public/styles.css`: styling
- `public/champions.json`: local champion metadata used for search and icons
- `docs/NON_TECHNICAL_GUIDE.md`: step-by-step guide for non-technical users
- `docs/TECHNICAL_OVERVIEW.md`: architecture and API details

## Current Limitations

- The app depends on live Lolalytics responses and may break if their response format changes.
- There is no user login, save system, or match history.
- Results are based on the current hard-coded patch window and settings in `server.js`.
- This is a prototype, so scoring and UX are intentionally simple.
