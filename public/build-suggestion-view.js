(function initializeBuildSuggestionView(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./summoner-spell-metadata.js"));
    return;
  }

  globalScope.buildSuggestionView = factory(globalScope.summonerSpellMetadata || {});
})(
  typeof globalThis !== "undefined" ? globalThis : this,
  (summonerSpellMetadata = {}) => {
  const DEFAULT_BUILD_SUGGESTION_TAB = "summary";
  const DEFAULT_ITEM_RECOMMENDATION_SCOPE = "allEnemies";
  const LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE = "laneOpponents";
  const DEFAULT_RUNE_RECOMMENDATION_SCOPE = DEFAULT_ITEM_RECOMMENDATION_SCOPE;
  const LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE =
    LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE;
  const BUILD_SUGGESTION_TABS = [{ value: "summary", label: "Summary" }];
  const validTabs = new Set(BUILD_SUGGESTION_TABS.map((tab) => tab.value));
  const buildSummonerSpellIconUrl =
    typeof summonerSpellMetadata.buildSummonerSpellIconUrl === "function"
      ? summonerSpellMetadata.buildSummonerSpellIconUrl
      : () => "";
  const getSummonerSpellName =
    typeof summonerSpellMetadata.getSummonerSpellName === "function"
      ? summonerSpellMetadata.getSummonerSpellName
      : () => "";
  function normalizeBuildSuggestionTab(value) {
    return validTabs.has(value) ? value : DEFAULT_BUILD_SUGGESTION_TAB;
  }

  /**
   * Render the cached `/build-suggestions` payload into the summary-only modal
   * layout used by the current browser UI.
   */
  function renderBuildSuggestionBody(
    payload,
    activeTab = DEFAULT_BUILD_SUGGESTION_TAB,
    options = {},
  ) {
    void activeTab;

    if (!payload || typeof payload !== "object") {
      return renderEmptyState("Select an ally with a role, then load build recommendations.");
    }

    const runeNotes = Array.isArray(payload?.runes?.highlighting?.notes)
      ? payload.runes.highlighting.notes
      : [];
    const spellNotes = Array.isArray(payload?.spells?.highlighting?.notes)
      ? payload.spells.highlighting.notes
      : [];
    const startingItemNotes = Array.isArray(payload?.startingItems?.highlighting?.notes)
      ? payload.startingItems.highlighting.notes
      : [];
    const skillPriorityNotes = Array.isArray(payload?.skillPriority?.highlighting?.notes)
      ? payload.skillPriority.highlighting.notes
      : [];
    const slotGroups = Array.isArray(payload?.runes?.overview?.slotGroups)
      ? payload.runes.overview.slotGroups
      : [];
    const highestWinPage = payload?.runes?.highestWinPage || null;
    const mostPickedPage = payload?.runes?.mostPickedPage || null;
    const laneOpponentHighestWinPage =
      payload?.runes?.laneOpponents?.highestWinPage || null;
    const laneOpponentMostPickedPage =
      payload?.runes?.laneOpponents?.mostPickedPage || null;
    const laneOpponentSlotGroups = Array.isArray(
      payload?.runes?.laneOpponents?.overview?.slotGroups,
    )
      ? payload.runes.laneOpponents.overview.slotGroups
      : [];
    const highestWinSpellSet = payload?.spells?.highestWinSet || null;
    const mostPickedSpellSet = payload?.spells?.mostPickedSet || null;
    const highestWinStartingItemSet = payload?.startingItems?.highestWinSet || null;
    const mostPickedStartingItemSet = payload?.startingItems?.mostPickedSet || null;
    const highestWinSkill = payload?.skillPriority?.highestWinSkill || null;
    const mostPickedSkill = payload?.skillPriority?.mostPickedSkill || null;
    const highestWinItemBuild = payload?.items?.highestWinBuild || null;
    const mostPickedItemBuild = payload?.items?.mostPickedBuild || null;
    const laneOpponentHighestWinItemBuild =
      payload?.items?.laneOpponents?.highestWinBuild || null;
    const laneOpponentMostPickedItemBuild =
      payload?.items?.laneOpponents?.mostPickedBuild || null;
    const boots = Array.isArray(payload?.boots?.options) ? payload.boots.options : [];

    return renderSummaryPanel({
      highestWinPage,
      mostPickedPage,
      laneOpponentHighestWinPage,
      laneOpponentMostPickedPage,
      highestWinSpellSet,
      mostPickedSpellSet,
      highestWinStartingItemSet,
      mostPickedStartingItemSet,
      highestWinSkill,
      mostPickedSkill,
      highestWinItemBuild,
      mostPickedItemBuild,
      laneOpponentHighestWinBuild: laneOpponentHighestWinItemBuild,
      laneOpponentMostPickedBuild: laneOpponentMostPickedItemBuild,
      itemRecommendationScopes: normalizeItemRecommendationScopes(
        options?.itemRecommendationScopes,
      ),
      completedLegendaryItemCount: normalizeCompletedLegendaryItemCount(
        options?.completedLegendaryItemCount,
      ),
      runeRecommendationScopes: normalizeRuneRecommendationScopes(
        options?.runeRecommendationScopes,
      ),
      boots,
      notes: [...runeNotes, ...spellNotes, ...startingItemNotes, ...skillPriorityNotes],
      runeImportStatesByPageKey: normalizeRuneImportStates(options?.runeImportStatesByPageKey),
      slotGroupMap: buildSlotGroupMap(slotGroups),
      laneOpponentSlotGroupMap: buildSlotGroupMap(laneOpponentSlotGroups),
    });
  }

  function renderSummaryPanel({
    highestWinPage,
    mostPickedPage,
    laneOpponentHighestWinPage,
    laneOpponentMostPickedPage,
    highestWinSpellSet,
    mostPickedSpellSet,
    highestWinStartingItemSet,
    mostPickedStartingItemSet,
    highestWinSkill,
    mostPickedSkill,
    highestWinItemBuild,
    mostPickedItemBuild,
    laneOpponentHighestWinBuild,
    laneOpponentMostPickedBuild,
    itemRecommendationScopes,
    completedLegendaryItemCount,
    runeRecommendationScopes,
    boots,
    notes,
    runeImportStatesByPageKey,
    slotGroupMap,
    laneOpponentSlotGroupMap,
  }) {
    const runeRecommendations = buildRuneRecommendationColumns({
      highestWinPage,
      mostPickedPage,
      laneOpponentHighestWinPage,
      laneOpponentMostPickedPage,
      runeRecommendationScopes,
      slotGroupMap,
      laneOpponentSlotGroupMap,
    });
    const spellRecommendations = buildRecommendedSpellSets(
      highestWinSpellSet,
      mostPickedSpellSet,
    );
    const startingItemRecommendations = buildRecommendedStartingItemSets(
      highestWinStartingItemSet,
      mostPickedStartingItemSet,
    );
    const skillPriorityRecommendations = buildRecommendedSkillPriorities(
      highestWinSkill,
      mostPickedSkill,
    );
    const highlightedBoots = getHighlightedOptions(boots, "itemId");
    const hasAnyContent =
      runeRecommendations.some((recommendation) => recommendation.page) ||
      spellRecommendations.length > 0 ||
      startingItemRecommendations.length > 0 ||
      skillPriorityRecommendations.length > 0 ||
      highestWinItemBuild ||
      mostPickedItemBuild ||
      highlightedBoots.length > 0;

    if (!hasAnyContent) {
      return `
        <div class="build-view build-view--summary">
          ${renderInlineNotes(notes)}
          ${renderEmptyState("No build recommendation data is available.")}
        </div>
      `;
    }

    return `
      <div class="build-view build-view--summary">
        ${renderInlineNotes(notes)}
        ${renderBuildSummaryGlobalNote()}
        <div class="build-summary-top-grid">
          <div class="build-summary-rune-stack">
            ${renderRuneRecommendationsSection(
              runeRecommendations,
              runeImportStatesByPageKey,
            )}
            ${renderSpellRecommendationsSection(spellRecommendations)}
          </div>
          <div class="build-summary-side-stack">
            ${renderStartingItemsSection(startingItemRecommendations)}
            ${renderSkillPrioritySection(skillPriorityRecommendations)}
            ${renderBootsSection(highlightedBoots)}
          </div>
        </div>
        ${renderItemsSection({
          highestWinBuild: highestWinItemBuild,
          mostPickedBuild: mostPickedItemBuild,
          laneOpponentHighestWinBuild,
          laneOpponentMostPickedBuild,
          itemRecommendationScopes,
          completedLegendaryItemCount,
        })}
      </div>
    `;
  }

  function renderSummaryPageColumn({
    title,
    tone,
    page,
    runeImportStatesByPageKey,
    slotGroupMap,
    scope,
    canToggleScope,
    emptyMessage,
  }) {
    if (!page) {
      return `
        <section class="build-summary-column build-summary-column--${escapeAttribute(tone)}">
          <header class="build-summary-column-header">
            <div class="build-summary-column-header-top">
              <div class="build-summary-column-heading">
                <span class="build-summary-kicker">${escapeHtml(title)}</span>
                <h3>${escapeHtml(title)}</h3>
              </div>
              <div class="build-summary-column-actions">
                ${renderRuneRecommendationScopeToggle({
                  title,
                  tone,
                  scope,
                  disabled: !canToggleScope,
                })}
              </div>
            </div>
          </header>
          <div class="build-summary-column-empty">${escapeHtml(emptyMessage)}</div>
        </section>
      `;
    }

    const primaryRunes = hydrateRuneSelections(page?.selections?.primary, "primary", slotGroupMap);
    const secondaryRunes = hydrateRuneSelections(
      page?.selections?.secondary,
      "secondary",
      slotGroupMap,
    );
    const modifiers = Array.isArray(page?.selections?.modifiers) ? page.selections.modifiers : [];
    const pageKey = getRecommendationPageKey(page);
    const runeImportState = pageKey ? runeImportStatesByPageKey[pageKey] || null : null;

    return `
      <section class="build-summary-column build-summary-column--${escapeAttribute(tone)}">
        <header class="build-summary-column-header">
          <div class="build-summary-column-header-top">
            <div class="build-summary-column-heading">
              <span class="build-summary-kicker">${escapeHtml(title)}</span>
              <h3>${escapeHtml(getPageTitle(page))}</h3>
            </div>
            <div class="build-summary-column-actions">
              ${renderRuneImportAction(pageKey, runeImportState)}
              ${renderRuneRecommendationScopeToggle({
                title,
                tone,
                scope,
                disabled: !canToggleScope,
              })}
            </div>
          </div>
          <div class="build-summary-metric-grid">
            ${renderSummaryMetric(
              page.isComposite ? "Avg Win" : "Win",
              formatPercent(page.winRate),
              "win",
            )}
            ${renderSummaryMetric(
              page.isComposite ? "Avg Pick" : "Pick",
              formatPercent(page.pickRate),
              "pick",
            )}
            ${renderSummaryMetric(
              page.isComposite ? "Avg Games" : "Games",
              formatCount(page.games),
              "games",
            )}
          </div>
          ${page.isComposite ? '<p class="build-summary-caption">Composed from individual rune performance across matchups.</p>' : ""}
          ${renderRuneImportStatus(runeImportState)}
        </header>
        <div class="build-summary-section-list">
          ${renderRuneSection("Primary Runes", primaryRunes)}
          ${renderRuneSection("Secondary Runes", secondaryRunes)}
          ${renderCompactSection("Mods", modifiers)}
        </div>
      </section>
    `;
  }

  function renderRuneRecommendationsSection(
    recommendations,
    runeImportStatesByPageKey = {},
  ) {
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return `
        <section class="build-items-panel" aria-label="Recommended runes">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Runes</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">
            No complete rune recommendations were available.
          </div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended runes">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Runes</h3>
          </div>
        </header>
        <div class="build-summary-board${recommendations.length === 1 ? " build-summary-board--single" : ""}">
          ${recommendations
            .map((recommendation) =>
              renderSummaryPageColumn({
                ...recommendation,
                runeImportStatesByPageKey,
                emptyMessage: "",
              }),
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function renderSpellRecommendationsSection(recommendations) {
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return `
        <section class="build-items-panel" aria-label="Recommended summoner spells">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Summoner Spells</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">
            No summoner spell recommendations were available.
          </div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended summoner spells">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Summoner Spells</h3>
          </div>
        </header>
        <div class="build-spell-card-list build-spell-card-list--spells${recommendations.length === 1 ? " build-spell-card-list--single" : ""}">
          ${recommendations.map((spellSet) => renderSpellSetCard(spellSet)).join("")}
        </div>
      </section>
    `;
  }

  function renderStartingItemsSection(recommendations) {
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return `
        <section class="build-items-panel" aria-label="Recommended starting items">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Starting Items</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">
            No starting item recommendations were available.
          </div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended starting items">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Starting Items</h3>
          </div>
        </header>
        <div class="build-spell-card-list">
          ${recommendations.map((itemSet) => renderStartingItemSetCard(itemSet)).join("")}
        </div>
      </section>
    `;
  }

  function renderSkillPrioritySection(recommendations) {
    if (!Array.isArray(recommendations) || recommendations.length === 0) {
      return `
        <section class="build-items-panel" aria-label="Recommended skill max priority">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Skill Max Priority</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">
            No skill max priority recommendations were available.
          </div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended skill max priority">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Skill Max Priority</h3>
          </div>
        </header>
        <div class="build-skill-priority-list${recommendations.length === 1 ? " build-skill-priority-list--single" : ""}">
          ${recommendations.map((skill) => renderSkillPriorityCard(skill)).join("")}
        </div>
      </section>
    `;
  }

  function renderBootsSection(boots) {
    if (!Array.isArray(boots) || boots.length === 0) {
      return `
        <section class="build-items-panel" aria-label="Recommended boots">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Boots</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">No completed boots data was available.</div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended boots">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Boots</h3>
          </div>
        </header>
        <div class="build-summary-boot-list">
          ${boots.map((boot) => renderCompactBootCard(boot)).join("")}
        </div>
      </section>
    `;
  }

  function renderItemsSection({
    highestWinBuild,
    mostPickedBuild,
    laneOpponentHighestWinBuild,
    laneOpponentMostPickedBuild,
    itemRecommendationScopes,
    completedLegendaryItemCount,
  }) {
    const hasItems =
      Array.isArray(highestWinBuild?.selections) || Array.isArray(mostPickedBuild?.selections);

    if (!hasItems) {
      return `
        <section class="build-items-panel" aria-label="Recommended items">
          <header class="build-items-panel-header">
            <div class="build-items-panel-heading">
              <h3>Items</h3>
            </div>
            <p class="build-summary-caption">Five non-boot purchases in order.</p>
          </header>
          <div class="build-summary-column-empty">No ordered item path data was available.</div>
        </section>
      `;
    }

    return `
      <section class="build-items-panel" aria-label="Recommended items">
        <header class="build-items-panel-header">
          <div class="build-items-panel-heading">
            <h3>Items</h3>
          </div>
          <p class="build-summary-caption">Five non-boot purchases in order.</p>
        </header>
        <div class="build-items-grid">
          ${renderItemBuildColumn({
            title: "Highest Win",
            tone: "highest-win",
            build: getScopedItemBuild(
              itemRecommendationScopes.highestWin,
              highestWinBuild,
              laneOpponentHighestWinBuild,
            ),
            scope: itemRecommendationScopes.highestWin,
            canToggleScope: Boolean(laneOpponentHighestWinBuild),
            completedLegendaryItemCount,
            emptyMessage: "No highest-win item path was available.",
          })}
          ${renderItemBuildColumn({
            title: "Most Picked",
            tone: "most-picked",
            build: getScopedItemBuild(
              itemRecommendationScopes.mostPicked,
              mostPickedBuild,
              laneOpponentMostPickedBuild,
            ),
            scope: itemRecommendationScopes.mostPicked,
            canToggleScope: Boolean(laneOpponentMostPickedBuild),
            completedLegendaryItemCount,
            emptyMessage: "No most-picked item path was available.",
          })}
        </div>
      </section>
    `;
  }

  function renderItemBuildColumn({
    title,
    tone,
    build,
    scope,
    canToggleScope,
    completedLegendaryItemCount,
    emptyMessage,
  }) {
    const selections = getOrderedSelections(build?.selections);
    const header = `
      <header class="build-item-column-header">
        <h4>${escapeHtml(title)}</h4>
        ${renderItemRecommendationScopeToggle({
          title,
          tone,
          scope,
          disabled: !canToggleScope,
        })}
      </header>
    `;

    if (selections.length === 0) {
      return `
        <section class="build-item-column build-item-column--${escapeAttribute(tone)}">
          ${header}
          <div class="build-summary-column-empty">${escapeHtml(emptyMessage)}</div>
        </section>
      `;
    }

    return `
      <section class="build-item-column build-item-column--${escapeAttribute(tone)}">
        ${header}
        <div class="build-item-list">
          ${selections
            .map((selection, index) =>
              renderItemCard(selection, index + 1, {
                completed: index < completedLegendaryItemCount,
              }),
            )
            .join("")}
        </div>
      </section>
    `;
  }

  function normalizeItemRecommendationScopes(scopes = {}) {
    return {
      highestWin: normalizeItemRecommendationScope(scopes?.highestWin),
      mostPicked: normalizeItemRecommendationScope(scopes?.mostPicked),
    };
  }

  function normalizeCompletedLegendaryItemCount(value) {
    const count = Number(value);
    return Number.isInteger(count) && count > 0 ? Math.min(count, 5) : 0;
  }

  function buildRuneRecommendationColumns({
    highestWinPage,
    mostPickedPage,
    laneOpponentHighestWinPage,
    laneOpponentMostPickedPage,
    runeRecommendationScopes,
    slotGroupMap,
    laneOpponentSlotGroupMap,
  }) {
    return [
      buildRuneRecommendationColumn({
        title: "Highest Win",
        tone: "highest-win",
        scope: runeRecommendationScopes.highestWin,
        allEnemiesPage: highestWinPage,
        laneOpponentPage: laneOpponentHighestWinPage,
        slotGroupMap,
        laneOpponentSlotGroupMap,
      }),
      buildRuneRecommendationColumn({
        title: "Most Picked",
        tone: "most-picked",
        scope: runeRecommendationScopes.mostPicked,
        allEnemiesPage: mostPickedPage,
        laneOpponentPage: laneOpponentMostPickedPage,
        slotGroupMap,
        laneOpponentSlotGroupMap,
      }),
    ];
  }

  function buildRuneRecommendationColumn({
    title,
    tone,
    scope,
    allEnemiesPage,
    laneOpponentPage,
    slotGroupMap,
    laneOpponentSlotGroupMap,
  }) {
    const normalizedScope = normalizeRuneRecommendationScope(scope);
    const isLaneOnly =
      normalizedScope === LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE &&
      Boolean(laneOpponentPage);

    return {
      title,
      tone,
      page: isLaneOnly ? laneOpponentPage : allEnemiesPage,
      scope: isLaneOnly
        ? LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE
        : DEFAULT_RUNE_RECOMMENDATION_SCOPE,
      canToggleScope: Boolean(laneOpponentPage),
      slotGroupMap: isLaneOnly ? laneOpponentSlotGroupMap : slotGroupMap,
    };
  }

  function normalizeRuneRecommendationScopes(scopes = {}) {
    return {
      highestWin: normalizeRuneRecommendationScope(scopes?.highestWin),
      mostPicked: normalizeRuneRecommendationScope(scopes?.mostPicked),
    };
  }

  function normalizeRuneRecommendationScope(scope) {
    return scope === LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE
      ? LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE
      : DEFAULT_RUNE_RECOMMENDATION_SCOPE;
  }

  function normalizeItemRecommendationScope(scope) {
    return scope === LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE
      ? LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE
      : DEFAULT_ITEM_RECOMMENDATION_SCOPE;
  }

  function getScopedItemBuild(scope, allEnemiesBuild, laneOpponentBuild) {
    return normalizeItemRecommendationScope(scope) ===
      LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE && laneOpponentBuild
      ? laneOpponentBuild
      : allEnemiesBuild;
  }

  function renderItemRecommendationScopeToggle({
    title,
    tone,
    scope,
    disabled,
  }) {
    const normalizedScope = normalizeItemRecommendationScope(scope);
    const isLaneOnly =
      normalizedScope === LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE;
    const currentLabel = isLaneOnly ? "Lane only" : "All enemies";
    const nextLabel = isLaneOnly ? "all enemies" : "lane opponents only";

    return `
      <button
        type="button"
        class="build-item-scope-toggle"
        data-item-scope-tone="${escapeAttribute(tone)}"
        data-item-scope="${escapeAttribute(normalizedScope)}"
        aria-label="${escapeAttribute(`${title}: showing ${currentLabel.toLowerCase()}. Switch to ${nextLabel}.`)}"
        title="Switch to ${escapeAttribute(nextLabel)}"
        ${disabled ? "disabled" : ""}
      >
        <span>${escapeHtml(currentLabel)}</span>
        <span class="build-item-scope-toggle-icon" aria-hidden="true">&#8644;</span>
      </button>
    `;
  }

  function renderRuneRecommendationScopeToggle({
    title,
    tone,
    scope,
    disabled,
  }) {
    const normalizedScope = normalizeRuneRecommendationScope(scope);
    const isLaneOnly =
      normalizedScope === LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE;
    const currentLabel = isLaneOnly ? "Lane only" : "All enemies";
    const nextLabel = isLaneOnly ? "all enemies" : "lane opponents only";

    return `
      <button
        type="button"
        class="build-item-scope-toggle build-rune-scope-toggle"
        data-rune-scope-tone="${escapeAttribute(tone)}"
        data-rune-scope="${escapeAttribute(normalizedScope)}"
        aria-label="${escapeAttribute(`${title} runes: showing ${currentLabel.toLowerCase()}. Switch to ${nextLabel}.`)}"
        title="Switch to ${escapeAttribute(nextLabel)}"
        ${disabled ? "disabled" : ""}
      >
        <span>${escapeHtml(currentLabel)}</span>
        <span class="build-item-scope-toggle-icon" aria-hidden="true">&#8644;</span>
      </button>
    `;
  }

  function hydrateRuneSelections(selections, side, slotGroupMap) {
    return getOrderedSelections(selections).map((selection) => ({
      ...selection,
      ...lookupSelectionRates(side, selection, slotGroupMap),
    }));
  }

  function getOrderedSelections(selections) {
    if (!Array.isArray(selections)) {
      return [];
    }

    return selections
      .filter((selection) => selection && (selection.icon || selection.name))
      .map((selection, index) => ({ ...selection, displayIndex: index }))
      .sort((left, right) => {
        const leftSlot = Number.isInteger(left?.slotIndex) ? left.slotIndex : Number.MAX_SAFE_INTEGER;
        const rightSlot = Number.isInteger(right?.slotIndex) ? right.slotIndex : Number.MAX_SAFE_INTEGER;

        if (leftSlot !== rightSlot) {
          return leftSlot - rightSlot;
        }

        return left.displayIndex - right.displayIndex;
      });
  }

  function buildSlotGroupMap(slotGroups) {
    const map = new Map();

    slotGroups.forEach((group) => {
      if (!group?.key) {
        return;
      }

      map.set(group.key, group);
    });

    return map;
  }

  function lookupSelectionRates(side, selection, slotGroupMap) {
    const slotIndex = Number(selection?.slotIndex);
    if (!Number.isInteger(slotIndex)) {
      return {
        matchedWinRate: null,
        matchedPickRate: null,
      };
    }

    const groupKey = `${side}-slot-${slotIndex}`;
    const group = slotGroupMap.get(groupKey);
    const option = Array.isArray(group?.options)
      ? group.options.find((candidate) => candidate?.id === selection?.id) || null
      : null;

    return {
      matchedWinRate: option?.winRate ?? null,
      matchedPickRate: option?.pickRate ?? null,
    };
  }

  function renderRuneSection(label, selections) {
    if (!Array.isArray(selections) || selections.length === 0) {
      return "";
    }

    return `
      <section class="build-summary-section">
        <span class="build-summary-section-label">${escapeHtml(label)}</span>
        <div class="build-rune-card-grid">
          ${selections.map((selection) => renderRuneCard(selection)).join("")}
        </div>
      </section>
    `;
  }

  function renderRuneCard(selection) {
    return `
      <article class="build-rune-card" title="${escapeAttribute(selection?.name || "Rune")}">
        <img
          src="${escapeAttribute(selection?.icon || "")}"
          alt="${escapeAttribute(selection?.name || "Rune")}"
          width="40"
          height="40"
        />
        <div class="build-rune-card-copy">
          <strong>${escapeHtml(selection?.name || "Unknown")}</strong>
          <div class="build-rune-card-stats">
            ${renderRuneCardStat(selection?.matchedWinRate, "win")}
            ${renderRuneCardStat(selection?.matchedPickRate, "pick")}
          </div>
        </div>
      </article>
    `;
  }

  function renderRuneCardStat(value, tone) {
    return `
      <span class="build-rune-card-stat build-rune-card-stat--${escapeAttribute(tone)}">
        ${escapeHtml(formatPercent(value))} ${escapeHtml(tone)}
      </span>
    `;
  }

  function renderItemCard(selection, orderNumber, { completed = false } = {}) {
    const alternative = selection?.alternative || null;
    const itemNames = [selection?.name, alternative?.name].filter(Boolean);
    const completionDescription = completed ? "Completed build row. " : "";

    return `
      <article
        class="build-item-card${completed ? " build-item-card--completed" : ""}"
        title="${escapeAttribute(itemNames.join(" or ") || "Item")}"
        aria-label="${escapeAttribute(
          `${completionDescription}Build row ${orderNumber}: ${itemNames.join(" or ") || "unknown item"}.`,
        )}"
      >
        <span class="build-item-card-order" aria-hidden="true">${escapeHtml(String(orderNumber))}</span>
        <div class="build-item-card-options">
          ${renderItemCardOption(selection, "A")}
          ${
            alternative
              ? `<span class="build-item-card-or" aria-hidden="true">or</span>${renderItemCardOption(alternative, "B")}`
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderItemCardOption(selection, optionLabel) {
    return `
      <div class="build-item-card-option">
        <div class="build-item-card-media">
          <img
            src="${escapeAttribute(selection?.icon || "")}"
            alt="${escapeAttribute(selection?.name || "Item")}"
            width="44"
            height="44"
          />
        </div>
        <div class="build-item-card-copy">
          <strong><span class="sr-only">Option ${escapeHtml(optionLabel)}: </span>${escapeHtml(selection?.name || "Unknown")}</strong>
          <div class="build-item-card-stats">
            ${renderItemCardStat(formatPercent(selection?.winRate), "win", selection?.winRate)}
            ${renderItemCardStat(formatPercent(selection?.pickRate), "pick")}
            ${renderItemCardStat(formatMinute(selection?.purchaseMinute), "minute")}
          </div>
        </div>
      </div>
    `;
  }

  function renderItemCardStat(value, tone, rawValue = null) {
    const classNames = ["build-item-card-stat", `build-item-card-stat--${tone}`];
    if (tone === "win" && isBelowEvenWinRate(rawValue)) {
      classNames.push("build-item-card-stat--low-win");
    }

    return `
      <span class="${escapeAttribute(classNames.join(" "))}">
        ${escapeHtml(value)}${tone === "minute" ? "" : ` ${escapeHtml(tone)}`}
      </span>
    `;
  }

  function isBelowEvenWinRate(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue < 50;
  }

  function renderCompactSection(label, selections) {
    const normalizedSelections = Array.isArray(selections)
      ? selections.filter((selection) => selection && (selection.icon || selection.name))
      : [];

    if (normalizedSelections.length === 0) {
      return "";
    }

    return `
      <section class="build-summary-section">
        <span class="build-summary-section-label">${escapeHtml(label)}</span>
        <div class="build-summary-chip-row">
          ${normalizedSelections.map((selection) => renderCompactChip(selection)).join("")}
        </div>
      </section>
    `;
  }

  function renderCompactChip(selection) {
    return `
      <article class="build-summary-chip" title="${escapeAttribute(selection?.name || "Selection")}">
        <img
          src="${escapeAttribute(selection?.icon || "")}"
          alt="${escapeAttribute(selection?.name || "Selection")}"
          width="28"
          height="28"
        />
        <span class="sr-only">${escapeHtml(selection?.name || "Unknown")}</span>
      </article>
    `;
  }

  function renderCompactBootCard(boot) {
    return `
      <article class="build-compact-boot-card ${getOptionHighlightClassName("build-compact-boot-card", boot)}">
        <div class="build-compact-boot-card-top">
          <img
            src="${escapeAttribute(boot?.icon || "")}"
            alt="${escapeAttribute(boot?.name || "Boots")}"
            width="38"
            height="38"
          />
          <div class="build-compact-boot-card-copy">
            <h4>${escapeHtml(boot?.name || "Unknown")}</h4>
            ${renderHighlightLegend(boot)}
          </div>
        </div>
        <div class="build-summary-metric-grid">
          ${renderSummaryMetric("Win", formatPercent(boot?.winRate), "win")}
          ${renderSummaryMetric("Pick", formatPercent(boot?.pickRate), "pick")}
          ${renderSummaryMetric("Games", formatCount(boot?.games), "games")}
        </div>
      </article>
    `;
  }

  function renderStartingItemSetCard(itemSet) {
    const selections = Array.isArray(itemSet?.selections)
      ? itemSet.selections.filter((selection) => selection && (selection.icon || selection.name))
      : [];

    return `
      <article class="build-spell-card ${getOptionHighlightClassName("build-spell-card", itemSet)}">
        <div class="build-spell-card-top">
          <div class="build-spell-card-icons">
            ${selections.map((selection) => renderStartingItemSelection(selection)).join("")}
          </div>
          <div class="build-spell-card-copy">
            <h4>${escapeHtml(getStartingItemSetTitle(itemSet))}</h4>
            ${renderHighlightLegend(itemSet)}
          </div>
        </div>
        <div class="build-summary-metric-grid">
          ${renderSummaryMetric("Win", formatPercent(itemSet?.winRate), "win")}
          ${renderSummaryMetric("Pick", formatPercent(itemSet?.pickRate), "pick")}
          ${renderSummaryMetric("Games", formatCount(itemSet?.games), "games")}
        </div>
      </article>
    `;
  }

  function renderSkillPriorityCard(skill) {
    const abilityKey = normalizeAbilityKey(skill?.abilityKey);

    return `
      <article class="build-skill-priority-card ${getOptionHighlightClassName("build-skill-priority-card", skill)}">
        <div class="build-skill-priority-card-top">
          <span class="build-skill-priority-ability" aria-hidden="true">
            ${escapeHtml(abilityKey || "?")}
          </span>
          <div class="build-skill-priority-copy">
            <h4>${escapeHtml(abilityKey ? `Max ${abilityKey} first` : "Unknown priority")}</h4>
            ${renderHighlightLegend(skill)}
          </div>
        </div>
        <div class="build-summary-metric-grid">
          ${renderSummaryMetric("Win", formatPercent(skill?.winRate), "win")}
          ${renderSummaryMetric("Pick", formatPercent(skill?.pickRate), "pick")}
          ${renderSummaryMetric("Games", formatCount(skill?.games), "games")}
        </div>
      </article>
    `;
  }

  function renderStartingItemSelection(selection) {
    return `
      <article class="build-starting-item-chip" title="${escapeAttribute(selection?.name || "Item")}">
        <img
          src="${escapeAttribute(selection?.icon || "")}"
          alt="${escapeAttribute(selection?.name || "Item")}"
          width="38"
          height="38"
        />
        <span class="sr-only">${escapeHtml(selection?.name || "Unknown")}</span>
      </article>
    `;
  }

  function renderSpellSetCard(spellSet) {
    const selections = normalizeSpellSelections(spellSet).filter(
      (selection) => selection && (selection.icon || selection.name),
    );
    const normalizedSpellSet = {
      ...spellSet,
      selections,
    };

    return `
      <article class="build-spell-card ${getOptionHighlightClassName("build-spell-card", normalizedSpellSet)}">
        <div class="build-spell-card-top">
          <div class="build-spell-card-icons">
            ${selections.map((selection) => renderSpellSelection(selection)).join("")}
          </div>
          <div class="build-spell-card-copy">
            <h4>${escapeHtml(getSpellSetTitle(normalizedSpellSet))}</h4>
            ${renderHighlightLegend(normalizedSpellSet)}
          </div>
        </div>
        <div class="build-summary-metric-grid">
          ${renderSummaryMetric("Win", formatPercent(spellSet?.winRate), "win")}
          ${renderSummaryMetric("Pick", formatPercent(spellSet?.pickRate), "pick")}
          ${renderSummaryMetric("Games", formatCount(spellSet?.games), "games")}
        </div>
      </article>
    `;
  }

  function normalizeSpellSelections(spellSet) {
    const sourceSelections = Array.isArray(spellSet?.selections)
      ? spellSet.selections.filter(Boolean)
      : [];
    const spellIds = Array.isArray(spellSet?.spellIds) && spellSet.spellIds.length > 0
      ? spellSet.spellIds
      : sourceSelections.map((selection) => selection?.id);

    return spellIds.map((rawSpellId, index) => {
      const spellId = Number(rawSpellId);
      const sourceSelection =
        sourceSelections.find((selection) => Number(selection?.id) === spellId) ||
        sourceSelections[index] ||
        {};

      return {
        ...sourceSelection,
        id: Number.isInteger(spellId) ? spellId : rawSpellId,
        icon: buildSummonerSpellIconUrl(spellId) || sourceSelection.icon || "",
        name: getSummonerSpellName(spellId) || sourceSelection.name || `Spell ${rawSpellId}`,
      };
    });
  }

  function renderSpellSelection(selection) {
    return `
      <article class="build-spell-chip" title="${escapeAttribute(selection?.name || "Spell")}">
        <img
          src="${escapeAttribute(selection?.icon || "")}"
          alt="${escapeAttribute(selection?.name || "Spell")}"
          width="38"
          height="38"
        />
        <span class="sr-only">${escapeHtml(selection?.name || "Unknown")}</span>
      </article>
    `;
  }

  function getPageTitle(page) {
    const parts = [page?.primaryStyle?.name, page?.secondaryStyle?.name].filter(Boolean);

    if (parts.length === 0) {
      return "Locked rune page";
    }

    return parts.join(" + ");
  }

  function getSpellSetTitle(spellSet) {
    const spellNames = Array.isArray(spellSet?.selections)
      ? spellSet.selections.map((selection) => selection?.name).filter(Boolean)
      : [];

    return spellNames.length > 0 ? spellNames.join(" + ") : "Summoner spells";
  }

  function getStartingItemSetTitle(itemSet) {
    const itemNames = Array.isArray(itemSet?.selections)
      ? itemSet.selections.map((selection) => selection?.name).filter(Boolean)
      : [];

    return itemNames.length > 0 ? itemNames.join(" + ") : "Starting items";
  }

  function normalizeAbilityKey(value) {
    const normalizedValue = String(value || "").trim().toUpperCase();
    return normalizedValue === "Q" || normalizedValue === "W" || normalizedValue === "E"
      ? normalizedValue
      : null;
  }

  function renderSummaryMetric(label, value, tone) {
    return `
      <div class="build-summary-metric build-summary-metric--${escapeAttribute(tone)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `;
  }

  function renderRuneImportAction(pageKey, runeImportState) {
    if (!pageKey) {
      return "";
    }

    const isImporting = runeImportState?.status === "importing";

    return `
      <button
        type="button"
        class="build-rune-import-action"
        data-rune-import-key="${escapeAttribute(pageKey)}"
        aria-label="Import this rune page into the League Client"
        ${isImporting ? "disabled" : ""}
      >
        ${isImporting ? "Importing..." : "Import Runes"}
      </button>
    `;
  }

  function renderRuneImportStatus(runeImportState) {
    const message = typeof runeImportState?.message === "string" ? runeImportState.message.trim() : "";
    if (!message) {
      return "";
    }

    const status = runeImportState?.status === "success"
      ? "success"
      : runeImportState?.status === "error"
        ? "error"
        : "pending";

    return `
      <p class="build-rune-import-status build-rune-import-status--${escapeAttribute(status)}" aria-live="polite">
        ${escapeHtml(message)}
      </p>
    `;
  }

  function renderHighlightLegend(option) {
    if (option?.isHighestWin && option?.isMostPicked) {
      return '<span class="build-highlight build-highlight--both">Highest Win + Most Picked</span>';
    }

    if (option?.isHighestWin) {
      return '<span class="build-highlight build-highlight--highest-win">Highest Win</span>';
    }

    if (option?.isMostPicked) {
      return '<span class="build-highlight build-highlight--most-picked">Most Picked</span>';
    }

    return "";
  }

  function getOptionHighlightClassName(baseClassName, option) {
    if (option?.isHighestWin && option?.isMostPicked) {
      return `${baseClassName}--both`;
    }

    if (option?.isHighestWin) {
      return `${baseClassName}--highest-win`;
    }

    if (option?.isMostPicked) {
      return `${baseClassName}--most-picked`;
    }

    return "";
  }

  function buildRecommendedRunePages(highestWinPage, mostPickedPage) {
    const pagesByKey = new Map();

    [
      { page: highestWinPage, isHighestWin: true, isMostPicked: false },
      { page: mostPickedPage, isHighestWin: false, isMostPicked: true },
    ].forEach(({ page, isHighestWin, isMostPicked }) => {
      const recommendationKey = getRecommendationPageKey(page);
      if (!recommendationKey) {
        return;
      }

      const existing = pagesByKey.get(recommendationKey);
      if (existing) {
        existing.isHighestWin = existing.isHighestWin || isHighestWin;
        existing.isMostPicked = existing.isMostPicked || isMostPicked;
        return;
      }

      pagesByKey.set(recommendationKey, {
        ...page,
        isHighestWin,
        isMostPicked,
      });
    });

    return [...pagesByKey.values()].sort(compareHighlightedOptions);
  }

  function normalizeRuneImportStates(statesByPageKey) {
    return statesByPageKey && typeof statesByPageKey === "object" ? statesByPageKey : {};
  }

  function buildRecommendedSpellSets(highestWinSet, mostPickedSet) {
    const setsByKey = new Map();

    [
      { option: highestWinSet, isHighestWin: true, isMostPicked: false },
      { option: mostPickedSet, isHighestWin: false, isMostPicked: true },
    ].forEach(({ option, isHighestWin, isMostPicked }) => {
      const recommendationKey = getRecommendationSpellSetKey(option);
      if (!recommendationKey) {
        return;
      }

      const existing = setsByKey.get(recommendationKey);
      if (existing) {
        existing.isHighestWin = existing.isHighestWin || isHighestWin;
        existing.isMostPicked = existing.isMostPicked || isMostPicked;
        return;
      }

      setsByKey.set(recommendationKey, {
        ...option,
        isHighestWin,
        isMostPicked,
      });
    });

    return [...setsByKey.values()].sort(compareHighlightedOptions);
  }

  function buildRecommendedStartingItemSets(highestWinSet, mostPickedSet) {
    const setsByKey = new Map();

    [
      { option: highestWinSet, isHighestWin: true, isMostPicked: false },
      { option: mostPickedSet, isHighestWin: false, isMostPicked: true },
    ].forEach(({ option, isHighestWin, isMostPicked }) => {
      const recommendationKey = getRecommendationStartingItemSetKey(option);
      if (!recommendationKey) {
        return;
      }

      const existing = setsByKey.get(recommendationKey);
      if (existing) {
        existing.isHighestWin = existing.isHighestWin || isHighestWin;
        existing.isMostPicked = existing.isMostPicked || isMostPicked;
        return;
      }

      setsByKey.set(recommendationKey, {
        ...option,
        isHighestWin,
        isMostPicked,
      });
    });

    return [...setsByKey.values()].sort(compareHighlightedOptions);
  }

  function buildRecommendedSkillPriorities(highestWinSkill, mostPickedSkill) {
    const skillsByKey = new Map();

    [
      { option: highestWinSkill, isHighestWin: true, isMostPicked: false },
      { option: mostPickedSkill, isHighestWin: false, isMostPicked: true },
    ].forEach(({ option, isHighestWin, isMostPicked }) => {
      const abilityKey = normalizeAbilityKey(option?.abilityKey);
      if (!abilityKey) {
        return;
      }

      const existing = skillsByKey.get(abilityKey);
      if (existing) {
        existing.isHighestWin = existing.isHighestWin || isHighestWin;
        existing.isMostPicked = existing.isMostPicked || isMostPicked;
        return;
      }

      skillsByKey.set(abilityKey, {
        ...option,
        abilityKey,
        isHighestWin,
        isMostPicked,
      });
    });

    return [...skillsByKey.values()].sort(compareHighlightedOptions);
  }

  function getHighlightedOptions(options, keyField) {
    if (!Array.isArray(options)) {
      return [];
    }

    const optionsByKey = new Map();

    options.forEach((option) => {
      if (!option?.isHighestWin && !option?.isMostPicked) {
        return;
      }

      const optionKey = option?.[keyField];
      if (optionKey == null) {
        return;
      }

      const existing = optionsByKey.get(optionKey);
      if (existing) {
        existing.isHighestWin = existing.isHighestWin || option.isHighestWin;
        existing.isMostPicked = existing.isMostPicked || option.isMostPicked;
        return;
      }

      optionsByKey.set(optionKey, { ...option });
    });

    return [...optionsByKey.values()].sort(compareHighlightedOptions);
  }

  function getRecommendationPageKey(page) {
    if (!page || typeof page !== "object") {
      return null;
    }

    if (page.pageKey) {
      return String(page.pageKey);
    }

    const primaryIds = getSelectionIds(page?.selections?.primary);
    const secondaryIds = getSelectionIds(page?.selections?.secondary);
    const modifierIds = getSelectionIds(page?.selections?.modifiers);

    return [
      page?.primaryStyle?.styleId ?? "",
      page?.secondaryStyle?.styleId ?? "",
      primaryIds.join(","),
      secondaryIds.join(","),
      modifierIds.join(","),
    ].join("|");
  }

  function getRecommendationSpellSetKey(spellSet) {
    if (!spellSet || typeof spellSet !== "object") {
      return null;
    }

    if (spellSet.setKey) {
      return String(spellSet.setKey);
    }

    return getSelectionIds(spellSet?.selections).join("|");
  }

  function getRecommendationStartingItemSetKey(itemSet) {
    if (!itemSet || typeof itemSet !== "object") {
      return null;
    }

    if (itemSet.setKey) {
      return String(itemSet.setKey);
    }

    return getSelectionIds(itemSet?.selections).join("|");
  }

  function getSelectionIds(selections) {
    if (!Array.isArray(selections)) {
      return [];
    }

    return selections
      .map((selection) => selection?.id)
      .filter((selectionId) => selectionId != null)
      .map((selectionId) => String(selectionId));
  }

  function compareHighlightedOptions(left, right) {
    const priorityDifference = getHighlightPriority(left) - getHighlightPriority(right);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const gamesDifference = Number(right?.games || 0) - Number(left?.games || 0);
    if (gamesDifference !== 0) {
      return gamesDifference;
    }

    return Number(right?.winRate || 0) - Number(left?.winRate || 0);
  }

  function getHighlightPriority(option) {
    if (option?.isHighestWin && option?.isMostPicked) {
      return 0;
    }

    if (option?.isHighestWin) {
      return 1;
    }

    if (option?.isMostPicked) {
      return 2;
    }

    return 3;
  }

  function renderInlineNotes(notes) {
    if (!Array.isArray(notes) || notes.length === 0) {
      return "";
    }

    return `
      <div class="build-inline-notes">
        ${notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")}
      </div>
    `;
  }

  function renderBuildSummaryGlobalNote() {
    return `
      <p class="build-summary-global-note">
        Rune pages combine individual matchup stats; other highest-win and most-picked build options are shown when available.
      </p>
    `;
  }

  function renderEmptyState(message) {
    return `<div class="build-empty-state">${escapeHtml(message)}</div>`;
  }

  function formatCount(value) {
    return Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString() : "-";
  }

  function formatPercent(value) {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "-";
  }

  function formatMinute(value) {
    const numericValue = Number(value);
    return value != null && Number.isFinite(numericValue) && numericValue > 0
      ? `${Math.round(numericValue)} min`
      : "-";
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/"/g, "&quot;");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return {
    BUILD_SUGGESTION_TABS,
    DEFAULT_BUILD_SUGGESTION_TAB,
    DEFAULT_ITEM_RECOMMENDATION_SCOPE,
    DEFAULT_RUNE_RECOMMENDATION_SCOPE,
    LANE_OPPONENT_ITEM_RECOMMENDATION_SCOPE,
    LANE_OPPONENT_RUNE_RECOMMENDATION_SCOPE,
    getRecommendedRunePages: buildRecommendedRunePages,
    getRunePageRecommendationKey: getRecommendationPageKey,
    normalizeBuildSuggestionTab,
    normalizeItemRecommendationScope,
    normalizeRuneRecommendationScope,
    renderBuildSuggestionBody,
  };
});
