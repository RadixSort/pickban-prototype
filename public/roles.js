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

  function getAssignableAllyRoleOptions(targetRole = DEFAULT_TARGET_ROLE) {
    const normalizedTargetRole = normalizeRole(targetRole) || DEFAULT_TARGET_ROLE;
    return ROLE_OPTIONS.filter((option) => option.value !== normalizedTargetRole).map((option) => ({
      ...option,
    }));
  }

  return {
    DEFAULT_TARGET_ROLE,
    ROLE_OPTIONS,
    getAssignableAllyRoleOptions,
    getRoleLabel,
    getTargetRoleOptions,
    getUnassignedTargetRoleOptions,
    normalizeRole,
  };
});
