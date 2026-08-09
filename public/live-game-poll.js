(function initializeLiveGamePoll(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.liveGamePoll = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const LIVE_GAME_POLL_INTERVAL_MS = 10 * 1000;
  const MIN_LIVE_GAME_POLL_DELAY_MS = 250;

  /**
   * Align the next full live pull to the next future in-game interval boundary.
   * Time spent handling the snapshot is added to the reported game clock so
   * downstream recommendation work does not introduce cumulative drift.
   */
  function resolveLiveGamePollDelayMs({
    fetchedAt = "",
    gameTimeSeconds = null,
    intervalMs = LIVE_GAME_POLL_INTERVAL_MS,
    lastPollStartedAt = 0,
    minDelayMs = MIN_LIVE_GAME_POLL_DELAY_MS,
    nowMs = Date.now(),
  } = {}) {
    const safeIntervalMs = normalizePositiveFiniteNumber(intervalMs)
      || LIVE_GAME_POLL_INTERVAL_MS;
    const safeMinDelayMs = Math.min(
      normalizeNonnegativeFiniteNumber(minDelayMs) ?? MIN_LIVE_GAME_POLL_DELAY_MS,
      safeIntervalMs,
    );
    const safeNowMs = normalizeNonnegativeFiniteNumber(nowMs) ?? Date.now();
    const safeGameTimeSeconds = normalizeNonnegativeFiniteNumber(gameTimeSeconds);

    if (safeGameTimeSeconds != null) {
      const fetchedAtMs = normalizeTimestampMs(fetchedAt);
      const elapsedSinceSnapshotMs = fetchedAtMs == null
        ? 0
        : Math.max(0, safeNowMs - fetchedAtMs);
      const estimatedGameTimeMs = safeGameTimeSeconds * 1000 + elapsedSinceSnapshotMs;
      if (Number.isFinite(estimatedGameTimeMs)) {
        const remainderMs = positiveModulo(estimatedGameTimeMs, safeIntervalMs);
        const boundaryDelayMs = remainderMs === 0
          ? safeIntervalMs
          : safeIntervalMs - remainderMs;
        return Math.max(safeMinDelayMs, boundaryDelayMs);
      }
    }

    const safeLastPollStartedAt = normalizePositiveFiniteNumber(lastPollStartedAt);
    const elapsedSincePollStartedMs = safeLastPollStartedAt == null
      ? 0
      : Math.max(0, safeNowMs - safeLastPollStartedAt);
    return Math.max(safeMinDelayMs, safeIntervalMs - elapsedSincePollStartedMs);
  }

  function normalizeTimestampMs(value) {
    if (typeof value === "number") {
      return normalizeNonnegativeFiniteNumber(value);
    }
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }

    const timestampMs = Date.parse(value);
    return Number.isFinite(timestampMs) ? timestampMs : null;
  }

  function normalizePositiveFiniteNumber(value) {
    const number = normalizeNonnegativeFiniteNumber(value);
    return number != null && number > 0 ? number : null;
  }

  function normalizeNonnegativeFiniteNumber(value) {
    if (value == null || value === "" || typeof value === "boolean") {
      return null;
    }

    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function positiveModulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  return {
    LIVE_GAME_POLL_INTERVAL_MS,
    MIN_LIVE_GAME_POLL_DELAY_MS,
    resolveLiveGamePollDelayMs,
  };
});
