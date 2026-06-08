# Non-Technical Guide

This guide is for someone who wants to run the app locally without needing to understand the code.

The app uses live Lolalytics data and is built independently with appreciation for their matchup and tier-list work. Its top banner shows the Lolalytics lookback window and live-hit count; the Riot Games non-endorsement/trademark notice appears as a small footnote near the bottom of the app.

## What The App Does

The app helps you compare champion options for any role that is still open in your draft.

It also has:

- a full-draft win-rate projection once all five allied roles are assigned
- a build view for one ally with current Lolalytics runes, summoner spells, items, and boots
- a League Client rune import button for displayed build-view rune pages
- an optional Windows auto import for League pick/ban in Normal Draft and Ranked games

You choose:

- allied champions
- enemy champions
- any ally roles you already know

Then the app fetches suggestions for every role that is still unassigned and lets you switch between those role results.

If no champions have been selected yet, **Fetch Suggestions** shows first-pick tier lists for each role instead. Those rows use Lolalytics PBI and win rate, and the `+` button adds the champion as your pick for the role you are viewing.

If you fill all five allied slots and assign every ally role, the main button switches to **Who will win?** and shows a projected team win rate instead of open-role suggestions.

## Before You Start

You need:

- this project folder on your computer
- internet access
- a web browser
- Node.js installed

## Step 1: Install Node.js

1. Go to [https://nodejs.org](https://nodejs.org).
2. Download the **LTS** version.
3. Run the installer.

You only need to do this once per computer.

## Step 2: Open The Project Folder In A Terminal

### On macOS

1. Open **Terminal**.
2. Type `cd `.
3. Drag the project folder into the Terminal window.
4. Press `Enter`.

Example:

```bash
cd /Users/your-name/Downloads/pickban-prototype
```

### On Windows

1. Open the project folder in **File Explorer**.
2. Click the address bar.
3. Type `powershell`.
4. Press `Enter`.

## Step 3: Install The App Once

Run:

```bash
npm install
```

You usually only need this the first time, or again after the project dependencies change.

## Step 4: Start The App

Run:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

Leave that terminal window open while you use the app.

## How To Use The App

1. Before any champion is selected, click **Fetch Suggestions** to see first-pick tier lists by role.
2. Add allied champions on the left.
3. Add enemy champions on the right.
4. If you know some ally roles already, assign them in the middle panel.
5. Click **Fetch Suggestions**.
6. Use the **Target role** dropdown in the results area to switch between the returned role suggestions.
7. Click **+** on a result row if you want to add that recommendation into the allied draft for the role you are currently viewing.
8. First-pick results can be sorted by clicking **PBI** or **Winrate**. Draft-aware results default to **Projected Win Rate** and can switch to **Projected Agency** with **Rank by**.
9. After one ally has a role and all five enemy champions are selected, click **Build** on that ally row to combine matchup-specific build data for the full enemy team.
10. During League pick/ban, click **Import Runes** on a displayed rune page to overwrite the first editable saved League rune page as `import - Champion Name`.
11. If all five allies are selected and every ally role is assigned, click **Who will win?** to project the current draft matchup.
12. On Windows, after League pick/ban starts, click **Auto Import** beside the rank selector to let the app fill visible champion picks and ally roles from the League Client.

## Auto Import

Auto Import works only while the League Client is running on the same Windows computer and the current pick/ban is Normal Draft or Ranked.

If it connects, a banner says champion picks are being imported. You can still edit picks and roles yourself; the app will leave those edits alone unless the League Client later reveals conflicting live pick data.

If it cannot find a supported live draft, loses the connection, or sees another game mode, the banner says auto champion import is disabled and your current selections stay as they are.

## What The Scores Mean

- `Synergy Score`: how well a candidate fits your allied champions
- `Counter Score`: how well a candidate performs into your enemy champions
- `Projected Win Rate`: the combined matchup win-rate estimate from the selected allies and enemies
- `Projected Agency`: the blended score you can switch to in the **Rank by** dropdown
- `PBI`: Lolalytics Pick Ban Influence for first-pick tier-list rows

Rows that rank highly by both active metrics are highlighted in the results table. Overlapping top results are highlighted in yellow.

## Limits

- Up to 5 allied champions
- Up to 5 enemy champions
- With no champions selected, fetching shows first-pick tier lists instead of draft-aware suggestions
- A champion can only appear once across both teams
- Ally role assignment is optional
- Build lookup needs 1 ally with an assigned role and all 5 enemy champions selected
- Rune import needs League pick/ban and at least 1 editable saved rune page
- Full-draft projection needs all 5 allies plus 5 unique ally roles
- Auto Import needs the Windows League Client in Normal Draft or Ranked champ select

## The Next Time You Use It

After the first setup, you usually only need:

```bash
npm start
```

Then open `http://localhost:3000`.

## How To Stop The App

Preferred method:

1. Click the red `X` in the top-right corner of the app.
2. Close the browser tab if you want.

Fallback:

1. Return to the terminal.
2. Press `Ctrl+C`.

## Common Problems

### `npm` is not recognized

Node.js is probably missing or was not installed correctly. Reinstall it from [https://nodejs.org](https://nodejs.org), then reopen the terminal.

### The browser page does not open

- Make sure `npm start` is still running
- Make sure you opened `http://localhost:3000`

### The app loads, but data fails to load

The app needs internet access and working Lolalytics responses. Wait a moment and try again.

### Auto Import says it is disabled

Make sure League is in Normal Draft or Ranked pick/ban on this Windows computer. Other modes, no active champ select, or a disconnected League Client will disable import without changing your current picks.

### The `Build` button is disabled

That button only works after the ally has an assigned role and all five enemy champions are selected.
Hover over the disabled button to see which requirement is still missing.

It combines matchup-specific build data for the full enemy team into one enemy-aware recommendation.

### Import Runes fails

Make sure League is currently in pick/ban and that your League account has at least one editable saved rune page. The app skips default Riot rune pages and only rewrites the first editable saved page.

### I expected one role, but the app shows others

The app fetches every role that is still unassigned. If you want fewer result roles, assign more ally roles before fetching.

### The main button says `Who will win?`

That is expected when all five allied champions are selected and all five ally roles are assigned.

### Port 3000 is already in use

Another app is already using that port. Ask someone technical to start this app on a different port.

## If You Want More Detail

For the developer view of how the app works, read [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md).
