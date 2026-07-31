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

Lolalytics lookups use the last 30 days. The rank filter supports All Ranks, Gold+, Platinum+, Emerald+, Diamond+, D2+, and Master+; Emerald+ is the default. The **Lane Weight ×1/×2/×3/×4** control sets how strongly likely lane opponents influence champion recommendations. Defaults follow the viewed role: Support and Jungle use ×1, Bot and Mid use ×2, and Top uses ×3. A manual weight remains selected while switching between roles with the same default; switching to a role with a different default selects that role's default.

1. Click **Fetch Suggestions** with an empty draft for first-pick lists.
2. Add allies and enemies, adjust any ally roles or enemy lanes, then fetch again for draft-aware suggestions.
3. Switch **Target role** to inspect each open role. Use **+** to add a result to the allied draft.
4. Set **Lane Weight** beside **Champion Skill Level**, then choose a table heading to change draft-aware ranking.
5. Click **Build** on an assigned ally after adding at least one enemy. Use **Counter Filter** portraits to isolate one or combine several enemy matchups.
6. Click **Import Runes** on a build page while League is in champion select.
7. With five allies in five unique roles, click **Who will win?** for the team projection.

The app supports at most five champions per team and never allows the same champion on both teams.

Rune recommendations combine the pick frequency and win rate of each rune element across the selected enemy matchups. The app builds the highest-win and most-picked pages element by element instead of choosing one observed complete page.

Automatic enemy lanes are unique: when champions compete for a lane, the higher Lolalytics lane probability gets priority and the other champion moves to its next available lane. Use an enemy's lane selector to correct a speculative assignment; manual choices remain fixed and may intentionally duplicate another enemy lane. Bottom and Support count as the same lane for champion-suggestion weighting. If none of the selected enemies occupies the target lane, PickBan still assigns the most likely off-meta enemy as one lane opponent.

Fetching champion recommendations preloads and caches every Lane Weight variant for the current draft. Build recommendations incorporate each included enemy matchup once and request the matchup for the lane assigned to that enemy. The **Counter Filter** stays pinned above the build content while the popup scrolls. Every enemy portrait starts selected; clicking a portrait removes or restores that enemy, while removing the final selected portrait or clicking the always-visible red **×** restores the complete selection. The current content and scroll position remain anchored while an uncached filter subset loads. The × is disabled while all enemies are already included. Filtered subsets are cached for the page session. Each of the **Highest Win** and **Most Picked** rune pages and item paths can independently switch between **All enemies** and **Lane only**; a Support or Bot lane-only recommendation combines both enemy Support and Bot matchups.

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
