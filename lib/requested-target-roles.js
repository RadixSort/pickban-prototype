const {
  DEFAULT_TARGET_ROLE,
  getRoleLabel,
  getUnassignedTargetRoleOptions,
  normalizeRole,
} = require("../public/roles.js");

function normalizeRequestedTargetRoles(value) {
  if (value == null) {
    return null;
  }

  if (!Array.isArray(value)) {
    throw createRequestedTargetRoleError('Request field "roles" must be an array.');
  }

  const normalizedRoles = [];
  const seenRoles = new Set();

  for (const entry of value) {
    if (typeof entry !== "string") {
      throw createRequestedTargetRoleError('Request field "roles" contains an invalid target role.');
    }

    const normalizedRole = normalizeRole(entry);
    if (!normalizedRole) {
      throw createRequestedTargetRoleError('Request field "roles" contains an invalid target role.');
    }

    if (seenRoles.has(normalizedRole)) {
      continue;
    }

    seenRoles.add(normalizedRole);
    normalizedRoles.push(normalizedRole);
  }

  if (normalizedRoles.length === 0) {
    throw createRequestedTargetRoleError('Request field "roles" must contain at least one target role.');
  }

  return normalizedRoles;
}

function resolveRequestedTargetRoles({ allies = [], role = null, targetRole = null, roles = null } = {}) {
  const availableRoles = getUnassignedTargetRoleOptions(allies).map((option) => option.value);
  const availableRoleSet = new Set(availableRoles);
  const requestedRoles =
    normalizeRequestedTargetRoles(roles) || resolveLegacyRequestedRole(role ?? targetRole ?? null);

  if (requestedRoles) {
    for (const requestedRole of requestedRoles) {
      if (!availableRoleSet.has(requestedRole)) {
        throw createRequestedTargetRoleError(
          `Cannot fetch ${getRoleLabel(requestedRole).toLowerCase()} suggestions while that role is assigned to an allied champion.`,
        );
      }
    }

    return requestedRoles;
  }

  return availableRoles.length > 0 ? availableRoles : [DEFAULT_TARGET_ROLE];
}

function resolveLegacyRequestedRole(value) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createRequestedTargetRoleError('Request field "role" contains an invalid target role.');
  }

  const normalizedRole = normalizeRole(value);
  if (!normalizedRole) {
    throw createRequestedTargetRoleError('Request field "role" contains an invalid target role.');
  }

  return [normalizedRole];
}

function createRequestedTargetRoleError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

module.exports = {
  normalizeRequestedTargetRoles,
  resolveRequestedTargetRoles,
};
