(function initializeLaneOpponentWeight(globalScope, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./roles.js"));
    return;
  }

  globalScope.laneOpponentWeight = factory(globalScope.roles || {});
})(typeof globalThis !== "undefined" ? globalThis : this, (roles = {}) => {
  const DEFAULT_LANE_OPPONENT_WEIGHT = 3;
  const LANE_OPPONENT_WEIGHT_OPTIONS = Object.freeze([
    Object.freeze({ value: 1, label: "×1" }),
    Object.freeze({ value: 2, label: "×2" }),
    Object.freeze({ value: 3, label: "×3" }),
    Object.freeze({ value: 4, label: "×4" }),
  ]);
  const DEFAULT_LANE_OPPONENT_WEIGHT_BY_ROLE = Object.freeze({
    top: 3,
    jungle: 1,
    middle: 2,
    bottom: 2,
    support: 1,
  });
  const SHARED_BOTTOM_LANE_ROLES = new Set(["bottom", "support"]);
  const normalizeRole =
    typeof roles.normalizeRole === "function"
      ? roles.normalizeRole
      : (value) => (typeof value === "string" ? value.trim().toLowerCase() : null);

  function normalizeLaneOpponentWeight(value) {
    if (value == null || value === "") {
      return null;
    }

    const numericValue =
      typeof value === "number"
        ? value
        : typeof value === "string" && /^[1-4]$/.test(value.trim())
          ? Number(value.trim())
          : Number.NaN;
    return Number.isInteger(numericValue) && numericValue >= 1 && numericValue <= 4
      ? numericValue
      : null;
  }

  function getLaneOpponentWeightOptions() {
    return LANE_OPPONENT_WEIGHT_OPTIONS.map((option) => ({ ...option }));
  }

  function getDefaultLaneOpponentWeightForRole(role) {
    const normalizedRole = normalizeRole(role);
    return (
      DEFAULT_LANE_OPPONENT_WEIGHT_BY_ROLE[normalizedRole] || DEFAULT_LANE_OPPONENT_WEIGHT
    );
  }

  function getLaneOpponentWeightAfterRoleChange(
    currentWeight,
    previousRole,
    nextRole,
  ) {
    const previousDefault = getDefaultLaneOpponentWeightForRole(previousRole);
    const nextDefault = getDefaultLaneOpponentWeightForRole(nextRole);
    const normalizedCurrentWeight =
      normalizeLaneOpponentWeight(currentWeight) || previousDefault;

    return previousDefault === nextDefault ? normalizedCurrentWeight : nextDefault;
  }

  function rolesShareLane(leftRole, rightRole) {
    const normalizedLeftRole = normalizeRole(leftRole);
    const normalizedRightRole = normalizeRole(rightRole);

    if (!normalizedLeftRole || !normalizedRightRole) {
      return false;
    }

    return (
      normalizedLeftRole === normalizedRightRole ||
      (SHARED_BOTTOM_LANE_ROLES.has(normalizedLeftRole) &&
        SHARED_BOTTOM_LANE_ROLES.has(normalizedRightRole))
    );
  }

  return {
    DEFAULT_LANE_OPPONENT_WEIGHT,
    DEFAULT_LANE_OPPONENT_WEIGHT_BY_ROLE,
    LANE_OPPONENT_WEIGHT_OPTIONS,
    getDefaultLaneOpponentWeightForRole,
    getLaneOpponentWeightAfterRoleChange,
    getLaneOpponentWeightOptions,
    normalizeLaneOpponentWeight,
    rolesShareLane,
  };
});
