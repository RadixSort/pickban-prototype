(function initializeBanSuggestionState(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./roles.js"));
    return;
  }

  globalScope.banSuggestionState = factory(globalScope.roles || {});
})(typeof globalThis !== "undefined" ? globalThis : this, (roles) => {
  const { getTargetRoleOptions = () => [], normalizeRole = () => null } = roles;

  function createInitialBanSuggestionState() {
    return {
      activeKey: "",
      cache: {},
      error: "",
      hovers: [],
      loading: false,
      payload: null,
      requestVersion: 0,
      sessionId: "",
      visible: false,
    };
  }

  function buildBanSuggestionCacheKey(rankFilter, hovers = []) {
    const hoversByRole = new Map(
      normalizeBanSuggestionHovers(hovers).map((hover) => [hover.role, hover]),
    );
    const roleParts = getTargetRoleOptions().map(({ value: role }) => {
      const hover = hoversByRole.get(role);
      return `${role}=${hover?.championKey || ""}`;
    });

    return [`rank=${String(rankFilter || "")}`, ...roleParts].join("|");
  }

  function normalizeBanSuggestionHovers(hovers = []) {
    const normalizedHovers = [];
    const seenRoles = new Set();

    for (const hover of Array.isArray(hovers) ? hovers : []) {
      const role = normalizeRole(hover?.role ?? hover?.lane ?? null);
      const championKey = String(hover?.championKey || "");
      const champion = typeof hover?.champion === "string" ? hover.champion.trim() : "";

      if (!role || !championKey || !champion || seenRoles.has(role)) {
        continue;
      }

      seenRoles.add(role);
      normalizedHovers.push({
        champion,
        championKey,
        role,
      });
    }

    return normalizedHovers;
  }

  function reconcileBanSuggestionState(
    currentState,
    {
      active = false,
      champSelectPhase = "",
      hovers = [],
      rankFilter = "",
      sessionId = "",
    } = {},
  ) {
    const current = currentState || createInitialBanSuggestionState();
    if (!active || champSelectPhase !== "ban") {
      return {
        ...createInitialBanSuggestionState(),
        requestVersion: Number(current.requestVersion || 0) + 1,
      };
    }

    const normalizedSessionId = String(sessionId || "");
    const isNewSession = Boolean(
      current.sessionId && normalizedSessionId && current.sessionId !== normalizedSessionId,
    );
    const cache = isNewSession ? {} : current.cache || {};
    const normalizedHovers = normalizeBanSuggestionHovers(hovers);
    const activeKey = buildBanSuggestionCacheKey(rankFilter, normalizedHovers);
    const cachedPayload = cache[activeKey] || null;
    const didChangeRequest = current.activeKey !== activeKey || !current.visible || isNewSession;

    return {
      ...current,
      activeKey,
      cache,
      error: "",
      hovers: normalizedHovers,
      loading: !cachedPayload,
      payload: cachedPayload,
      requestVersion: didChangeRequest
        ? Number(current.requestVersion || 0) + 1
        : Number(current.requestVersion || 0),
      sessionId: normalizedSessionId,
      visible: true,
    };
  }

  function completeBanSuggestionRequest(currentState, { key, payload, requestVersion } = {}) {
    const current = currentState || createInitialBanSuggestionState();
    if (
      !current.visible ||
      current.activeKey !== key ||
      current.requestVersion !== requestVersion
    ) {
      return current;
    }

    return {
      ...current,
      cache: {
        ...current.cache,
        [key]: payload,
      },
      error: "",
      loading: false,
      payload,
    };
  }

  function failBanSuggestionRequest(currentState, { error, key, requestVersion } = {}) {
    const current = currentState || createInitialBanSuggestionState();
    if (
      !current.visible ||
      current.activeKey !== key ||
      current.requestVersion !== requestVersion
    ) {
      return current;
    }

    return {
      ...current,
      error: typeof error === "string" ? error : "Ban recommendations are unavailable.",
      loading: false,
      payload: null,
    };
  }

  return {
    buildBanSuggestionCacheKey,
    completeBanSuggestionRequest,
    createInitialBanSuggestionState,
    failBanSuggestionRequest,
    normalizeBanSuggestionHovers,
    reconcileBanSuggestionState,
  };
});
