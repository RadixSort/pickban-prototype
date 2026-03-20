function normalizeChampionName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createError(400, "Request body must be an object.");
  }

  const rankFilter = normalizeRequestedRankFilter(value.rankFilter ?? value.tier ?? null, {
    defaultRankFilter,
    normalizeRankFilter,
    createError,
  });
  const allyValue = value.ally;

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

  const enemies = normalizeChampionSelections(value.enemies, {
    championByName,
    maxCount: 5,
    label: "enemies",
    createError,
  });

  if (enemies.length === 0) {
    throw createError(400, 'Request field "enemies" must contain at least one champion.');
  }

  return {
    ally,
    enemies,
    rankFilter,
  };
}

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

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  normalizeAllySelections,
  normalizeBuildSuggestionRequest,
  normalizeChampionName,
  normalizeChampionSelections,
  normalizeRequestedRankFilter,
  validateAllyRoleAssignments,
};
