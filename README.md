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

Fetching champion recommendations preloads and caches every Lane Weight variant for the current draft. Build recommendations incorporate each included enemy matchup once and request the matchup for the lane assigned to that enemy. The compact **Counter Filter** stays pinned and left-aligned over the build content while the popup scrolls, with its full layout visible without a filter-owned scrollbar. The layout button sits to the right of the horizontal controls and switches them to a top-left-aligned vertical stack; in vertical mode the button moves below the stack, and pressing it again restores the horizontal layout. This visual change does not move or resize the recommendation content. Text remains horizontal, and the horizontal layout preserves the control order from the red **×**, through the enemy portraits, to enemy build gold, the colon, allied build gold, and the coin. The filter itself has no background; only the single-row gold scoreboard uses a small opaque, portrait-bordered surface for legibility. In vertical mode the coin moves to the left of the enemy and allied totals. The scoreboard remains visible as **0.0k : 0.0k** without live data and shows full enemy and allied team totals in one-decimal thousands (for example, **21.3k**) when a complete live snapshot is available. Clicking a portrait removes or restores that enemy, while removing the final selected portrait or clicking the always-visible × restores the complete selection. The current content and scroll position remain anchored while an uncached filter subset loads. The × is disabled while all enemies are already included. Filtered subsets are cached for the page session. Each of the **Highest Win** and **Most Picked** rune pages and item paths can independently switch between **All enemies** and **Lane only**; a Support or Bot lane-only recommendation combines both enemy Support and Bot matchups.

### Scores

- **Synergy**: candidate performance with selected allies.
- **Counter**: candidate performance into selected enemies, weighted by expected lane matchup.
- **Projected Win Rate**: estimate for the selected skill level; the lighter value is base win rate.
- **Projected Agency**: Synergy + Counter; both inputs appear in lighter text.
- **PBI**: Lolalytics Pick Ban Influence, used for first-pick lists.

Draft-aware rows highlight the top ten projected win rates. Yellow marks picks that are also top ten in Projected Agency and remain top ten in projected win rate at Low, Average, and High skill.

## Auto Import (Windows)

Click **Auto Import** in the main toolbar or at the top of the build popup after the League Client enters Practice Tool, Normal Draft, Ranked Solo/Duo, or Ranked Flex champion select, or while a game in one of those queues is already running. Both controls share the same import state. PickBan imports visible picks, allied hovers, and known ally roles during champion select.

During bans, the app shows one recommendation for each role:

1. Counter the allied hover in that role when valid counter data exists.
2. Otherwise use the role's highest eligible PBI champion.

Recommendations exclude allied pick intents, locked picks, and completed bans. The panel clears when bans end.

Once the game starts, Auto Import replaces speculative enemy champions and lanes with the live participants. It then refreshes every player's inventory every 15 seconds, totals the full shop cost of every held item (including components and consumable stacks), and assigns deterministic global ranks from 1 (highest build value) downward. If an enemy becomes hidden and the live feed omits or clears that inventory, PickBan keeps the last observed value instead of replacing it with zero. Build recommendation portraits show those rank numbers for the selected ally and every enemy.

The build popup also applies a live Counter Filter on each 15-second refresh:

- Before the selected ally owns a Legendary item, non-Junglers include only enemies in that ally's lane; Bot and Support share one lane. Junglers instead include all five enemies equally. Selling every Legendary item restores the applicable pre-item rule on the next live refresh without hiding build-gold ranks.
- After the selected ally owns a Legendary item, only enemies ranked 1 through 5 in global build gold are included.
- If no enemy is in that global top five, all enemies are included.

Changing portraits manually overrides the automatic subset until the next 15-second refresh, when the live filter is applied again. The best-ranked enemy keeps a yellow portrait border even when that enemy is filtered out. Unsupported queues and terminal gameflow phases disable Auto Import without clearing manual picks. A live-data handoff or transient in-game read failure keeps Auto Import active and retries.

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
