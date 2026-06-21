# PickBan Prototype

PickBan Prototype is a local League of Legends draft helper. It runs on your computer, opens in your browser, and uses live Lolalytics data to help compare picks during champion select.

The app can:

- show first-pick tier lists before any champions are selected
- suggest champions for allied roles that are still open
- estimate the full draft once all five allied roles are assigned
- show enemy-aware runes, summoner spells, items, and boots for one ally
- import a displayed rune page into the League Client during pick/ban
- on Windows, optionally import visible and hovered League pick/ban champions in Normal Draft or Ranked queues
- during Auto Import bans, show one ban recommendation for Top, Jungle, Mid, ADC, and Support

This project is independent and is not affiliated with or endorsed by Riot Games or Lolalytics.

## Before You Start

You need:

- this project folder on your computer
- internet access
- a web browser
- Node.js installed

## Install Node.js

1. Go to [https://nodejs.org](https://nodejs.org).
2. Download the LTS version.
3. Run the installer.

You only need to do this once per computer.

## Open The Project Folder

On macOS:

1. Open Terminal.
2. Type `cd `.
3. Drag the project folder into the Terminal window.
4. Press `Enter`.

Example:

```bash
cd /Users/your-name/Downloads/pickban-prototype
```

On Windows:

1. Open the project folder in File Explorer.
2. Click the address bar.
3. Type `powershell`.
4. Press `Enter`.

## Install The App

Run:

```bash
npm install
```

You usually only need this the first time, or again after the app has updated its dependencies.

## Start The App

Run:

```bash
npm start
```

Then open:

```text
http://localhost:3000
```

Leave the terminal window open while you use the app.

## How To Use It

1. Before any champion is selected, click **Fetch Suggestions** to see first-pick tier lists by role.
2. Add allied champions on the left.
3. Add enemy champions on the right.
4. If you know some ally roles already, assign them in the middle panel.
5. Click **Fetch Suggestions**.
6. Use the **Target role** dropdown in the results area to switch between returned role suggestions.
7. Click **+** on a result row to add that recommendation to the allied draft for the role you are viewing.
8. Sort first-pick rows with **PBI** or **Winrate**. Sort draft-aware rows with **Projected Win Rate** or **Projected Agency**.
9. After one ally has a role and at least one enemy champion is selected, click **Build** on that ally row to see matchup-aware build recommendations.
10. During League pick/ban, click **Import Runes** on a displayed rune page to overwrite the first editable saved League rune page as `import - Champion Name`.
11. If all five allies are selected and every ally role is assigned, click **Who will win?** to project the current draft.
12. On Windows, after League pick/ban starts, click **Auto Import** beside the rank selector to import the live phase, visible and hovered picks, and ally roles from the League Client.

## Auto Import

Auto Import only works while the League Client is running on the same Windows computer and the current pick/ban is Normal Draft or Ranked.

If it connects, a banner says champion picks are being imported. You can still edit picks and roles yourself; the app leaves manual edits alone unless the League Client later reveals conflicting live pick data. When the imported ally or enemy composition changes, the app refreshes the current suggestions automatically.

Hovered allied picks count as temporary allies while Auto Import is active. They disappear if that champion is banned, change when you hover a different intended pick, and give way to locked allied picks for the same role.

During the ban phase, a separate panel shows exactly one recommendation for Top, Jungle, Mid, ADC, and Support. Each lane follows this decision order:

1. If the allied player assigned to that lane is hovering an intended champion, recommend the highest-ranked counter to that champion for the same lane.
2. Otherwise, recommend the lane's highest-ranked PBI champion.

Missing or invalid lane and hover data uses the PBI fallback. Hover changes replace the affected recommendation, and the entire panel disappears as soon as Auto Import observes that the ban phase has ended. Normal pick-phase recommendations continue to use the existing draft-aware flow.

If Auto Import cannot find a supported live draft, loses the connection, or sees another game mode, the banner says import is disabled and your current selections stay as they are.

## What The Scores Mean

- `Synergy Score`: how well a candidate fits your allied champions
- `Counter Score`: how well a candidate performs into your enemy champions
- `Projected Win Rate`: the combined matchup win-rate estimate from the selected allies and enemies
- `Projected Agency`: the blended score available in the **Rank by** dropdown
- `PBI`: Lolalytics Pick Ban Influence for first-pick tier-list rows

Rows that rank highly by both active metrics are highlighted in yellow.

## Limits

- Up to 5 allied champions
- Up to 5 enemy champions
- A champion can only appear once across both teams
- Ally role assignment is optional until you want a full-draft projection
- With no champions selected, **Fetch Suggestions** shows first-pick tier lists instead of draft-aware suggestions
- **Build** needs 1 ally with an assigned role and 1 to 5 enemy champions selected
- **Import Runes** needs League pick/ban and at least 1 editable saved rune page
- **Who will win?** needs all 5 allies plus 5 unique ally roles
- **Auto Import** needs the Windows League Client in Normal Draft or Ranked champ select
- Ban recommendations require Auto Import and are visible only during the detected ban phase

## Next Time

After the first setup, you usually only need:

```bash
npm start
```

Then open `http://localhost:3000`.

## Stop The App

Preferred method:

1. Click the red `X` in the top-right corner of the app.
2. Close the browser tab if you want.

Fallback:

1. Return to the terminal.
2. Press `Ctrl+C`.

## Common Problems

### `npm` Is Not Recognized

Node.js is probably missing or was not installed correctly. Reinstall it from [https://nodejs.org](https://nodejs.org), then reopen the terminal.

### The Browser Page Does Not Open

- Make sure `npm start` is still running.
- Make sure you opened `http://localhost:3000`.

### Port 3000 Is Already In Use

Ask someone technical to start the app on a different port.

### Data Fails To Load

The app needs internet access and working Lolalytics responses. Wait a moment and try again.

### Auto Import Says It Is Disabled

Make sure League is in Normal Draft or Ranked pick/ban on this Windows computer. Other modes, no active champ select, or a disconnected League Client disable import without changing your current picks.

### Ban Recommendations Are Not Visible

The five-lane ban panel appears only while Auto Import detects an active ban turn. It is intentionally hidden during planning, picking, finalization, and after champion select ends.

### The `Build` Button Is Disabled

The button only works after the ally has an assigned role and at least one enemy champion is selected. Hover over the disabled button to see which requirement is still missing.

### Import Runes Fails

Make sure League is currently in pick/ban and that your League account has at least one editable saved rune page. The app skips default Riot rune pages and only rewrites the first editable saved page.

### I Expected One Role, But The App Shows Others

The app fetches every role that is still unassigned. Assign more ally roles before fetching if you want fewer result roles.

### The Main Button Says `Who will win?`

That is expected when all five allied champions are selected and all five ally roles are assigned.

## Developer Details

For the technical map of the project, read [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md).

## License

This repository is open source under the [MIT License](LICENSE).

The MIT license applies only to the original code in this repository. It does not grant rights to third-party names, trademarks, data, or media, including Riot Games and League of Legends marks or any Lolalytics data, site content, or icon URLs referenced by the app.
