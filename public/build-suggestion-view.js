(function initializeBuildSuggestionView(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.buildSuggestionView = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_BUILD_SUGGESTION_TAB = "summary";
  const BUILD_SUGGESTION_TABS = [{ value: "summary", label: "Summary" }];
  const validTabs = new Set(BUILD_SUGGESTION_TABS.map((tab) => tab.value));

  function normalizeBuildSuggestionTab(value) {
    return validTabs.has(value) ? value : DEFAULT_BUILD_SUGGESTION_TAB;
  }

  function renderBuildSuggestionBody(payload, activeTab = DEFAULT_BUILD_SUGGESTION_TAB) {
    void activeTab;

    if (!payload || typeof payload !== "object") {
      return renderEmptyState("Select an ally with a role, then load rune and boots suggestions.");
    }

    const notes = Array.isArray(payload?.runes?.highlighting?.notes)
      ? payload.runes.highlighting.notes
      : [];
    const slotGroups = Array.isArray(payload?.runes?.overview?.slotGroups)
      ? payload.runes.overview.slotGroups
      : [];
    const highestWinPage = payload?.runes?.highestWinPage || null;
    const mostPickedPage = payload?.runes?.mostPickedPage || null;
    const boots = Array.isArray(payload?.boots?.options) ? payload.boots.options : [];

    return renderSummaryPanel({
      highestWinPage,
      mostPickedPage,
      boots,
      notes,
      slotGroupMap: buildSlotGroupMap(slotGroups),
    });
  }

  function renderSummaryPanel({ highestWinPage, mostPickedPage, boots, notes, slotGroupMap }) {
    const hasAnyContent = highestWinPage || mostPickedPage || boots.length > 0;

    if (!hasAnyContent) {
      return `
        <div class="build-view build-view--summary">
          ${renderInlineNotes(notes)}
          ${renderEmptyState("No build suggestion data is available.")}
        </div>
      `;
    }

    return `
      <div class="build-view build-view--summary">
        ${renderInlineNotes(notes)}
        <section class="build-summary-board" aria-label="Rune and boots summary">
          ${renderSummaryPageColumn({
            title: "Highest Win",
            tone: "highest-win",
            page: highestWinPage,
            slotGroupMap,
            emptyMessage: "No locked page crossed the current highest-win sample threshold.",
          })}
          ${renderSummaryPageColumn({
            title: "Most Picked",
            tone: "most-picked",
            page: mostPickedPage,
            slotGroupMap,
            emptyMessage: "No locked most-picked page was available.",
          })}
          ${renderSummaryBootsColumn(boots)}
        </section>
      </div>
    `;
  }

  function renderSummaryPageColumn({ title, tone, page, slotGroupMap, emptyMessage }) {
    if (!page) {
      return `
        <section class="build-summary-column build-summary-column--${escapeAttribute(tone)}">
          <header class="build-summary-column-header">
            <div class="build-summary-column-heading">
              <span class="build-summary-kicker">${escapeHtml(title)}</span>
              <h3>${escapeHtml(title)}</h3>
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

    return `
      <section class="build-summary-column build-summary-column--${escapeAttribute(tone)}">
        <header class="build-summary-column-header">
          <div class="build-summary-column-heading">
            <span class="build-summary-kicker">${escapeHtml(title)}</span>
            <h3>${escapeHtml(getPageTitle(page))}</h3>
          </div>
          <div class="build-summary-metric-grid">
            ${renderSummaryMetric("Win", formatPercent(page.winRate), "win")}
            ${renderSummaryMetric("Pick", formatPercent(page.pickRate), "pick")}
            ${renderSummaryMetric("Games", formatCount(page.games), "games")}
          </div>
        </header>
        <div class="build-summary-section-list">
          ${renderRuneSection("Primary Runes", primaryRunes)}
          ${renderRuneSection("Secondary Runes", secondaryRunes)}
          ${renderCompactSection("Mods", modifiers)}
        </div>
      </section>
    `;
  }

  function renderSummaryBootsColumn(boots) {
    if (!Array.isArray(boots) || boots.length === 0) {
      return `
        <section class="build-summary-column build-summary-column--boots">
          <header class="build-summary-column-header">
            <div class="build-summary-column-heading">
              <span class="build-summary-kicker">Boots</span>
              <h3>Boots</h3>
            </div>
          </header>
          <div class="build-summary-column-empty">No completed boots data was available.</div>
        </section>
      `;
    }

    return `
      <section class="build-summary-column build-summary-column--boots">
        <header class="build-summary-column-header">
          <div class="build-summary-column-heading">
            <span class="build-summary-kicker">Boots</span>
          </div>
        </header>
        <div class="build-summary-boot-list">
          ${boots.map((boot) => renderCompactBootCard(boot)).join("")}
        </div>
      </section>
    `;
  }

  function hydrateRuneSelections(selections, side, slotGroupMap) {
    return getOrderedSelections(selections).map((selection) => ({
      ...selection,
      matchedWinRate: lookupSelectionWinRate(side, selection, slotGroupMap),
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

  function lookupSelectionWinRate(side, selection, slotGroupMap) {
    const slotIndex = Number(selection?.slotIndex);
    if (!Number.isInteger(slotIndex)) {
      return null;
    }

    const groupKey = `${side}-slot-${slotIndex}`;
    const group = slotGroupMap.get(groupKey);
    const option = Array.isArray(group?.options)
      ? group.options.find((candidate) => candidate?.id === selection?.id) || null
      : null;

    return option?.winRate ?? null;
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
          width="34"
          height="34"
        />
        <div class="build-rune-card-copy">
          <strong>${escapeHtml(selection?.name || "Unknown")}</strong>
          <span>${escapeHtml(formatPercent(selection?.matchedWinRate))}</span>
        </div>
      </article>
    `;
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

  function getPageTitle(page) {
    const parts = [page?.primaryStyle?.name, page?.secondaryStyle?.name].filter(Boolean);

    if (parts.length === 0) {
      return "Locked rune page";
    }

    return parts.join(" + ");
  }

  function renderSummaryMetric(label, value, tone) {
    return `
      <div class="build-summary-metric build-summary-metric--${escapeAttribute(tone)}">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
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

  function renderEmptyState(message) {
    return `<div class="build-empty-state">${escapeHtml(message)}</div>`;
  }

  function formatCount(value) {
    return Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString() : "-";
  }

  function formatPercent(value) {
    return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "-";
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
    normalizeBuildSuggestionTab,
    renderBuildSuggestionBody,
  };
});
