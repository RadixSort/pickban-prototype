"use strict";

/**
 * Ban suggestions always cover the complete role set. Invalid or incomplete
 * hover records are ignored so their lanes naturally use the PBI fallback.
 */
function normalizeBanSuggestionRequest(
  value,
  {
    championByKey = new Map(),
    championByName = new Map(),
    defaultRankFilter,
    normalizeChampionName,
    normalizeRankFilter,
    normalizeRole,
    roleOptions = [],
    createError = createHttpError,
  } = {},
) {
  const requestBody = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const requestedRankFilter = requestBody.rankFilter ?? requestBody.tier ?? null;
  const rankFilter = normalizeRequestedRankFilter(requestedRankFilter, {
    defaultRankFilter,
    normalizeRankFilter,
    createError,
  });
  const supportedRoles = new Set(roleOptions.map((option) => option.value));
  const hoversByRole = new Map();
  const unavailableChampionKeys = new Set();

  for (const entry of Array.isArray(requestBody.hovers) ? requestBody.hovers : []) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const role = normalizeRole(entry.role ?? entry.lane ?? null);
    const championName = entry.champion ?? entry.name ?? null;
    const champion =
      typeof championName === "string"
        ? championByName.get(normalizeChampionName(championName)) || null
        : null;

    if (!role || !supportedRoles.has(role) || !champion || hoversByRole.has(role)) {
      continue;
    }

    hoversByRole.set(role, champion);
  }

  for (const value of Array.isArray(requestBody.unavailableChampionKeys)
    ? requestBody.unavailableChampionKeys
    : []) {
    const championKey = String(
      value && typeof value === "object" ? value.championKey ?? value.key ?? "" : value ?? "",
    ).trim();
    if (championKey && championByKey.has(championKey)) {
      unavailableChampionKeys.add(championKey);
    }
  }

  return {
    hoversByRole,
    rankFilter,
    unavailableChampionKeys,
  };
}

function normalizeRequestedRankFilter(
  value,
  { defaultRankFilter, normalizeRankFilter, createError = createHttpError } = {},
) {
  if (value == null || value === "") {
    return defaultRankFilter;
  }

  if (typeof value !== "string") {
    throw createError(400, 'Request field "rankFilter" contains an invalid rank filter.');
  }

  const normalizedRankFilter = normalizeRankFilter(value);
  if (!normalizedRankFilter) {
    throw createError(400, 'Request field "rankFilter" contains an invalid rank filter.');
  }

  return normalizedRankFilter;
}

function buildBanSuggestionCacheKey({
  hoversByRole = new Map(),
  patch = "",
  rankFilter = "",
  roleOptions = [],
  unavailableChampionKeys = new Set(),
} = {}) {
  const hoverParts = roleOptions.map(({ value: role }) => {
    const champion = hoversByRole.get(role);
    return `${role}=${String(champion?.key || "")}`;
  });

  const unavailablePart = Array.from(unavailableChampionKeys)
    .map(String)
    .sort((left, right) => Number(left) - Number(right))
    .join(",");

  return [
    `rank=${rankFilter}`,
    `patch=${patch}`,
    ...hoverParts,
    `unavailable=${unavailablePart}`,
  ].join("|");
}

/**
 * Prefer the already-ranked counter result for a valid lane hover. If no
 * usable counter survives, use that lane's already-ranked PBI result.
 */
function buildBanSuggestion({
  counterResults = [],
  fallbackResults = [],
  hoverChampion = null,
  role = "",
} = {}) {
  const counterResult = hoverChampion ? counterResults[0] || null : null;
  const fallbackResult = fallbackResults[0] || null;
  const result = counterResult || fallbackResult;

  if (!result) {
    return null;
  }

  return {
    role,
    champion: result.candidate || result.support || "",
    championKey: String(result.candidateKey ?? result.supportKey ?? ""),
    icon: result.icon || "",
    strategy: counterResult ? "counter" : "pbi",
    hoveredChampion: counterResult ? hoverChampion.name : "",
    hoveredChampionKey: counterResult ? String(hoverChampion.key) : "",
    pbi: toFiniteNumber(result.pbi),
    winRate: toFiniteNumber(result.winRate),
    projectedWinRate: toFiniteNumber(result.projectedWinRate),
    counterScore: toFiniteNumber(result.counterScore),
  };
}

function toFiniteNumber(value) {
  if (value == null || value === "") {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  buildBanSuggestion,
  buildBanSuggestionCacheKey,
  normalizeBanSuggestionRequest,
};
