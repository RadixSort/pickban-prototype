"use strict";

const EMPTY_ROWS = new Map();

function normalizeTargetRoles(targetRoles = []) {
  const normalizedTargetRoles = [];
  const seenTargetRoles = new Set();

  for (const targetRole of targetRoles) {
    if (!targetRole || seenTargetRoles.has(targetRole)) {
      continue;
    }

    seenTargetRoles.add(targetRole);
    normalizedTargetRoles.push(targetRole);
  }

  return normalizedTargetRoles;
}

async function buildTargetRoleRowResults(targetRoles = [], fetchRowsByTargetRoles) {
  const normalizedTargetRoles = normalizeTargetRoles(targetRoles);
  if (normalizedTargetRoles.length === 0) {
    return new Map();
  }

  try {
    const rowsByTargetRole = await fetchRowsByTargetRoles(normalizedTargetRoles);
    return buildFulfilledTargetRoleRowResults(normalizedTargetRoles, rowsByTargetRole);
  } catch (error) {
    return buildRejectedTargetRoleRowResults(normalizedTargetRoles, error);
  }
}

async function buildTargetRoleRowResultsWithFallback(
  targetRoles = [],
  {
    fetchPrimaryRowsByTargetRoles,
    fetchFallbackRowsByTargetRoles,
  } = {},
) {
  const normalizedTargetRoles = normalizeTargetRoles(targetRoles);
  if (normalizedTargetRoles.length === 0) {
    return new Map();
  }

  if (typeof fetchFallbackRowsByTargetRoles !== "function") {
    return buildTargetRoleRowResults(normalizedTargetRoles, fetchPrimaryRowsByTargetRoles);
  }

  try {
    const primaryRowsByTargetRole = await fetchPrimaryRowsByTargetRoles(normalizedTargetRoles);
    const targetRoleRowResults = buildFulfilledTargetRoleRowResults(
      normalizedTargetRoles,
      primaryRowsByTargetRole,
    );
    const missingTargetRoles = getMissingTargetRoles(
      targetRoleRowResults,
      normalizedTargetRoles,
    );

    if (missingTargetRoles.length === 0) {
      return targetRoleRowResults;
    }

    try {
      const fallbackRowsByTargetRole = await fetchFallbackRowsByTargetRoles(missingTargetRoles);
      const fallbackTargetRoleRowResults = buildFulfilledTargetRoleRowResults(
        missingTargetRoles,
        fallbackRowsByTargetRole,
      );

      for (const targetRole of missingTargetRoles) {
        targetRoleRowResults.set(targetRole, fallbackTargetRoleRowResults.get(targetRole));
      }
    } catch (error) {
      const rejectedTargetRoleRowResults = buildRejectedTargetRoleRowResults(
        missingTargetRoles,
        error,
      );

      for (const targetRole of missingTargetRoles) {
        targetRoleRowResults.set(targetRole, rejectedTargetRoleRowResults.get(targetRole));
      }
    }

    return targetRoleRowResults;
  } catch (_error) {
    return buildTargetRoleRowResults(normalizedTargetRoles, fetchFallbackRowsByTargetRoles);
  }
}

function buildFulfilledTargetRoleRowResults(targetRoles = [], rowsByTargetRole = new Map()) {
  const targetRoleRowResults = new Map();

  for (const targetRole of targetRoles) {
    targetRoleRowResults.set(targetRole, {
      status: "fulfilled",
      value: getRowsByTargetRole(rowsByTargetRole, targetRole),
    });
  }

  return targetRoleRowResults;
}

function buildRejectedTargetRoleRowResults(targetRoles = [], error) {
  const targetRoleRowResults = new Map();

  for (const targetRole of targetRoles) {
    targetRoleRowResults.set(targetRole, {
      status: "rejected",
      reason: error,
    });
  }

  return targetRoleRowResults;
}

function getTargetRoleRowResult(targetRoleRowResults, targetRole) {
  return (
    targetRoleRowResults?.get(targetRole) || {
      status: "fulfilled",
      value: EMPTY_ROWS,
    }
  );
}

function getMissingTargetRoles(targetRoleRowResults, targetRoles = []) {
  return targetRoles.filter((targetRole) => {
    const targetRoleRowResult = targetRoleRowResults.get(targetRole);
    return (
      !targetRoleRowResult ||
      targetRoleRowResult.status !== "fulfilled" ||
      targetRoleRowResult.value.size === 0
    );
  });
}

function getRowsByTargetRole(rowsByTargetRole, targetRole) {
  if (rowsByTargetRole instanceof Map) {
    return rowsByTargetRole.get(targetRole) || EMPTY_ROWS;
  }

  if (!rowsByTargetRole || typeof rowsByTargetRole !== "object") {
    return EMPTY_ROWS;
  }

  const rows = rowsByTargetRole[targetRole];
  return rows instanceof Map ? rows : EMPTY_ROWS;
}

module.exports = {
  buildTargetRoleRowResults,
  buildTargetRoleRowResultsWithFallback,
  getTargetRoleRowResult,
  normalizeTargetRoles,
};
