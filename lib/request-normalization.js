function normalizeChampionName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeRequestEnvelope(
  value,
  {
    defaultRankFilter,
    normalizeRankFilter,
    createError = createHttpError,
  } = {},
) {
  const requestBody = requireRequestBodyObject(value, createError);

  return {
    requestBody,
    rankFilter: normalizeRequestedRankFilter(requestBody.rankFilter ?? requestBody.tier ?? null, {
      defaultRankFilter,
      normalizeRankFilter,
      createError,
    }),
  };
}

/**
 * Normalize and validate the rank-filter field while preserving the current
 * server default when the request omits it.
 */
function normalizeRequestedRankFilter(
  value,
  {
    defaultRankFilter,
    normalizeRankFilter,
    createError = createHttpError,
  } = {},
) {
  if (value == null || value === "") {
    return defaultRankFilter;
  }

  if (typeof value !== "string") {
    throw createError(400, 'Request field "rankFilter" contains an invalid rank filter.');
  }

  const normalized = normalizeRankFilter(value);
  if (!normalized) {
    throw createError(400, 'Request field "rankFilter" contains an invalid rank filter.');
  }

  return normalized;
}

/**
 * Normalize enemy-like champion arrays into local champion metadata objects.
 */
function normalizeChampionSelections(
  value,
  {
    championByName,
    maxCount,
    label,
    createError = createHttpError,
  } = {},
) {
  return normalizeSelections(value, {
    championByName,
    maxCount,
    label,
    createEntry: (entry) => {
      if (typeof entry !== "string" || entry.trim() === "") {
        throw createError(400, `Request field "${label}" contains an invalid champion name.`);
      }

      return {
        championName: entry,
      };
    },
    createNormalizedSelection: ({ champion }) => champion,
    createError,
  });
}

/**
 * Normalize ally selections, supporting both plain champion strings and
 * objects that include optional role or lane assignments.
 */
function normalizeAllySelections(
  value,
  {
    championByName,
    maxCount,
    label,
    normalizeRole,
    createError = createHttpError,
  } = {},
) {
  return normalizeSelections(value, {
    championByName,
    maxCount,
    label,
    createEntry: (entry) => normalizeAllySelectionEntry(entry, label, normalizeRole, createError),
    createNormalizedSelection: ({ champion, role }) => ({
      champion,
      role,
    }),
    createError,
  });
}

/**
 * Validate the dedicated `/build-suggestions` request shape.
 *
 * Unlike `/suggest`, this endpoint requires exactly one allied champion with
 * an assigned role. Enemy champions remain optional so the server can fetch
 * matchup-specific build data or fall back to generic champion build data
 * when no enemy matchup is selected.
 */
function normalizeBuildSuggestionRequest(
  value,
  {
    championByName,
    defaultRankFilter,
    normalizeRankFilter,
    normalizeRole,
    createError = createHttpError,
  } = {},
) {
  const { requestBody, rankFilter } = normalizeRequestEnvelope(value, {
    defaultRankFilter,
    normalizeRankFilter,
    createError,
  });
  const allyValue = requestBody.ally;

  if (!allyValue || typeof allyValue !== "object" || Array.isArray(allyValue)) {
    throw createError(400, 'Request field "ally" is required.');
  }

  const allies = normalizeAllySelections([allyValue], {
    championByName,
    maxCount: 1,
    label: "ally",
    normalizeRole,
    createError,
  });
  const ally = allies[0] || null;

  if (!ally) {
    throw createError(400, 'Request field "ally" is required.');
  }

  if (!ally.role) {
    throw createError(400, 'Request field "ally.role" is required.');
  }

  const enemies = normalizeChampionSelections(requestBody.enemies, {
    championByName,
    maxCount: 5,
    label: "enemies",
    createError,
  });

  validateNoOpposingChampionSelections([ally], enemies, createError);

  return {
    ally,
    enemies,
    rankFilter,
  };
}

/**
 * Validate the full-draft projection request shape.
 *
 * This endpoint requires exactly five allied champions with unique assigned
 * roles. Enemy champions remain optional so the projection can still reflect
 * ally-only drafts when the opposing composition is not fully known yet.
 */
function normalizeDraftProjectionRequest(
  value,
  {
    championByName,
    defaultRankFilter,
    normalizeRankFilter,
    normalizeRole,
    createError = createHttpError,
  } = {},
) {
  const { requestBody, rankFilter } = normalizeRequestEnvelope(value, {
    defaultRankFilter,
    normalizeRankFilter,
    createError,
  });
  const allies = normalizeAllySelections(requestBody.allies, {
    championByName,
    maxCount: 5,
    label: "allies",
    normalizeRole,
    createError,
  });
  const enemies = normalizeChampionSelections(requestBody.enemies, {
    championByName,
    maxCount: 5,
    label: "enemies",
    createError,
  });

  if (allies.length !== 5) {
    throw createError(400, 'Request field "allies" must contain exactly 5 allied champions.');
  }

  validateAllyRoleAssignments(allies, createError);

  if (allies.some((ally) => !ally.role)) {
    throw createError(400, "Assign all five allied roles before projecting the draft win rate.");
  }

  validateNoOpposingChampionSelections(allies, enemies, createError);

  return {
    allies,
    enemies,
    rankFilter,
  };
}

/**
 * Reject duplicate ally role assignments so the server can infer unassigned
 * target roles deterministically.
 */
function validateAllyRoleAssignments(allies = [], createError = createHttpError) {
  const seenRoles = new Set();

  for (const ally of allies) {
    if (!ally.role) {
      continue;
    }

    if (seenRoles.has(ally.role)) {
      throw createError(
        400,
        'Request field "allies" cannot assign the same role to multiple allied champions.',
      );
    }

    seenRoles.add(ally.role);
  }
}

function validateNoOpposingChampionSelections(
  allies = [],
  enemies = [],
  createError = createHttpError,
) {
  const allyChampionNamesByKey = new Map();

  for (const ally of allies) {
    const champion = getSelectionChampion(ally);
    const championKey = champion?.key != null ? String(champion.key) : null;
    if (!championKey) {
      continue;
    }

    allyChampionNamesByKey.set(championKey, champion.name || "Unknown champion");
  }

  for (const enemy of enemies) {
    const champion = getSelectionChampion(enemy);
    const championKey = champion?.key != null ? String(champion.key) : null;
    if (!championKey || !allyChampionNamesByKey.has(championKey)) {
      continue;
    }

    throw createError(
      400,
      `Champion "${allyChampionNamesByKey.get(championKey)}" cannot appear on both allied and enemy sides.`,
    );
  }
}

function normalizeSelections(
  value,
  {
    championByName,
    maxCount,
    label,
    createEntry,
    createNormalizedSelection,
    createError,
  },
) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createError(400, `Request field "${label}" must be an array.`);
  }

  const seenChampionKeys = new Set();
  const normalizedSelections = [];

  for (const entry of value) {
    const parsedEntry = createEntry(entry);
    const champion = championByName.get(normalizeChampionName(parsedEntry.championName));
    if (!champion) {
      throw createError(400, `Unknown champion "${parsedEntry.championName}".`);
    }

    if (seenChampionKeys.has(champion.key)) {
      continue;
    }

    seenChampionKeys.add(champion.key);
    normalizedSelections.push(
      createNormalizedSelection({
        champion,
        role: parsedEntry.role ?? null,
      }),
    );
  }

  if (normalizedSelections.length > maxCount) {
    throw createError(
      400,
      `Request field "${label}" can contain at most ${maxCount} unique champions.`,
    );
  }

  return normalizedSelections;
}

function normalizeAllySelectionEntry(entry, label, normalizeRole, createError) {
  let championName = entry;
  let role = null;

  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    championName = entry.champion ?? entry.name;
    role = normalizeAllyRole(entry.role ?? entry.lane ?? null, label, normalizeRole, createError);
  }

  if (typeof championName !== "string" || championName.trim() === "") {
    throw createError(400, `Request field "${label}" contains an invalid champion name.`);
  }

  return {
    championName,
    role,
  };
}

function normalizeAllyRole(value, label, normalizeRole, createError) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createError(400, `Request field "${label}" contains an invalid ally role.`);
  }

  const normalized = normalizeRole(value);
  if (!normalized) {
    throw createError(400, `Request field "${label}" contains an invalid ally role.`);
  }

  return normalized;
}

function getSelectionChampion(selection) {
  if (!selection || typeof selection !== "object") {
    return null;
  }

  if (selection.champion && typeof selection.champion === "object") {
    return selection.champion;
  }

  return selection;
}

function requireRequestBodyObject(value, createError = createHttpError) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createError(400, "Request body must be an object.");
  }

  return value;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  normalizeAllySelections,
  normalizeBuildSuggestionRequest,
  normalizeDraftProjectionRequest,
  normalizeChampionName,
  normalizeChampionSelections,
  normalizeRequestedRankFilter,
  validateAllyRoleAssignments,
  validateNoOpposingChampionSelections,
};
