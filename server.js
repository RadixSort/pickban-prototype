const express = require("express");
const path = require("path");

const app = express();
const publicDir = path.join(__dirname, "public");
const champions = require(path.join(publicDir, "champions.json"));

const PORT = process.env.PORT || 3000;
const PATCH_WINDOW = "7";
const TIER = "platinum_plus";
const QUEUE = "ranked";
const REGION = "all";
const LOLALYTICS_BASE_URL = "https://lolalytics.com";
const LOLALYTICS_MEGA_URL = "https://a1.lolalytics.com/mega/";
const REQUEST_TIMEOUT_MS = 15000;
const CACHE_TTL_MS = 5 * 60 * 1000;

const requestCache = new Map();

const championByKey = new Map(
  champions.map((champion) => [String(champion.key), champion]),
);
const championBySlug = new Map(champions.map((champion) => [champion.id, champion]));
const championByName = new Map(
  champions.map((champion) => [normalizeChampionName(champion.name), champion]),
);

app.use(express.json());
app.use(express.static(publicDir));

app.post("/suggest", async (request, response) => {
  try {
    const allies = normalizeSelections(request.body?.allies, 4, "allies");
    const enemies = normalizeSelections(request.body?.enemies, 5, "enemies");

    if (allies.length === 0 && enemies.length === 0) {
      return response.status(400).json({
        error: "Choose at least one allied or enemy champion before fetching suggestions.",
      });
    }

    const partialFailures = [];

    const allyResults = await Promise.allSettled(
      allies.map(async (champion) => ({
        champion,
        rows: await fetchSupportSynergyRows(champion),
      })),
    );

    const enemyResults = await Promise.allSettled(
      enemies.map(async (champion) => ({
        champion,
        rows: await fetchSupportCounterRows(champion),
      })),
    );

    const candidateScores = new Map();

    for (const result of allyResults) {
      if (result.status === "fulfilled") {
        const rows = result.value.rows;
        for (const [supportKey, value] of rows) {
          const record = getCandidateRecord(candidateScores, supportKey);
          record.synergyValues.push(value);
        }
      } else {
        partialFailures.push(result.reason.message);
      }
    }

    for (const result of enemyResults) {
      if (result.status === "fulfilled") {
        const rows = result.value.rows;
        for (const [supportKey, value] of rows) {
          const record = getCandidateRecord(candidateScores, supportKey);
          record.counterValues.push(value);
        }
      } else {
        partialFailures.push(result.reason.message);
      }
    }

    const results = Array.from(candidateScores.values())
      .map((candidate) => {
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
        };
      })
      .sort(compareResults);

    if (results.length === 0) {
      return response.status(502).json({
        error: "No support data was returned from Lolalytics for the selected champions.",
        meta: {
          allyCount: allies.length,
          enemyCount: enemies.length,
          partialFailures,
        },
      });
    }

    response.json({
      results,
      meta: {
        allyCount: allies.length,
        enemyCount: enemies.length,
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

app.listen(PORT, () => {
  console.log(`PickBan prototype running at http://localhost:${PORT}`);
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

function normalizeChampionName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchSupportCounterRows(champion) {
  const payload = await fetchLolalyticsBuildData(champion.id);
  return extractSupportValues(payload?.enemy?.support, 2);
}

async function fetchSupportSynergyRows(champion) {
  const payload = await fetchLolalyticsMegaJson(
    `?ep=build-team&v=1&patch=${PATCH_WINDOW}&c=${encodeURIComponent(
      champion.id,
    )}&lane=all&tier=${TIER}&queue=${QUEUE}&region=${REGION}`,
    `${champion.name} synergy`,
  );
  return extractSupportValues(payload?.team?.support, 3);
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

    const data = await res.json();
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

    supportValues.set(supportKey, value);
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
