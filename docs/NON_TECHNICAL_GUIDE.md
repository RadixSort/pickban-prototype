# Non-Technical Guide

This guide is for someone who wants to run the app locally without needing to understand the code.

The app uses live Lolalytics data and is built independently with appreciation for their matchup and tier-list work.

## What The App Does

The app helps you compare champion options for any role that is still open in your draft.

It also has a smaller matchup-specific workflow for rune and boots suggestions after you assign a role to one allied champion.

You choose:

- allied champions
- enemy champions
- any ally roles you already know

Then the app fetches suggestions for every role that is still unassigned and lets you switch between those role results.

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

1. Add allied champions on the left.
2. Add enemy champions on the right.
3. If you know some ally roles already, assign them in the middle panel.
4. Click **Fetch Suggestions**.
5. Use the **Target role** dropdown in the results area to switch between the returned role suggestions.
6. Click **+** on a result row if you want to add that recommendation into the allied draft for the role you are currently viewing.
7. Results default to **Projected Win Rate**. Use **Rank by** if you want to switch to **Projected Agency**.
8. If one ally already has a role and you have picked at least one enemy, click **Runes & Boots** on that ally row to open matchup build suggestions.

## What The Scores Mean

- `Synergy Score`: how well a candidate fits your allied champions
- `Counter Score`: how well a candidate performs into your enemy champions
- `Projected Win Rate`: the combined matchup win-rate estimate from the selected allies and enemies
- `Projected Agency`: the blended score you can switch to in the **Rank by** dropdown

## Limits

- Up to 5 allied champions
- Up to 5 enemy champions
- At least 1 champion must be selected before fetching
- A champion can only appear once across both teams
- Ally role assignment is optional

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

### The app loads, but suggestions fail

The app needs internet access and working Lolalytics responses. Wait a moment and try again.

### The `Runes & Boots` button is disabled

That button only works after:

- at least one enemy champion is selected
- the ally has an assigned role

### I expected one role, but the app shows others

The app fetches every role that is still unassigned. If you want fewer result roles, assign more ally roles before fetching.

### Port 3000 is already in use

Another app is already using that port. Ask someone technical to start this app on a different port.

## If You Want More Detail

For the developer view of how the app works, read [TECHNICAL_OVERVIEW.md](TECHNICAL_OVERVIEW.md).
