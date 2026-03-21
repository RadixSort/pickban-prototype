(function initializeDraftProjectionView(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.draftProjectionView = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function renderDraftProjectionView(payload = {}, options = {}) {
    const allyRoundedWinRate = getRoundedAllyWinRate(payload?.projection?.allyWinRate);
    const enemyRoundedWinRate = 100 - allyRoundedWinRate;
    const allyTone = getRoundedRateTone(allyRoundedWinRate, enemyRoundedWinRate);
    const enemyTone = getRoundedRateTone(enemyRoundedWinRate, allyRoundedWinRate);
    const partialFailures = Array.isArray(options.partialFailures) ? options.partialFailures : [];
    const rankFilterLabel = escapeHtml(options.rankFilterLabel || "");
    const allyCount = Number(payload?.summary?.allyCount || 0);
    const enemyCount = Number(payload?.summary?.enemyCount || 0);
    const synergyMatchupCount = Number(payload?.summary?.synergyMatchupCount || 0);
    const counterMatchupCount = Number(payload?.summary?.counterMatchupCount || 0);
    const sourceMatchups = Number(payload?.summary?.sourceMatchups || 0);
    const metaParts = [];

    if (rankFilterLabel) {
      metaParts.push(rankFilterLabel);
    }

    metaParts.push(`${allyCount} allies`);
    metaParts.push(`${enemyCount} ${enemyCount === 1 ? "enemy" : "enemies"}`);

    if (sourceMatchups > 0) {
      metaParts.push(`${sourceMatchups} matchup links`);
    }

    const partialFailuresMarkup =
      partialFailures.length === 0
        ? ""
        : `
        <div class="partial-failures">
          <p class="partial-failures-title">Partial scrape failures</p>
          ${partialFailures
            .map(
              (failure) =>
                `<p class="partial-failure-item">${escapeHtml(failure)}</p>`,
            )
            .join("")}
        </div>
      `;

    return `
      <section class="draft-projection-card" aria-label="Projected draft win rate">
        <div class="draft-projection-scoreboard" role="img" aria-label="Projected win rate. Allies ${allyRoundedWinRate} percent. Enemies ${enemyRoundedWinRate} percent.">
          <strong class="draft-projection-rate draft-projection-rate--${allyTone}">
            ${allyRoundedWinRate}%
          </strong>
          <div class="draft-projection-bar" aria-hidden="true">
            <span
              class="draft-projection-bar-fill draft-projection-bar-fill--${allyTone}"
              style="width: ${allyRoundedWinRate}%;"
            ></span>
            <span
              class="draft-projection-bar-fill draft-projection-bar-fill--${enemyTone}"
              style="width: ${enemyRoundedWinRate}%;"
            ></span>
          </div>
          <strong class="draft-projection-rate draft-projection-rate--${enemyTone}">
            ${enemyRoundedWinRate}%
          </strong>
        </div>
        ${partialFailuresMarkup}
        <p class="draft-projection-meta">${metaParts.join(" | ")}</p>
        <p class="draft-projection-supporting">
          Ally synergy links: ${synergyMatchupCount} | Enemy counter matchups: ${counterMatchupCount}
        </p>
      </section>
    `;
  }

  function getRoundedAllyWinRate(value) {
    const normalizedValue = Number(value);
    if (!Number.isFinite(normalizedValue)) {
      return 50;
    }

    return Math.max(0, Math.min(100, Math.round(normalizedValue)));
  }

  function getRoundedRateTone(rate, opposingRate) {
    if (rate === 50 && opposingRate === 50) {
      return "even";
    }

    return rate >= 50 ? "positive" : "negative";
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
    getRoundedAllyWinRate,
    getRoundedRateTone,
    renderDraftProjectionView,
  };
});
