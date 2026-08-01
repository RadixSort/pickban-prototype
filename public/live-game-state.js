(function initializeLiveGameState(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.liveGameState = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  function createInitialLiveGameState() {
    return {
      active: false,
      complete: false,
      latestRosterComplete: false,
      playerCount: 0,
      playersByChampionKey: {},
      rosterComplete: false,
      sessionId: "",
    };
  }

  /**
   * Reconcile a live pull with last-observed same-session inventory metrics.
   * Riot exposes no fog visibility flag, so an enemy positive-to-zero change
   * is retained until a later nonzero observation. Allies always use the
   * current value so selling every item still updates immediately.
   */
  function reconcileLiveGameState(
    previousState,
    payload,
    { normalizeRole = normalizeRoleFallback } = {},
  ) {
    const previous = previousState && typeof previousState === "object"
      ? previousState
      : createInitialLiveGameState();
    const sessionId = typeof payload?.sessionId === "string" ? payload.sessionId : "";
    const sameSession =
      previous.active === true &&
      (!sessionId || !previous.sessionId || sessionId === previous.sessionId);
    const participants = [
      ...normalizeParticipants(payload?.allies, "ally"),
      ...normalizeParticipants(payload?.enemies, "enemy"),
    ];
    const reportedPlayerCount = normalizePositiveInteger(
      payload?.liveGame?.totalPlayerCount ?? payload?.liveGame?.playerCount,
    );
    const previousPlayerCount = normalizePositiveInteger(previous.playerCount);
    const rosterShrank =
      sameSession &&
      (previous.rosterComplete === true || previous.complete === true) &&
      previousPlayerCount != null &&
      (reportedPlayerCount || participants.length) < previousPlayerCount;
    const snapshotComplete = payload?.liveGame?.complete === true && !rosterShrank;
    const participantKeys = new Set(
      participants.map(({ participant }) => normalizeChampionKey(participant?.championKey)),
    );
    const playersByChampionKey = sameSession
      ? clonePlayerMetrics(previous.playersByChampionKey)
      : {};

    if (snapshotComplete) {
      Object.keys(playersByChampionKey).forEach((championKey) => {
        if (!participantKeys.has(championKey)) {
          delete playersByChampionKey[championKey];
        }
      });
    }

    let nextRankOrder = getNextRankOrder(playersByChampionKey);
    participants.forEach(({ participant, team }) => {
      const championKey = normalizeChampionKey(participant?.championKey);
      if (!championKey) {
        return;
      }

      const previousMetrics = playersByChampionKey[championKey] || null;
      const observedBuildGold = normalizeBuildGold(participant?.buildGold);
      const inventoryKnown = participant?.inventoryKnown === true;
      const preservePreviousInventory = shouldPreservePreviousInventory({
        inventoryKnown,
        observedBuildGold,
        previousMetrics,
        team,
      });
      const buildGold = preservePreviousInventory
        ? previousMetrics.buildGold
        : inventoryKnown
          ? observedBuildGold
          : normalizeBuildGold(previousMetrics?.buildGold);
      const hasCompletedFirstItem = preservePreviousInventory || !inventoryKnown
        ? normalizeFirstItemStatus(previousMetrics?.hasCompletedFirstItem)
        : normalizeFirstItemStatus(participant?.hasCompletedFirstItem);
      const incomingRank = normalizePositiveInteger(participant?.buildGoldRank);
      const rankOrder = normalizePositiveInteger(previousMetrics?.rankOrder)
        || incomingRank
        || nextRankOrder++;

      playersByChampionKey[championKey] = {
        role: normalizeRole(participant?.role) || "",
        buildGold,
        buildGoldRank: null,
        hasCompletedFirstItem,
        rankOrder,
      };
    });

    const playerCount = snapshotComplete && reportedPlayerCount
      ? reportedPlayerCount
      : sameSession && previousPlayerCount
        ? previousPlayerCount
        : reportedPlayerCount || participants.length;
    const playerMetrics = Object.entries(playersByChampionKey);
    const rosterComplete =
      snapshotComplete ||
      (sameSession && (previous.rosterComplete === true || previous.complete === true));
    const complete =
      rosterComplete &&
      playerCount > 0 &&
      playerMetrics.length === playerCount &&
      playerMetrics.every(([, metrics]) => normalizeBuildGold(metrics?.buildGold) != null);

    if (complete) {
      playerMetrics
        .sort(comparePlayerBuildGold)
        .forEach(([, metrics], rankIndex) => {
          metrics.buildGoldRank = rankIndex + 1;
        });
    }

    return {
      active: true,
      complete,
      latestRosterComplete: snapshotComplete,
      playerCount,
      playersByChampionKey,
      rosterComplete,
      sessionId,
    };
  }

  function normalizeParticipants(participants, team) {
    return (Array.isArray(participants) ? participants : []).map((participant) => ({
      participant,
      team,
    }));
  }

  function clonePlayerMetrics(playersByChampionKey) {
    if (!playersByChampionKey || typeof playersByChampionKey !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(playersByChampionKey).map(([championKey, metrics]) => [
        championKey,
        metrics && typeof metrics === "object" ? { ...metrics } : {},
      ]),
    );
  }

  function shouldPreservePreviousInventory({
    inventoryKnown,
    observedBuildGold,
    previousMetrics,
    team,
  }) {
    const previousBuildGold = normalizeBuildGold(previousMetrics?.buildGold);
    if (previousBuildGold == null) {
      return false;
    }
    if (!inventoryKnown || observedBuildGold == null) {
      return true;
    }

    return team === "enemy" && previousBuildGold > 0 && observedBuildGold === 0;
  }

  function comparePlayerBuildGold(left, right) {
    const leftMetrics = left[1];
    const rightMetrics = right[1];
    return (
      rightMetrics.buildGold - leftMetrics.buildGold ||
      (normalizePositiveInteger(leftMetrics.rankOrder) || Number.MAX_SAFE_INTEGER) -
        (normalizePositiveInteger(rightMetrics.rankOrder) || Number.MAX_SAFE_INTEGER) ||
      left[0].localeCompare(right[0])
    );
  }

  function getNextRankOrder(playersByChampionKey) {
    const highestRankOrder = Object.values(playersByChampionKey).reduce(
      (highest, metrics) =>
        Math.max(highest, normalizePositiveInteger(metrics?.rankOrder) || 0),
      0,
    );
    return highestRankOrder + 1;
  }

  function normalizeChampionKey(value) {
    return value == null || value === "" ? "" : String(value);
  }

  function normalizeBuildGold(value) {
    if (value == null || value === "" || typeof value === "boolean") {
      return null;
    }

    const buildGold = Number(value);
    return Number.isSafeInteger(buildGold) && buildGold >= 0 ? buildGold : null;
  }

  function normalizeFirstItemStatus(value) {
    return typeof value === "boolean" ? value : null;
  }

  function normalizePositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function normalizeRoleFallback(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  return {
    createInitialLiveGameState,
    reconcileLiveGameState,
  };
});
