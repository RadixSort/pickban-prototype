(function initializeEnemyRoleAssignments(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./roles.js"));
    return;
  }

  globalScope.enemyRoleAssignments = factory(globalScope.roles || {});
})(typeof globalThis !== "undefined" ? globalThis : this, (roles = {}) => {
  const normalizeRole =
    typeof roles.normalizeRole === "function"
      ? roles.normalizeRole
      : (value) => (typeof value === "string" ? value.trim().toLowerCase() : null);
  const getTargetRoleOptions =
    typeof roles.getTargetRoleOptions === "function"
      ? roles.getTargetRoleOptions
      : () => [
          { value: "top", label: "Top" },
          { value: "jungle", label: "Jungle" },
          { value: "middle", label: "Mid" },
          { value: "bottom", label: "Bot" },
          { value: "support", label: "Support" },
        ];

  /**
   * Keep automatic assignments unique by giving the highest-probability
   * champion/role pairs first claim on each unreserved role. Manual choices
   * stay fixed and may intentionally duplicate one another.
   */
  function assignEnemyRoles(enemies = [], likelihoodsByChampionKey = null) {
    if (!Array.isArray(enemies)) {
      return [];
    }

    const roleOptions = getTargetRoleOptions()
      .map((option, index) => ({
        role: normalizeRole(option?.value),
        index,
      }))
      .filter((option) => option.role)
      .filter(
        (option, index, options) =>
          options.findIndex((candidate) => candidate.role === option.role) === index,
      );
    const reservedRoles = new Set();
    const automaticEnemies = [];
    const assignedRolesByEnemyIndex = new Map();

    enemies.forEach((enemy, enemyIndex) => {
      const role = normalizeRole(enemy?.role ?? enemy?.lane ?? null);
      if (enemy?.roleManuallyAssigned && role) {
        reservedRoles.add(role);
        assignedRolesByEnemyIndex.set(enemyIndex, role);
        return;
      }

      automaticEnemies.push({
        enemy,
        enemyIndex,
        currentRole: role,
      });
    });

    const availableRoleOptions = roleOptions.filter(
      (option) => !reservedRoles.has(option.role),
    );
    const probabilityPairs = automaticEnemies.flatMap(({ enemy, enemyIndex }) => {
      const roleLikelihoods =
        likelihoodsByChampionKey &&
        typeof likelihoodsByChampionKey === "object" &&
        enemy?.key != null
          ? likelihoodsByChampionKey[String(enemy.key)] || null
          : null;

      return availableRoleOptions
        .map(({ role, index: roleIndex }) => {
          const likelihood = roleLikelihoods?.[role];
          const lanePercent = Number(likelihood?.lanePercent);
          if (!Number.isFinite(lanePercent)) {
            return null;
          }

          return {
            enemyIndex,
            role,
            roleIndex,
            lanePercent,
            pickRate: toSortableNumber(likelihood?.pickRate),
            winRate: toSortableNumber(likelihood?.winRate),
          };
        })
        .filter(Boolean);
    });

    probabilityPairs.sort(
      (left, right) =>
        compareDescending(left.lanePercent, right.lanePercent) ||
        compareDescending(left.pickRate, right.pickRate) ||
        compareDescending(left.winRate, right.winRate) ||
        left.enemyIndex - right.enemyIndex ||
        left.roleIndex - right.roleIndex,
    );

    const assignedAutomaticEnemyIndexes = new Set();
    const assignedAutomaticRoles = new Set();
    probabilityPairs.forEach((pair) => {
      if (
        assignedAutomaticEnemyIndexes.has(pair.enemyIndex) ||
        assignedAutomaticRoles.has(pair.role)
      ) {
        return;
      }

      assignedRolesByEnemyIndex.set(pair.enemyIndex, pair.role);
      assignedAutomaticEnemyIndexes.add(pair.enemyIndex);
      assignedAutomaticRoles.add(pair.role);
    });

    const remainingRoles = availableRoleOptions
      .map((option) => option.role)
      .filter((role) => !assignedAutomaticRoles.has(role));
    automaticEnemies.forEach(({ enemyIndex, currentRole }) => {
      if (assignedRolesByEnemyIndex.has(enemyIndex)) {
        return;
      }

      const currentRoleIndex = remainingRoles.indexOf(currentRole);
      const fallbackIndex = currentRoleIndex >= 0 ? currentRoleIndex : 0;
      const [fallbackRole = ""] = remainingRoles.splice(fallbackIndex, 1);
      assignedRolesByEnemyIndex.set(enemyIndex, fallbackRole);
    });

    return enemies.map((enemy, enemyIndex) => ({
      ...enemy,
      role: assignedRolesByEnemyIndex.get(enemyIndex) || "",
      roleManuallyAssigned: Boolean(
        enemy?.roleManuallyAssigned &&
        normalizeRole(enemy?.role ?? enemy?.lane ?? null),
      ),
    }));
  }

  /**
   * Apply a speculative user-selected role without changing any other enemy.
   * Manual changes may intentionally create duplicates.
   */
  function resolveEnemyRoleSelection(
    enemies = [],
    enemyId = null,
    nextRole = null,
  ) {
    if (!Array.isArray(enemies)) {
      return [];
    }

    const updatedEnemies = enemies.map((enemy) => ({ ...enemy }));
    const targetIndex = updatedEnemies.findIndex((enemy) => enemy?.id === enemyId);
    const normalizedNextRole = normalizeRole(nextRole);
    if (targetIndex === -1 || !normalizedNextRole) {
      return updatedEnemies;
    }

    updatedEnemies[targetIndex].role = normalizedNextRole;
    updatedEnemies[targetIndex].roleManuallyAssigned = true;

    return updatedEnemies;
  }

  function compareDescending(left, right) {
    return left === right ? 0 : right - left;
  }

  function toSortableNumber(value) {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : Number.NEGATIVE_INFINITY;
  }

  return {
    assignEnemyRoles,
    resolveEnemyRoleSelection,
  };
});
