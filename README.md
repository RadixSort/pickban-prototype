# PickBan Prototype

PickBan is a local League of Legends draft helper. It compares live Lolalytics data for first picks, open allied roles, full-draft outlooks, and matchup-aware builds.

It can also import a displayed rune page into the League Client. On Windows, optional Auto Import reads supported live champion selects and shows five lane-specific ban recommendations during bans.

This project is independent and is not affiliated with or endorsed by Riot Games or Lolalytics.

## Install and run

You need Node.js LTS, internet access, and a browser.

```bash
npm install
npm start
```

Open `http://localhost:3000` and leave the terminal running. After the first setup, `npm start` is normally all you need.

## Use the app

1. Click **Fetch Suggestions** with an empty draft for first-pick lists.
2. Add allies and enemies, assign any known ally roles, then fetch again for draft-aware suggestions.
3. Switch **Target role** to inspect each open role. Use **+** to add a result to the allied draft.
4. Choose **Champion Skill Level** and a table heading to change draft-aware ranking.
5. Click **Build** on an assigned ally after adding at least one enemy.
6. Click **Import Runes** on a build page while League is in champion select.
7. With five allies in five unique roles, click **Who will win?** for the team projection.

The app supports at most five champions per team and never allows the same champion on both teams.

### Scores

- **Synergy**: candidate performance with selected allies.
- **Counter**: candidate performance into selected enemies, weighted by expected lane matchup.
- **Projected Win Rate**: estimate for the selected skill level; the lighter value is base win rate.
- **Projected Agency**: Synergy + Counter; both inputs appear in lighter text.
- **PBI**: Lolalytics Pick Ban Influence, used for first-pick lists.

Draft-aware rows highlight the top ten projected win rates. Yellow marks picks that are also top ten in Projected Agency and remain top ten in projected win rate at Low, Average, and High skill.

## Auto Import (Windows)

Click **Auto Import** after the League Client enters Normal Draft, Ranked Solo/Duo, or Ranked Flex champion select. PickBan imports visible picks, allied hovers, and known ally roles while leaving manual selections alone unless live data conflicts.

During bans, the app shows one recommendation for each role:

1. Counter the allied hover in that role when valid counter data exists.
2. Otherwise use the role's highest eligible PBI champion.

Recommendations exclude allied pick intents, locked picks, and completed bans. The panel clears when bans end or champion select becomes unavailable. Unsupported queues and connection loss disable Auto Import without clearing manual picks.

## Requirements and limits

- **Build**: one ally with a role and one to five enemies.
- **Import Runes**: active League champion select and an editable saved rune page. PickBan overwrites the first editable page; it never creates or deletes pages.
- **Who will win?**: five allies with five unique roles; enemies are optional.
- **Auto Import**: Windows League Client in a supported champion-select queue.
- Live suggestions require working Lolalytics responses.

## Stop the app

Use the red **X** in the app or press `Ctrl+C` in the terminal.

## Troubleshooting

- **`npm` is not recognized**: install Node.js LTS, then reopen the terminal.
- **The page does not open**: confirm `npm start` is still running and use `http://localhost:3000`.
- **Data fails to load**: check internet access and retry; Lolalytics may be unavailable or may have changed its response format.
- **Build is disabled**: assign the ally a role and add an enemy. Hover the button for the missing requirement.
- **Rune import fails**: confirm League is in champion select and the account has an editable saved rune page.
- **Auto Import is disabled**: confirm the local Windows client is in a supported draft or ranked queue.

## Development

```bash
npm test
npm run bench:efficiency
```

See [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md) for architecture, request flows, caching, and external assumptions.

## License

The code is available under the [MIT License](LICENSE). The license does not grant rights to third-party names, trademarks, data, site content, or image URLs referenced by the app.
