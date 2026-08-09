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
      allyBuildGold: null,
      allyChampionKeys: [],
      complete: false,
      enemyBuildGold: null,
      enemyChampionKeys: [],
      fetchedAt: "",
      gameTimeSeconds: null,
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
    const sameSession = isSameLiveGameSession(previous, sessionId);
    const alliedParticipants = normalizeParticipants(payload?.allies, "ally");
    const enemyParticipants = normalizeParticipants(payload?.enemies, "enemy");
    const participants = [...alliedParticipants, ...enemyParticipants];
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
    let allyChampionKeys = sameSession
      ? normalizeChampionKeys(previous.allyChampionKeys)
      : [];
    let enemyChampionKeys = sameSession
      ? normalizeChampionKeys(previous.enemyChampionKeys)
      : [];

    if (snapshotComplete) {
      Object.keys(playersByChampionKey).forEach((championKey) => {
        if (!participantKeys.has(championKey)) {
          delete playersByChampionKey[championKey];
        }
      });
      allyChampionKeys = normalizeChampionKeys(
        alliedParticipants.map(({ participant }) => participant?.championKey),
      );
      enemyChampionKeys = normalizeChampionKeys(
        enemyParticipants.map(({ participant }) => participant?.championKey),
      );
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
      const completedLegendaryItemCount = preservePreviousInventory || !inventoryKnown
        ? normalizeCompletedLegendaryItemCount(
            previousMetrics?.completedLegendaryItemCount,
            previousMetrics?.hasCompletedFirstItem,
          )
        : normalizeCompletedLegendaryItemCount(
            participant?.completedLegendaryItemCount,
            participant?.hasCompletedFirstItem,
          );
      const reportedFirstItemStatus = preservePreviousInventory || !inventoryKnown
        ? normalizeFirstItemStatus(previousMetrics?.hasCompletedFirstItem)
        : normalizeFirstItemStatus(participant?.hasCompletedFirstItem);
      const hasCompletedFirstItem = completedLegendaryItemCount == null
        ? reportedFirstItemStatus
        : completedLegendaryItemCount > 0;
      const incomingRank = normalizePositiveInteger(participant?.buildGoldRank);
      const rankOrder = normalizePositiveInteger(previousMetrics?.rankOrder)
        || incomingRank
        || nextRankOrder++;

      playersByChampionKey[championKey] = {
        role: normalizeRole(participant?.role) || "",
        buildGold,
        buildGoldRank: null,
        hasCompletedFirstItem,
        completedLegendaryItemCount,
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

    const allyBuildGold = complete
      ? sumBuildGoldForChampionKeys(playersByChampionKey, allyChampionKeys)
      : null;
    const enemyBuildGold = complete
      ? sumBuildGoldForChampionKeys(playersByChampionKey, enemyChampionKeys)
      : null;

    return {
      active: true,
      allyBuildGold,
      allyChampionKeys,
      complete,
      enemyBuildGold,
      enemyChampionKeys,
      fetchedAt: normalizeTimestamp(payload?.liveGame?.fetchedAt ?? payload?.fetchedAt),
      gameTimeSeconds: normalizeGameTimeSeconds(payload?.liveGame?.gameTimeSeconds),
      latestRosterComplete: snapshotComplete,
      playerCount,
      playersByChampionKey,
      rosterComplete,
      sessionId,
    };
  }

  /**
   * Mark a live game unavailable without discarding its last trustworthy item
   * values. Session identity is intentionally retained so a reconnect to the
   * same game can continue reconciling fog-hidden inventories.
   */
  function markLiveGameDisconnected(previousState) {
    const previous = previousState && typeof previousState === "object"
      ? previousState
      : createInitialLiveGameState();

    return {
      ...previous,
      active: false,
      allyChampionKeys: normalizeChampionKeys(previous.allyChampionKeys),
      enemyChampionKeys: normalizeChampionKeys(previous.enemyChampionKeys),
      latestRosterComplete: false,
      playersByChampionKey: clonePlayerMetrics(previous.playersByChampionKey),
    };
  }

  /**
   * Retained metrics belong to one enemy champion composition. Enemy order and
   * lane changes do not invalidate them, while an addition, removal, or
   * replacement does. A new champion-select session can therefore clear stale
   * values as soon as its enemy roster differs from the completed live roster.
   */
  function invalidateLiveGameStateIfEnemyCompositionChanged(
    previousState,
    currentEnemies = [],
  ) {
    const previous = previousState && typeof previousState === "object"
      ? previousState
      : createInitialLiveGameState();
    const previousEnemyKeys = normalizeChampionKeys(previous.enemyChampionKeys);
    if (previousEnemyKeys.length === 0) {
      return previous;
    }

    const currentEnemyKeys = normalizeChampionKeys(
      (Array.isArray(currentEnemies) ? currentEnemies : []).map(getParticipantChampionKey),
    );
    return haveSameChampionComposition(previousEnemyKeys, currentEnemyKeys)
      ? previous
      : createInitialLiveGameState();
  }

  /**
   * A transition payload can identify the next game before Live Client Data is
   * ready. Clear retained metrics as soon as that new session is observable.
   */
  function invalidateLiveGameStateIfSessionChanged(previousState, nextSessionId) {
    const previous = previousState && typeof previousState === "object"
      ? previousState
      : createInitialLiveGameState();
    const previousSessionId = normalizeSessionId(previous.sessionId);
    const normalizedNextSessionId = normalizeSessionId(nextSessionId);

    return previousSessionId &&
      normalizedNextSessionId &&
      previousSessionId !== normalizedNextSessionId
      ? createInitialLiveGameState()
      : previous;
  }

  function isSameLiveGameSession(previous, sessionId) {
    const previousSessionId = typeof previous?.sessionId === "string"
      ? previous.sessionId
      : "";
    if (previousSessionId && sessionId) {
      return previousSessionId === sessionId;
    }

    return (
      previous?.active === true &&
      (!sessionId || !previousSessionId || sessionId === previousSessionId)
    );
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

  function sumBuildGoldForChampionKeys(playersByChampionKey, championKeys) {
    let total = 0;
    for (const championKey of championKeys) {
      const buildGold = normalizeBuildGold(playersByChampionKey?.[championKey]?.buildGold);
      if (buildGold == null) {
        return null;
      }
      total += buildGold;
      if (!Number.isSafeInteger(total)) {
        return null;
      }
    }

    return total;
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

  function normalizeCompletedLegendaryItemCount(value, hasCompletedFirstItem = null) {
    if (value == null || value === "" || typeof value === "boolean") {
      return hasCompletedFirstItem === true
        ? 1
        : hasCompletedFirstItem === false
          ? 0
          : null;
    }

    const count = Number(value);
    if (Number.isSafeInteger(count) && count >= 0) {
      return count;
    }
    if (hasCompletedFirstItem === true) {
      return 1;
    }
    if (hasCompletedFirstItem === false) {
      return 0;
    }

    return null;
  }

  function normalizePositiveInteger(value) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function normalizeRoleFallback(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  function normalizeChampionKeys(values) {
    if (!Array.isArray(values)) {
      return [];
    }

    return [...new Set(values.map(normalizeChampionKey).filter(Boolean))].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true }),
    );
  }

  function getParticipantChampionKey(participant) {
    return participant?.key ?? participant?.championKey ?? participant?.champion?.key ?? null;
  }

  function haveSameChampionComposition(left, right) {
    return (
      left.length === right.length &&
      left.every((championKey, index) => championKey === right[index])
    );
  }

  function normalizeTimestamp(value) {
    return typeof value === "string" && value.trim() ? value.trim() : "";
  }

  function normalizeSessionId(value) {
    return value == null ? "" : String(value).trim();
  }

  function normalizeGameTimeSeconds(value) {
    if (value == null || value === "" || typeof value === "boolean") {
      return null;
    }

    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  return {
    createInitialLiveGameState,
    invalidateLiveGameStateIfEnemyCompositionChanged,
    invalidateLiveGameStateIfSessionChanged,
    markLiveGameDisconnected,
    reconcileLiveGameState,
  };
});
