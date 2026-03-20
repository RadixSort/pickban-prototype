(function initializeBuildSuggestionView(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.buildSuggestionView = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_BUILD_SUGGESTION_TAB = "highestWinPage";
  const BUILD_SUGGESTION_TABS = [
    { value: "highestWinPage", label: "Highest Win" },
    { value: "mostPickedPage", label: "Most Picked" },
    { value: "boots", label: "Boots" },
  ];
  const validTabs = new Set(BUILD_SUGGESTION_TABS.map((tab) => tab.value));

  function normalizeBuildSuggestionTab(value) {
    return validTabs.has(value) ? value : DEFAULT_BUILD_SUGGESTION_TAB;
  }

  function renderBuildSuggestionBody(payload, activeTab = DEFAULT_BUILD_SUGGESTION_TAB) {
    const normalizedTab = normalizeBuildSuggestionTab(activeTab);

    if (!payload || typeof payload !== "object") {
      return renderEmptyState("Select an ally with a role, then load rune and boots suggestions.");
    }

    if (normalizedTab === "highestWinPage") {
      return renderPagePanel({
        title: "Highest Win Page",
        tone: "highest-win",
        page: payload?.runes?.highestWinPage || null,
        notes: payload?.runes?.highlighting?.notes || [],
        emptyMessage: "No locked page crossed the current highest-win sample threshold.",
      });
    }

    if (normalizedTab === "mostPickedPage") {
      return renderPagePanel({
        title: "Most Picked Page",
        tone: "most-picked",
        page: payload?.runes?.mostPickedPage || null,
        notes: [],
        emptyMessage: "No locked most-picked page was available.",
      });
    }

    if (normalizedTab === "boots") {
      return renderBootsPanel(payload?.boots?.options || []);
    }

    return renderEmptyState("No build suggestion data is available.");
  }

  function renderPagePanel({ title, tone, page, notes, emptyMessage }) {
    if (!page) {
      return `
        <div class="build-view">
          ${renderInlineNotes(notes)}
          ${renderEmptyState(emptyMessage)}
        </div>
      `;
    }

    return `
      <div class="build-view build-view--page">
        ${renderInlineNotes(notes)}
        <section class="build-focus-card build-focus-card--${escapeAttribute(tone)}">
          <header class="build-focus-header">
            <div class="build-focus-heading">
              <span class="build-focus-kicker">${escapeHtml(title)}</span>
              <h3>${escapeHtml(getPageTitle(page))}</h3>
            </div>
            <div class="build-focus-summary">
              ${renderSummaryMetric("Win Rate", formatPercent(page.winRate), "win")}
              ${renderSummaryMetric("Pick Rate", formatPercent(page.pickRate), "pick")}
              ${renderSummaryMetric("Games", formatCount(page.games), "games")}
            </div>
          </header>
          <div class="build-focus-rows">
            ${renderSelectionRow("Primary Tree", [page.primaryStyle])}
            ${renderSelectionRow("Primary Runes", page?.selections?.primary || [])}
            ${renderSelectionRow("Secondary Tree", [page.secondaryStyle])}
            ${renderSelectionRow("Secondary Runes", page?.selections?.secondary || [])}
            ${renderSelectionRow("Stat Mods", page?.selections?.modifiers || [])}
          </div>
        </section>
      </div>
    `;
  }

  function renderBootsPanel(boots) {
    if (!Array.isArray(boots) || boots.length === 0) {
      return renderEmptyState("No completed boots data was available.");
    }

    return `
      <div class="build-view build-view--boots">
        <section class="build-focus-card build-focus-card--boots">
          <header class="build-focus-header build-focus-header--boots">
            <div class="build-focus-heading">
              <span class="build-focus-kicker">Boots</span>
              <h3>Completed boots options</h3>
            </div>
          </header>
          <div class="build-boots-grid">
            ${boots.map((boot) => renderBootCard(boot)).join("")}
          </div>
        </section>
      </div>
    `;
  }

  function renderSelectionRow(label, selections) {
    const normalizedSelections = Array.isArray(selections)
      ? selections.filter((selection) => selection && (selection.icon || selection.name))
      : [];

    if (normalizedSelections.length === 0) {
      return "";
    }

    return `
      <section class="build-selection-row">
        <div class="build-selection-row-label">
          <span>${escapeHtml(label)}</span>
        </div>
        <div class="build-selection-row-options">
          ${normalizedSelections.map((selection) => renderSelectionTile(selection)).join("")}
        </div>
      </section>
    `;
  }

  function renderSelectionTile(selection) {
    return `
      <article class="build-selection-tile" title="${escapeAttribute(selection?.name || "Selection")}">
        <img
          src="${escapeAttribute(selection?.icon || "")}"
          alt="${escapeAttribute(selection?.name || "Selection")}"
          width="36"
          height="36"
        />
        <span>${escapeHtml(selection?.name || "Unknown")}</span>
      </article>
    `;
  }

  function renderBootCard(boot) {
    return `
      <article class="build-boot-card ${getBootCardClassName(boot)}">
        <div class="build-boot-card-top">
          <img
            src="${escapeAttribute(boot?.icon || "")}"
            alt="${escapeAttribute(boot?.name || "Boots")}"
            width="40"
            height="40"
          />
          <div class="build-boot-card-copy">
            <h4>${escapeHtml(boot?.name || "Unknown")}</h4>
            ${renderHighlightLegend(boot)}
          </div>
        </div>
        <div class="build-boot-stats">
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

  function getBootCardClassName(option) {
    if (option?.isHighestWin && option?.isMostPicked) {
      return "build-boot-card--both";
    }

    if (option?.isHighestWin) {
      return "build-boot-card--highest-win";
    }

    if (option?.isMostPicked) {
      return "build-boot-card--most-picked";
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
