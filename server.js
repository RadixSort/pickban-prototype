const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { version: appVersion } = require("./package.json");
const {
  buildEligibleTierStats,
  extractTierListRows,
} = require("./lib/lolalytics-tier-list.js");

const app = express();
const publicDir = path.join(__dirname, "public");
const {
  average,
  compareByProjectedAgency,
} = require(path.join(publicDir, "result-ranking.js"));
const champions = require(path.join(publicDir, "champions.json"));
const {
  DEFAULT_TARGET_ROLE,
  getRoleLabel,
  normalizeRole,
} = require(path.join(publicDir, "roles.js"));
const {
  DEFAULT_RANK_FILTER,
  getLolalyticsTierQueryValue,
  normalizeRankFilter,
} = require(path.join(publicDir, "rank-filters.js"));
const {
  buildSelectedChampionKeys,
  filterUnavailableResults,
} = require(path.join(publicDir, "suggestion-filters.js"));

const PORT = process.env.PORT || 3000;
const PATCH_WINDOW = "7";
const QUEUE = "ranked";
const REGION = "all";
const MIN_SUPPORT_TIER_LIST_PICK_RATE = 0.5;
const MIN_SUPPORT_TIER_LIST_LANE_PERCENT = 10;
const LOLALYTICS_BASE_URL = "https://lolalytics.com";
const LOLALYTICS_MEGA_URL = "https://a1.lolalytics.com/mega/";
const REQUEST_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const SHUTDOWN_GRACE_PERIOD_MS = 1000;

const requestCache = new Map();
const shutdownToken = crypto.randomBytes(24).toString("hex");
const openSockets = new Set();
let server;
let shuttingDown = false;
let forcedShutdownTimer = null;

const championByKey = new Map(
  champions.map((champion) => [String(champion.key), champion]),
);
const championBySlug = new Map(champions.map((champion) => [champion.id, champion]));
const championByName = new Map(
  champions.map((champion) => [normalizeChampionName(champion.name), champion]),
);

app.use(express.json());
app.use(
  express.static(publicDir, {
    etag: false,
    lastModified: false,
    setHeaders(response) {
      response.setHeader("Cache-Control", "no-store");
    },
  }),
);

app.get("/app-config", (_request, response) => {
  response.set("Cache-Control", "no-store");
  response.json({
    version: appVersion,
    canShutdown: true,
    shutdownToken,
  });
});

app.post("/suggest", async (request, response) => {
  try {
    const rankFilter = normalizeRequestedRankFilter(request.body?.rankFilter ?? request.body?.tier ?? null);
    const targetRole = normalizeRequestedRole(request.body?.role ?? request.body?.targetRole ?? null);
    const allies = normalizeAllySelections(request.body?.allies, 4, "allies");
    const enemies = normalizeSelections(request.body?.enemies, 5, "enemies");
    validateAllyRoleAssignments(allies, targetRole);
    const selectedChampionKeys = buildSelectedChampionKeys(allies, enemies);

    if (allies.length === 0 && enemies.length === 0) {
      return response.status(400).json({
        error: "Choose at least one allied or enemy champion before fetching suggestions.",
      });
    }

    const partialFailures = [];
    const eligibleRoleTierStatsPromise = fetchEligibleTierStats(targetRole, rankFilter);

    const allyResults = await Promise.allSettled(
      allies.map(async ({ champion, role }) => ({
        champion,
        role,
        rows: await fetchRoleSynergyRows(champion, role, targetRole, rankFilter),
      })),
    );

    const enemyResults = await Promise.allSettled(
      enemies.map(async (champion) => ({
        champion,
        rows: await fetchRoleCounterRows(champion, targetRole, rankFilter),
      })),
    );

    const eligibleRoleTierStats = await eligibleRoleTierStatsPromise;
    const candidateScores = new Map();

    for (const result of allyResults) {
      if (result.status === "fulfilled") {
        const rows = result.value.rows;
        for (const [candidateKey, row] of rows) {
          const record = getCandidateRecord(candidateScores, candidateKey);
          record.synergyValues.push(row.value);
          if (Number.isFinite(row.winRate)) {
            record.projectedWinRateValues.push(row.winRate);
          }
        }
      } else {
        partialFailures.push(result.reason.message);
      }
    }

    for (const result of enemyResults) {
      if (result.status === "fulfilled") {
        const rows = result.value.rows;
        for (const [candidateKey, row] of rows) {
          const record = getCandidateRecord(candidateScores, candidateKey);
          // Lolalytics counter rows are oriented from the enemy pick's perspective.
          record.counterValues.push(-row.value);
          if (Number.isFinite(row.winRate)) {
            record.projectedWinRateValues.push(row.winRate);
          }
        }
      } else {
        partialFailures.push(result.reason.message);
      }
    }

    const results = filterUnavailableResults(
      Array.from(candidateScores.values())
        .map((candidate) => {
          const roleTierStats = eligibleRoleTierStats.get(String(candidate.key));
          if (!roleTierStats) {
            return null;
          }

          const synergyScore = average(candidate.synergyValues);
          const counterScore = average(candidate.counterValues);
          const projectedWinRate = average(candidate.projectedWinRateValues);
          const projectedAgency = 0.5 * synergyScore + 0.5 * counterScore;

          return {
            candidate: candidate.name,
            candidateKey: candidate.key,
            support: candidate.name,
            supportKey: candidate.key,
            icon: candidate.icon,
            role: targetRole,
            synergyScore,
            counterScore,
            projectedWinRate,
            projectedAgency,
            finalScore: projectedAgency,
            lanePercent: roleTierStats.lanePercent,
            pickRate: roleTierStats.pickRate,
            winRate: roleTierStats.winRate,
          };
        })
        .filter(Boolean)
        .sort(compareByProjectedAgency),
      selectedChampionKeys,
    );

    if (results.length === 0) {
      return response.status(502).json({
        error: `No ${getRoleLabel(targetRole).toLowerCase()} data was returned from Lolalytics for the selected champions.`,
        meta: {
          rankFilter,
          role: targetRole,
          allyCount: allies.length,
          enemyCount: enemies.length,
          assignedRoleCount: allies.filter((ally) => ally.role).length,
          partialFailures,
        },
      });
    }

    response.json({
      results,
      meta: {
        rankFilter,
        role: targetRole,
        allyCount: allies.length,
        enemyCount: enemies.length,
        assignedRoleCount: allies.filter((ally) => ally.role).length,
        partialFailures,
      },
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    response.status(statusCode).json({
      error: error.message || "Unexpected server error.",
    });
  }
});

app.post("/shutdown", (request, response) => {
  if (!isAuthorizedShutdownRequest(request)) {
    return response.status(403).json({
      error: "Only the local app page can stop this server.",
    });
  }

  if (shuttingDown) {
    return response.status(202).json({
      message: "App shutdown is already in progress.",
    });
  }

  response.json({
    message: "PickBan is closing. You can close this browser tab.",
  });

  setImmediate(() => {
    beginShutdown("browser close request");
  });
});

server = app.listen(PORT, () => {
  console.log(`PickBan prototype running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C in this terminal or use the in-app Close App button to stop it.");
});

server.on("connection", (socket) => {
  openSockets.add(socket);
  socket.on("close", () => {
    openSockets.delete(socket);
  });
});

process.on("SIGINT", () => {
  if (shuttingDown) {
    process.exit(1);
  }

  beginShutdown("Ctrl+C");
});

process.on("SIGTERM", () => {
  beginShutdown("SIGTERM");
});

function normalizeSelections(value, maxCount, label) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createHttpError(400, `Request field "${label}" must be an array.`);
  }

  const seen = new Set();
  const normalized = [];

  for (const entry of value) {
    if (typeof entry !== "string" || entry.trim() === "") {
      throw createHttpError(400, `Request field "${label}" contains an invalid champion name.`);
    }

    const champion = championByName.get(normalizeChampionName(entry));
    if (!champion) {
      throw createHttpError(400, `Unknown champion "${entry}".`);
    }

    if (seen.has(champion.key)) {
      continue;
    }

    seen.add(champion.key);
    normalized.push(champion);
  }

  if (normalized.length > maxCount) {
    throw createHttpError(
      400,
      `Request field "${label}" can contain at most ${maxCount} unique champions.`,
    );
  }

  return normalized;
}

function normalizeAllySelections(value, maxCount, label) {
  if (value == null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw createHttpError(400, `Request field "${label}" must be an array.`);
  }

  const seen = new Set();
  const normalized = [];

  for (const entry of value) {
    let championName = entry;
    let role = null;

    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      championName = entry.champion ?? entry.name;
      role = normalizeAllyRole(entry.role ?? entry.lane ?? null, label);
    }

    if (typeof championName !== "string" || championName.trim() === "") {
      throw createHttpError(400, `Request field "${label}" contains an invalid champion name.`);
    }

    const champion = championByName.get(normalizeChampionName(championName));
    if (!champion) {
      throw createHttpError(400, `Unknown champion "${championName}".`);
    }

    if (seen.has(champion.key)) {
      continue;
    }

    seen.add(champion.key);
    normalized.push({
      champion,
      role,
    });
  }

  if (normalized.length > maxCount) {
    throw createHttpError(
      400,
      `Request field "${label}" can contain at most ${maxCount} unique champions.`,
    );
  }

  return normalized;
}

function normalizeChampionName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeRequestedRole(value) {
  if (value == null || value === "") {
    return DEFAULT_TARGET_ROLE;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, 'Request field "role" contains an invalid target role.');
  }

  const normalized = normalizeRole(value);
  if (!normalized) {
    throw createHttpError(400, 'Request field "role" contains an invalid target role.');
  }

  return normalized;
}

function normalizeRequestedRankFilter(value) {
  if (value == null || value === "") {
    return DEFAULT_RANK_FILTER;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, 'Request field "rankFilter" contains an invalid rank filter.');
  }

  const normalized = normalizeRankFilter(value);
  if (!normalized) {
    throw createHttpError(400, 'Request field "rankFilter" contains an invalid rank filter.');
  }

  return normalized;
}

function normalizeAllyRole(value, label) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `Request field "${label}" contains an invalid ally role.`);
  }

  const normalized = normalizeRole(value);
  if (!normalized) {
    throw createHttpError(400, `Request field "${label}" contains an invalid ally role.`);
  }

  return normalized;
}

function validateAllyRoleAssignments(allies, targetRole) {
  const seenRoles = new Set();

  for (const ally of allies) {
    if (!ally.role) {
      continue;
    }

    if (ally.role === targetRole) {
      throw createHttpError(
        400,
        `Request field "allies" cannot assign the target role "${getRoleLabel(targetRole)}" to an allied champion.`,
      );
    }

    if (seenRoles.has(ally.role)) {
      throw createHttpError(
        400,
        'Request field "allies" cannot assign the same role to multiple allied champions.',
      );
    }

    seenRoles.add(ally.role);
  }
}

async function fetchRoleCounterRows(champion, targetRole, rankFilter) {
  const payload = await fetchLolalyticsBuildData(champion.id, rankFilter);
  return extractRoleValues(payload?.enemy?.[targetRole], 2);
}

async function fetchRoleSynergyRows(champion, allyRole, targetRole, rankFilter) {
  if (allyRole) {
    try {
      const rows = await fetchRoleSynergyRowsForRole(champion, allyRole, targetRole, rankFilter);
      if (rows.size > 0) {
        return rows;
      }
    } catch (error) {
      return fetchRoleSynergyRowsForRole(champion, "all", targetRole, rankFilter);
    }

    return fetchRoleSynergyRowsForRole(champion, "all", targetRole, rankFilter);
  }

  return fetchRoleSynergyRowsForRole(champion, "all", targetRole, rankFilter);
}

async function fetchRoleSynergyRowsForRole(champion, allyRole, targetRole, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      ep: "build-team",
      v: "1",
      patch: PATCH_WINDOW,
      c: champion.id,
      lane: allyRole,
      queue: QUEUE,
      region: REGION,
    },
    rankFilter,
  );
  const payload = await fetchLolalyticsMegaJson(
    `?${searchParams.toString()}`,
    `${champion.name} ${allyRole} synergy`,
  );
  return extractRoleValues(payload?.team?.[targetRole], 3);
}

async function fetchEligibleTierStats(targetRole, rankFilter) {
  const roleLabel = getRoleLabel(targetRole).toLowerCase();
  const html = await fetchLolalyticsText(
    buildTierListUrl(targetRole, rankFilter),
    `${roleLabel} tier list`,
  );
  const rows = extractTierListRows(html);
  if (rows.length === 0) {
    throw createHttpError(502, `Lolalytics ${roleLabel} tier list was missing champion rows.`);
  }

  const eligibleRoleTierStats = buildEligibleTierStats(
    rows,
    championBySlug,
    championByName,
    {
      minLanePercent: MIN_SUPPORT_TIER_LIST_LANE_PERCENT,
      minPickRate: MIN_SUPPORT_TIER_LIST_PICK_RATE,
    },
  );

  if (eligibleRoleTierStats.size === 0) {
    throw createHttpError(502, `Lolalytics ${roleLabel} tier list returned no eligible picks.`);
  }

  return eligibleRoleTierStats;
}

async function fetchLolalyticsBuildData(slug, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      patch: PATCH_WINDOW,
    },
    rankFilter,
  );
  const payload = await fetchLolalyticsJson(
    `${LOLALYTICS_BASE_URL}/lol/${slug}/build/q-data.json?${searchParams.toString()}`,
    `${slug} build q-data`,
  );
  const root = resolveQwikPayload(payload);
  const loaders = Object.values(root.loaders || {});
  const buildData = loaders.find(
    (value) => value && typeof value === "object" && value.enemy && value.header,
  );

  if (!buildData) {
    throw createHttpError(502, `Lolalytics build data for ${slug} was missing matchup rows.`);
  }

  return buildData;
}

async function fetchLolalyticsMegaJson(query, label) {
  return fetchLolalyticsJson(`${LOLALYTICS_MEGA_URL}${query}`, label);
}

async function fetchLolalyticsJson(url, label) {
  return fetchLolalyticsResource(url, label, "json");
}

async function fetchLolalyticsText(url, label) {
  return fetchLolalyticsResource(url, label, "text");
}

function buildTierListUrl(targetRole, rankFilter) {
  const searchParams = buildLolalyticsSearchParams(
    {
      lane: targetRole,
      patch: PATCH_WINDOW,
      view: "grid",
    },
    rankFilter,
  );
  return `${LOLALYTICS_BASE_URL}/lol/tierlist/?${searchParams.toString()}`;
}

function buildLolalyticsSearchParams(params, rankFilter) {
  const searchParams = new URLSearchParams(params);
  const tierQueryValue = getLolalyticsTierQueryValue(rankFilter);
  if (tierQueryValue) {
    searchParams.set("tier", tierQueryValue);
  }

  return searchParams;
}

async function fetchLolalyticsResource(url, label, responseType) {
  const cached = requestCache.get(url);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        "referer": "https://lolalytics.com/",
      },
    });

    if (!res.ok) {
      throw createHttpError(
        502,
        `Lolalytics request failed for ${label} with status ${res.status}.`,
      );
    }

    const data = responseType === "text" ? await res.text() : await res.json();
    requestCache.set(url, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw createHttpError(504, `Timed out while fetching ${label} from Lolalytics.`);
    }

    if (error.statusCode) {
      throw error;
    }

    throw createHttpError(502, `Failed to fetch ${label} from Lolalytics.`);
  } finally {
    clearTimeout(timeout);
  }
}

function resolveQwikPayload(payload) {
  if (!payload || !Array.isArray(payload._objs)) {
    throw createHttpError(502, "Lolalytics returned an unexpected q-data payload.");
  }

  const objects = payload._objs;
  return resolveQwikValue(payload._entry, objects);
}

function resolveQwikValue(value, objects) {
  if (typeof value === "string") {
    const index = parseQwikRef(value, objects.length);
    if (index == null) {
      return value;
    }

    const raw = objects[index];

    if (Array.isArray(raw)) {
      return raw.map((entry) => resolveQwikValue(entry, objects));
    }

    if (raw && typeof raw === "object") {
      const resolved = {};
      for (const [key, entry] of Object.entries(raw)) {
        resolved[key] = resolveQwikValue(entry, objects);
      }
      return resolved;
    }

    return raw;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => resolveQwikValue(entry, objects));
  }

  if (value && typeof value === "object") {
    const resolved = {};
    for (const [key, entry] of Object.entries(value)) {
      resolved[key] = resolveQwikValue(entry, objects);
    }
    return resolved;
  }

  return value;
}

function parseQwikRef(value, objectCount) {
  if (!/^[0-9a-z]+$/i.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 36);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= objectCount) {
    return null;
  }

  return parsed;
}

function extractRoleValues(rows, valueIndex) {
  const roleValues = new Map();

  if (!Array.isArray(rows)) {
    return roleValues;
  }

  for (const row of rows) {
    if (!Array.isArray(row) || row.length <= valueIndex) {
      continue;
    }

    const candidateKey = String(row[0]);
    const value = row[valueIndex];
    const winRate = row[1];

    if (!Number.isFinite(value)) {
      continue;
    }

    if (!championByKey.has(candidateKey)) {
      continue;
    }

    roleValues.set(candidateKey, {
      value,
      winRate: Number.isFinite(winRate) ? winRate : null,
    });
  }

  return roleValues;
}

function getCandidateRecord(candidateScores, candidateKey) {
  const existing = candidateScores.get(candidateKey);
  if (existing) {
    return existing;
  }

  const champion = championByKey.get(candidateKey);
  if (!champion) {
    throw createHttpError(500, `Missing local metadata for candidate champion ${candidateKey}.`);
  }

  const created = {
    key: champion.key,
    name: champion.name,
    icon: champion.icon,
    synergyValues: [],
    counterValues: [],
    projectedWinRateValues: [],
  };

  candidateScores.set(candidateKey, created);
  return created;
}

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function isAuthorizedShutdownRequest(request) {
  const requestToken = request.get("x-shutdown-token");
  const remoteAddress = request.socket?.remoteAddress || "";

  return requestToken === shutdownToken && isLoopbackAddress(remoteAddress);
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function beginShutdown(reason) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Shutting down PickBan prototype (${reason})...`);
  requestCache.clear();

  forcedShutdownTimer = setTimeout(() => {
    for (const socket of openSockets) {
      socket.destroy();
    }
  }, SHUTDOWN_GRACE_PERIOD_MS);

  if (typeof forcedShutdownTimer.unref === "function") {
    forcedShutdownTimer.unref();
  }

  server.close((error) => {
    clearTimeout(forcedShutdownTimer);

    if (error) {
      console.error("Failed to stop the PickBan prototype cleanly.", error);
      process.exit(1);
    }

    console.log("PickBan prototype stopped.");
    process.exit(0);
  });
}
