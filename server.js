const express = require("express");
const crypto = require("crypto");
const path = require("path");
const { version: appVersion } = require("./package.json");
const {
  buildEligibleSupportTierStats,
  extractSupportTierListRows,
} = require("./lib/lolalytics-tier-list.js");

const app = express();
const publicDir = path.join(__dirname, "public");
const champions = require(path.join(publicDir, "champions.json"));
const {
  buildSelectedChampionKeys,
  filterUnavailableResults,
} = require(path.join(publicDir, "suggestion-filters.js"));

const PORT = process.env.PORT || 3000;
const PATCH_WINDOW = "7";
const TIER = "platinum_plus";
const QUEUE = "ranked";
const REGION = "all";
const MIN_SUPPORT_TIER_LIST_PICK_RATE = 0.5;
const MIN_SUPPORT_TIER_LIST_LANE_PERCENT = 10;
const LOLALYTICS_BASE_URL = "https://lolalytics.com";
const LOLALYTICS_MEGA_URL = "https://a1.lolalytics.com/mega/";
const LOLALYTICS_SUPPORT_TIER_LIST_URL = `${LOLALYTICS_BASE_URL}/lol/tierlist/?lane=support&tier=${TIER}&patch=${PATCH_WINDOW}&view=list`;
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
const allyLaneByAlias = new Map([
  ["top", "top"],
  ["jungle", "jungle"],
  ["jg", "jungle"],
  ["jng", "jungle"],
  ["mid", "middle"],
  ["middle", "middle"],
  ["bot", "bottom"],
  ["bottom", "bottom"],
  ["adc", "bottom"],
]);

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
    const allies = normalizeAllySelections(request.body?.allies, 4, "allies");
    const enemies = normalizeSelections(request.body?.enemies, 5, "enemies");
    const selectedChampionKeys = buildSelectedChampionKeys(allies, enemies);

    if (allies.length === 0 && enemies.length === 0) {
      return response.status(400).json({
        error: "Choose at least one allied or enemy champion before fetching suggestions.",
      });
    }

    const partialFailures = [];
    const eligibleSupportTierStatsPromise = fetchEligibleSupportTierStats();

    const allyResults = await Promise.allSettled(
      allies.map(async ({ champion, lane }) => ({
        champion,
        lane,
        rows: await fetchSupportSynergyRows(champion, lane),
      })),
    );

    const enemyResults = await Promise.allSettled(
      enemies.map(async (champion) => ({
        champion,
        rows: await fetchSupportCounterRows(champion),
      })),
    );

    const eligibleSupportTierStats = await eligibleSupportTierStatsPromise;
    const candidateScores = new Map();

    for (const result of allyResults) {
      if (result.status === "fulfilled") {
        const rows = result.value.rows;
        for (const [supportKey, row] of rows) {
          const record = getCandidateRecord(candidateScores, supportKey);
          record.synergyValues.push(row.value);
        }
      } else {
        partialFailures.push(result.reason.message);
      }
    }

    for (const result of enemyResults) {
      if (result.status === "fulfilled") {
        const rows = result.value.rows;
        for (const [supportKey, row] of rows) {
          const record = getCandidateRecord(candidateScores, supportKey);
          record.counterValues.push(row.value);
        }
      } else {
        partialFailures.push(result.reason.message);
      }
    }

    const results = filterUnavailableResults(
      Array.from(candidateScores.values())
        .map((candidate) => {
          const supportTierStats = eligibleSupportTierStats.get(String(candidate.key));
          if (!supportTierStats) {
            return null;
          }

          const synergyScore = average(candidate.synergyValues);
          const counterScore = average(candidate.counterValues);
          const finalScore = 0.5 * synergyScore + 0.5 * counterScore;

          return {
            support: candidate.name,
            supportKey: candidate.key,
            icon: candidate.icon,
            synergyScore,
            counterScore,
            finalScore,
            lanePercent: supportTierStats.lanePercent,
            pickRate: supportTierStats.pickRate,
            winRate: supportTierStats.winRate,
          };
        })
        .filter(Boolean)
        .sort(compareResults),
      selectedChampionKeys,
    );

    if (results.length === 0) {
      return response.status(502).json({
        error: "No support data was returned from Lolalytics for the selected champions.",
        meta: {
          allyCount: allies.length,
          enemyCount: enemies.length,
          assignedLaneCount: allies.filter((ally) => ally.lane).length,
          partialFailures,
        },
      });
    }

    response.json({
      results,
      meta: {
        allyCount: allies.length,
        enemyCount: enemies.length,
        assignedLaneCount: allies.filter((ally) => ally.lane).length,
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
    let lane = null;

    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      championName = entry.champion ?? entry.name;
      lane = normalizeAllyLane(entry.lane ?? entry.role ?? null, label);
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
      lane,
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

function normalizeAllyLane(value, label) {
  if (value == null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw createHttpError(400, `Request field "${label}" contains an invalid ally lane.`);
  }

  const normalized = allyLaneByAlias.get(value.trim().toLowerCase());
  if (!normalized) {
    throw createHttpError(400, `Request field "${label}" contains an invalid ally lane.`);
  }

  return normalized;
}

async function fetchSupportCounterRows(champion) {
  const payload = await fetchLolalyticsBuildData(champion.id);
  return extractSupportValues(payload?.enemy?.support, 2);
}

async function fetchSupportSynergyRows(champion, lane) {
  if (lane) {
    try {
      const rows = await fetchSupportSynergyRowsForLane(champion, lane);
      if (rows.size > 0) {
        return rows;
      }
    } catch (error) {
      return fetchSupportSynergyRowsForLane(champion, "all");
    }

    return fetchSupportSynergyRowsForLane(champion, "all");
  }

  return fetchSupportSynergyRowsForLane(champion, "all");
}

async function fetchSupportSynergyRowsForLane(champion, lane) {
  const payload = await fetchLolalyticsMegaJson(
    `?ep=build-team&v=1&patch=${PATCH_WINDOW}&c=${encodeURIComponent(
      champion.id,
    )}&lane=${encodeURIComponent(lane)}&tier=${TIER}&queue=${QUEUE}&region=${REGION}`,
    `${champion.name} ${lane} synergy`,
  );
  return extractSupportValues(payload?.team?.support, 3);
}

async function fetchEligibleSupportTierStats() {
  const html = await fetchLolalyticsText(LOLALYTICS_SUPPORT_TIER_LIST_URL, "support tier list");
  const rows = extractSupportTierListRows(html);
  if (rows.length === 0) {
    throw createHttpError(502, "Lolalytics support tier list was missing champion rows.");
  }

  const eligibleSupportTierStats = buildEligibleSupportTierStats(
    rows,
    championBySlug,
    championByName,
    {
      minLanePercent: MIN_SUPPORT_TIER_LIST_LANE_PERCENT,
      minPickRate: MIN_SUPPORT_TIER_LIST_PICK_RATE,
    },
  );

  if (eligibleSupportTierStats.size === 0) {
    throw createHttpError(502, "Lolalytics support tier list returned no eligible support picks.");
  }

  return eligibleSupportTierStats;
}

async function fetchLolalyticsBuildData(slug) {
  const payload = await fetchLolalyticsJson(
    `${LOLALYTICS_BASE_URL}/lol/${slug}/build/q-data.json?tier=${TIER}&patch=${PATCH_WINDOW}`,
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

function extractSupportValues(rows, valueIndex) {
  const supportValues = new Map();

  if (!Array.isArray(rows)) {
    return supportValues;
  }

  for (const row of rows) {
    if (!Array.isArray(row) || row.length <= valueIndex) {
      continue;
    }

    const supportKey = String(row[0]);
    const value = row[valueIndex];

    if (typeof value !== "number" || Number.isNaN(value)) {
      continue;
    }

    if (!championByKey.has(supportKey)) {
      continue;
    }

    supportValues.set(supportKey, {
      value,
    });
  }

  return supportValues;
}

function getCandidateRecord(candidateScores, supportKey) {
  const existing = candidateScores.get(supportKey);
  if (existing) {
    return existing;
  }

  const champion = championByKey.get(supportKey);
  if (!champion) {
    throw createHttpError(500, `Missing local metadata for support champion ${supportKey}.`);
  }

  const created = {
    key: champion.key,
    name: champion.name,
    icon: champion.icon,
    synergyValues: [],
    counterValues: [],
  };

  candidateScores.set(supportKey, created);
  return created;
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

function compareResults(left, right) {
  if (right.finalScore !== left.finalScore) {
    return right.finalScore - left.finalScore;
  }

  if (right.counterScore !== left.counterScore) {
    return right.counterScore - left.counterScore;
  }

  return left.support.localeCompare(right.support);
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
