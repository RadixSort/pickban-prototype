(function initializeRoles(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }

  globalScope.roles = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, () => {
  const DEFAULT_TARGET_ROLE = "support";
  const ROLE_OPTIONS = [
    { value: "top", label: "Top" },
    { value: "jungle", label: "Jungle" },
    { value: "middle", label: "Mid" },
    { value: "bottom", label: "Bot" },
    { value: "support", label: "Support" },
  ];

  const roleByAlias = new Map([
    ["top", "top"],
    ["jungle", "jungle"],
    ["jg", "jungle"],
    ["jng", "jungle"],
    ["mid", "middle"],
    ["middle", "middle"],
    ["bot", "bottom"],
    ["bottom", "bottom"],
    ["adc", "bottom"],
    ["support", "support"],
    ["utility", "support"],
    ["sup", "support"],
  ]);

  const roleLabelByValue = new Map(ROLE_OPTIONS.map((option) => [option.value, option.label]));

  function normalizeRole(value) {
    if (value == null) {
      return null;
    }

    if (typeof value !== "string") {
      return null;
    }

    return roleByAlias.get(value.trim().toLowerCase()) || null;
  }

  function getRoleLabel(value) {
    const normalized = normalizeRole(value);
    return roleLabelByValue.get(normalized || DEFAULT_TARGET_ROLE) || "Support";
  }

  function getTargetRoleOptions() {
    return ROLE_OPTIONS.map((option) => ({ ...option }));
  }

  function getSuggestedAllyRole(allies = [], allyId = null, roleLikelihoodsByRole = null) {
    if (!Array.isArray(allies) || allies.length === 0 || allyId == null) {
      return null;
    }

    const targetIndex = allies.findIndex((ally) => ally?.id === allyId);
    if (targetIndex === -1) {
      return null;
    }

    const assignedRoles = new Set();
    for (let index = 0; index < allies.length; index += 1) {
      if (index === targetIndex) {
        continue;
      }

      const normalizedRole = normalizeRole(allies[index]?.role ?? allies[index]?.lane ?? null);
      if (normalizedRole) {
        assignedRoles.add(normalizedRole);
      }
    }

    const currentRole = normalizeRole(allies[targetIndex]?.role ?? allies[targetIndex]?.lane ?? null);
    if (currentRole && !assignedRoles.has(currentRole)) {
      return currentRole;
    }

    const availableRoleOptions = ROLE_OPTIONS.filter((option) => !assignedRoles.has(option.value));
    const roleFromLikelihoods = getMostLikelyAvailableRole(
      availableRoleOptions,
      roleLikelihoodsByRole,
    );

    return roleFromLikelihoods || availableRoleOptions[0]?.value || null;
  }

  function resolveAllyRoleAssignment(
    allies = [],
    allyId = null,
    nextRole = null,
    roleLikelihoodsByChampionKey = null,
  ) {
    if (!Array.isArray(allies)) {
      return [];
    }

    const updatedAllies = allies.map((ally) => ({ ...ally }));
    if (updatedAllies.length === 0 || allyId == null) {
      return updatedAllies;
    }

    const targetIndex = updatedAllies.findIndex((ally) => ally?.id === allyId);
    if (targetIndex === -1) {
      return updatedAllies;
    }

    const normalizedNextRole = normalizeRole(nextRole);
    if (!normalizedNextRole) {
      updatedAllies[targetIndex].role = "";
      return updatedAllies;
    }

    const currentRole = normalizeRole(
      updatedAllies[targetIndex]?.role ?? updatedAllies[targetIndex]?.lane ?? null,
    );

    if (currentRole === normalizedNextRole) {
      updatedAllies[targetIndex].role = normalizedNextRole;
      return updatedAllies;
    }

    const displacedIndex = updatedAllies.findIndex(
      (ally, index) =>
        index !== targetIndex &&
        normalizeRole(ally?.role ?? ally?.lane ?? null) === normalizedNextRole,
    );

    updatedAllies[targetIndex].role = normalizedNextRole;

    if (displacedIndex === -1) {
      return updatedAllies;
    }

    const fallbackRole =
      currentRole && currentRole !== normalizedNextRole
        ? currentRole
        : getDisplacedAllyRoleSuggestion(
            updatedAllies,
            displacedIndex,
            roleLikelihoodsByChampionKey,
          );

    updatedAllies[displacedIndex].role = fallbackRole || "";
    return updatedAllies;
  }

  function getDisplacedAllyRoleSuggestion(
    allies = [],
    displacedIndex = -1,
    roleLikelihoodsByChampionKey = null,
  ) {
    const displacedAlly = allies[displacedIndex];
    if (!displacedAlly?.id) {
      return null;
    }

    const roleLikelihoodsByRole =
      roleLikelihoodsByChampionKey &&
      typeof roleLikelihoodsByChampionKey === "object" &&
      displacedAlly.key != null
        ? roleLikelihoodsByChampionKey[String(displacedAlly.key)] || null
        : null;
    const projectedAllies = allies.map((ally, index) =>
      index === displacedIndex
        ? {
            ...ally,
            role: "",
          }
        : ally,
    );

    return getSuggestedAllyRole(projectedAllies, displacedAlly.id, roleLikelihoodsByRole);
  }

  function getMostLikelyAvailableRole(availableRoleOptions, roleLikelihoodsByRole) {
    if (!Array.isArray(availableRoleOptions) || availableRoleOptions.length === 0) {
      return null;
    }

    if (!roleLikelihoodsByRole || typeof roleLikelihoodsByRole !== "object") {
      return null;
    }

    const rankedOptions = availableRoleOptions
      .map((option, index) => {
        const likelihood = roleLikelihoodsByRole[option.value];
        const lanePercent = Number(likelihood?.lanePercent);
        const pickRate = Number(likelihood?.pickRate);
        const winRate = Number(likelihood?.winRate);

        if (!Number.isFinite(lanePercent)) {
          return null;
        }

        return {
          value: option.value,
          index,
          lanePercent,
          pickRate: Number.isFinite(pickRate) ? pickRate : Number.NEGATIVE_INFINITY,
          winRate: Number.isFinite(winRate) ? winRate : Number.NEGATIVE_INFINITY,
        };
      })
      .filter(Boolean)
      .sort(
        (left, right) =>
          right.lanePercent - left.lanePercent ||
          right.pickRate - left.pickRate ||
          right.winRate - left.winRate ||
          left.index - right.index,
      );

    return rankedOptions[0]?.value || null;
  }

  function getUnassignedTargetRoleOptions(allies = []) {
    const assignedRoles = new Set();

    for (const ally of allies) {
      const normalizedRole = normalizeRole(ally?.role ?? ally?.lane ?? null);
      if (normalizedRole) {
        assignedRoles.add(normalizedRole);
      }
    }

    return ROLE_OPTIONS.filter((option) => !assignedRoles.has(option.value)).map((option) => ({
      ...option,
    }));
  }

  function getAutoAssignableAllyRole(allies = [], { requireFullTeam = true } = {}) {
    if (!Array.isArray(allies) || allies.length === 0) {
      return null;
    }

    if (requireFullTeam && allies.length !== ROLE_OPTIONS.length) {
      return null;
    }

    const unassignedAllies = allies
      .map((ally, index) => ({
        ally,
        index,
        role: normalizeRole(ally?.role ?? ally?.lane ?? null),
      }))
      .filter((entry) => !entry.role);
    const unassignedRoleOptions = getUnassignedTargetRoleOptions(allies);

    if (unassignedAllies.length !== 1 || unassignedRoleOptions.length !== 1) {
      return null;
    }

    return {
      ally: unassignedAllies[0].ally,
      allyIndex: unassignedAllies[0].index,
      role: unassignedRoleOptions[0].value,
    };
  }

  return {
    DEFAULT_TARGET_ROLE,
    ROLE_OPTIONS,
    getAutoAssignableAllyRole,
    getRoleLabel,
    getSuggestedAllyRole,
    getTargetRoleOptions,
    getUnassignedTargetRoleOptions,
    normalizeRole,
    resolveAllyRoleAssignment,
  };
});
