# PickBan Prototype

PickBan is a local League of Legends draft helper. It compares live Lolalytics data for first picks, open allied roles, full-draft outlooks, and matchup-aware builds.

It can also import a displayed rune page into the League Client. On Windows, optional Auto Import reads supported champion selects, shows five lane-specific ban recommendations during bans, and follows the draft into the live game.

This project is independent and is not affiliated with or endorsed by Riot Games or Lolalytics.

## Install and run

You need Node.js LTS, internet access, and a browser.

```bash
npm install
npm start
```

Open `http://localhost:3000` and leave the terminal running. After the first setup, `npm start` is normally all you need.

## Use the app

Lolalytics lookups use the last 30 days. Rank filters cover All Ranks through Master+, with Emerald+ as the default. **Lane Weight** controls how strongly likely lane opponents affect champion recommendations. Defaults are ×1 for Support/Jungle, ×2 for Bot/Mid, and ×3 for Top.

1. Click **Fetch Suggestions** with an empty draft for first-pick lists.
2. Add allies and enemies, adjust any ally roles or enemy lanes, then fetch again for draft-aware suggestions.
3. Switch **Target role** to inspect each open role. Use **+** to add a result to the allied draft.
4. Set **Lane Weight** beside **Champion Skill Level**, then choose a table heading to change draft-aware ranking.
5. Click **Build** on an assigned ally after adding at least one enemy. Use **Counter Filter** portraits to isolate one or combine several enemy matchups.
6. Click **Import Runes** on a build page while League is in champion select.
7. With five allies in five unique roles, click **Who will win?** for the team projection.

The app supports at most five champions per team and never allows the same champion on both teams.

Rune pages are assembled element by element from the selected matchups. Automatic enemy lanes are unique and favor the champion with the higher lane probability; manual lane choices may duplicate. Bot and Support share a lane for weighting and lane-only builds.

The **Counter Filter** selects which enemy matchups feed every build section. Removing the final portrait or clicking × restores all enemies. Highest-win and most-picked rune and item columns can switch independently between all enemies and lane opponents.

### Scores

- **Synergy**: candidate performance with selected allies.
- **Counter**: candidate performance into selected enemies, weighted by expected lane matchup.
- **Projected Win Rate**: estimate for the selected skill level; the lighter value is base win rate.
- **Projected Agency**: Synergy + Counter; both inputs appear in lighter text.
- **PBI**: Lolalytics Pick Ban Influence, used for first-pick lists.

Draft-aware rows highlight the top ten projected win rates. Yellow marks picks that are also top ten in Projected Agency and remain top ten in projected win rate at Low, Average, and High skill.

## Auto Import (Windows)

Click **Auto Import** during Practice Tool, Normal Draft, Ranked Solo/Duo, or Ranked Flex champion select or a running game. The toolbar and build-popup controls share one import state.

During bans, the app shows one recommendation for each role:

1. Counter the allied hover in that role when valid counter data exists.
2. Otherwise use the role's highest eligible PBI champion.

Recommendations exclude allied pick intents, locked picks, and completed bans. The panel clears when bans end. During a game, Auto Import replaces speculative picks with live participants and refreshes build-gold ranks every 15 seconds. Hidden enemies retain their last observed inventory value.

The build popup also applies a live Counter Filter on each 15-second refresh:

- Before the selected ally owns a Legendary item, non-Junglers include only same-lane enemies; Junglers include all enemies.
- After the selected ally owns a Legendary item, only enemies ranked 1 through 5 in global build gold are included.
- If no enemy is in that global top five, all enemies are included.

Manual portrait changes last until the next live refresh. Unsupported queues and terminal game phases disable Auto Import without clearing manual picks; transitions and transient read failures retry.

Every build-popup request starts at Master+ and requires data for every enemy included by the Counter Filter, regardless of Auto Import status. If any included matchup is blank, PickBan retries the complete set at each lower rank tier until all included enemies succeed or All Ranks is reached. The popup shows the effective fallback tier when one is used.

## Requirements and limits

- **Build**: one ally with a role and one to five enemies.
- **Import Runes**: active League champion select and an editable saved rune page. PickBan overwrites the first editable page; it never creates or deletes pages.
- **Who will win?**: five allies with five unique roles; enemies are optional.
- **Auto Import**: Windows League Client in a supported champion-select or live-game queue.
- Live suggestions require working Lolalytics responses.

## Stop the app

Use the red **X** in the app or press `Ctrl+C` in the terminal.

## Troubleshooting

- **`npm` is not recognized**: install Node.js LTS, then reopen the terminal.
- **The page does not open**: confirm `npm start` is still running and use `http://localhost:3000`.
- **Data fails to load**: check internet access and retry; Lolalytics may be unavailable or may have changed its response format.
- **Build is disabled**: assign the ally a role and add an enemy. Hover the button for the missing requirement.
- **Rune import fails**: confirm League is in champion select and the account has an editable saved rune page.
- **Auto Import is disabled**: confirm the local Windows client is in Practice Tool or a supported draft, ranked champion select, or live game. During the game-start handoff, leave Auto Import on while PickBan retries the local live-data endpoint.

## Development

```bash
npm test
npm run bench:efficiency
```

See [docs/TECHNICAL_OVERVIEW.md](docs/TECHNICAL_OVERVIEW.md) for architecture, request flows, caching, and external assumptions.

## License

The code is available under the [MIT License](LICENSE). The license does not grant rights to third-party names, trademarks, data, site content, or image URLs referenced by the app.
