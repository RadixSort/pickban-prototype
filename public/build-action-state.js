(function initializeBuildActionState(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.buildActionState = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function getBuildSuggestionActionState({
    ally = null,
    enemyCount = 0,
    loading = false,
    shuttingDown = false,
  } = {}) {
    if (loading) {
      return buildBuildActionState(
        ally,
        "Unavailable while role suggestions are loading.",
        "Unavailable while role suggestions are loading.",
      );
    }

    if (shuttingDown) {
      return buildBuildActionState(
        ally,
        "Unavailable while the app is stopping.",
        "Unavailable while the app is stopping.",
      );
    }

    if (!ally?.role) {
      return buildBuildActionState(
        ally,
        "Assign a role to unlock build suggestions.",
        "Assign a role to unlock build suggestions.",
      );
    }

    const selectedEnemyCount = Number(enemyCount);
    if (!Number.isFinite(selectedEnemyCount) || selectedEnemyCount <= 0) {
      const disabledReason = "Select at least 1 enemy champion to unlock build suggestions.";
      return buildBuildActionState(ally, disabledReason, disabledReason);
    }

    return buildBuildActionState(
      ally,
      "",
      `Open matchup build recommendation for ${ally.name}.`,
    );
  }

  function buildBuildActionState(ally, disabledReason, tooltipText) {
    const championName = ally?.name || "this champion";

    return {
      disabledReason,
      tooltipText,
      ariaLabel: disabledReason
        ? `Build recommendation for ${championName}. ${disabledReason}`
        : tooltipText,
    };
  }

  return {
    getBuildSuggestionActionState,
  };
});
