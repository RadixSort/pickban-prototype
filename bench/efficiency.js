"use strict";

const { performance } = require("node:perf_hooks");

const {
  buildRoleSuggestionResults,
} = require("../lib/role-suggestion-results.js");
const { resolveQwikPayload } = require("../lib/qwik-payload.js");
const {
  compareByProjectedAgency,
  getTopResultKeys,
  sortResults,
} = require("../public/result-ranking.js");

const TARGET_ROLE = "support";

function average(values) {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function main() {
  const dataset = buildSyntheticRoleDataset();
  const rankingDataset = buildSyntheticRankingDataset();
  const qwikPayload = buildSyntheticQwikPayload();

  const aggregationBaseline = benchmark(() => {
    baselineBuildRoleSuggestionResults(dataset);
  });
  const aggregationOptimized = benchmark(() => {
    buildRoleSuggestionResults(dataset);
  });

  const topKeysBaseline = benchmark(() => {
    baselineGetTopResultKeys(rankingDataset, "projectedWinRate", 3);
  });
  const topKeysOptimized = benchmark(() => {
    getTopResultKeys(rankingDataset, "projectedWinRate", 3);
  });

  const qwikBaseline = benchmark(
    () => {
      baselineResolveQwikPayload(qwikPayload);
    },
    { iterations: 150, warmupIterations: 20 },
  );
  const qwikOptimized = benchmark(
    () => {
      resolveQwikPayload(qwikPayload);
    },
    { iterations: 150, warmupIterations: 20 },
  );

  console.log("Aggregation benchmark");
  console.log(
    formatResult(
      "old array-based collector",
      aggregationBaseline.averageMs,
      aggregationBaseline.iterations,
    ),
  );
  console.log(
    formatResult(
      "new running-total collector",
      aggregationOptimized.averageMs,
      aggregationOptimized.iterations,
    ),
  );
  console.log(
    `speedup: ${formatRatio(aggregationBaseline.averageMs / aggregationOptimized.averageMs)}x`,
  );
  console.log("");
  console.log("Top-key benchmark");
  console.log(
    formatResult("old sort-then-slice", topKeysBaseline.averageMs, topKeysBaseline.iterations),
  );
  console.log(
    formatResult(
      "new bounded top-N selection",
      topKeysOptimized.averageMs,
      topKeysOptimized.iterations,
    ),
  );
  console.log(
    `speedup: ${formatRatio(topKeysBaseline.averageMs / topKeysOptimized.averageMs)}x`,
  );
  console.log("");
  console.log("Qwik payload benchmark");
  console.log(
    formatResult(
      "old ref resolver",
      qwikBaseline.averageMs,
      qwikBaseline.iterations,
    ),
  );
  console.log(
    formatResult(
      "new memoized ref resolver",
      qwikOptimized.averageMs,
      qwikOptimized.iterations,
    ),
  );
  console.log(
    `speedup: ${formatRatio(qwikBaseline.averageMs / qwikOptimized.averageMs)}x`,
  );
}

function buildSyntheticRoleDataset() {
  const championByKey = new Map();
  const eligibleTierStats = new Map();
  const candidateKeys = [];

  for (let index = 1; index <= 170; index += 1) {
    const key = String(index);
    candidateKeys.push(key);
    championByKey.set(key, {
      key,
      name: `Champion ${key}`,
      icon: `${key}.webp`,
    });
    eligibleTierStats.set(key, {
      lanePercent: 20 + (index % 70),
      pickRate: 1 + (index % 15),
      winRate: 48 + (index % 8),
    });
  }

  return {
    allyResults: createSettledMaps(candidateKeys, 4, 3),
    enemyResults: createSettledMaps(candidateKeys, 5, 2),
    eligibleTierStats,
    selectedChampionKeys: new Set(["1", "2", "3", "4", "5", "6"]),
    targetRole: TARGET_ROLE,
    championByKey,
  };
}

function createSettledMaps(candidateKeys, sourceCount, valueIndexOffset) {
  return Array.from({ length: sourceCount }, (_, sourceIndex) => ({
    status: "fulfilled",
    value: {
      rows: new Map(
        candidateKeys.map((candidateKey, candidateIndex) => [
          candidateKey,
          {
            value: 45 + ((candidateIndex + sourceIndex + valueIndexOffset) % 12),
            winRate: 47 + ((candidateIndex + sourceIndex) % 10),
          },
        ]),
      ),
    },
  }));
}

function buildSyntheticRankingDataset() {
  return Array.from({ length: 400 }, (_, index) => ({
    candidate: `Champion ${index % 170}`,
    candidateKey: String(index % 170),
    projectedAgency: 0.2 + ((index * 17) % 90) / 10,
    projectedWinRate: 48 + ((index * 11) % 70) / 10,
    counterScore: -55 + ((index * 13) % 20),
  }));
}

function buildSyntheticQwikPayload() {
  const objects = [];

  objects[0] = {
    loaders: "1",
    mirroredLoaders: ["1", "1", "1"],
  };

  objects[1] = buildRepeatedRefObject("bundle", "2", 8);
  objects[2] = buildRepeatedRefObject("section", "3", 6);
  objects[3] = buildRepeatedRefObject("cluster", "4", 4);
  objects[4] = buildSyntheticQwikLeaf();

  return {
    _entry: "0",
    _objs: objects,
  };
}

function buildRepeatedRefObject(prefix, ref, count) {
  const result = {};

  for (let index = 0; index < count; index += 1) {
    result[`${prefix}${index}`] = ref;
  }

  return result;
}

function buildSyntheticQwikLeaf() {
  return {
    header: {
      cid: 51,
      vs: 222,
      lane: "support",
    },
    enemy: {
      support: Array.from({ length: 40 }, (_, index) => [
        index + 1,
        48 + (index % 10),
        60 - (index % 7),
      ]),
    },
    summary: {
      pick: {
        runes: {
          wr: 54.8,
          n: 180,
          set: {
            pri: [8008, 9111, 9103, 8014],
            sec: [8304, 8347],
            mod: [5005, 5008, 5011],
          },
        },
      },
    },
    boots: Array.from({ length: 6 }, (_, index) => [3000 + index, 50 + index, 10 + index, 40 + index]),
    runes: {
      stats: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [
          String(8000 + index),
          [[30 + index, 50 + (index % 5), 30 + index]],
        ]),
      ),
    },
  };
}

function baselineBuildRoleSuggestionResults({
  allyResults = [],
  enemyResults = [],
  eligibleTierStats = new Map(),
  selectedChampionKeys = new Set(),
  targetRole,
  championByKey,
} = {}) {
  const partialFailures = [];
  const candidateScores = new Map();

  for (const result of allyResults) {
    if (result.status !== "fulfilled") {
      partialFailures.push(result.reason.message);
      continue;
    }

    for (const [candidateKey, row] of result.value.rows) {
      const record = baselineGetCandidateRecord(candidateScores, candidateKey, championByKey);
      record.synergyValues.push(row.value);
      if (Number.isFinite(row.winRate)) {
        record.projectedWinRateValues.push(row.winRate);
      }
    }
  }

  for (const result of enemyResults) {
    if (result.status !== "fulfilled") {
      partialFailures.push(result.reason.message);
      continue;
    }

    for (const [candidateKey, row] of result.value.rows) {
      const record = baselineGetCandidateRecord(candidateScores, candidateKey, championByKey);
      record.counterValues.push(-row.value);
      if (Number.isFinite(row.winRate)) {
        record.projectedWinRateValues.push(100 - row.winRate);
      }
    }
  }

  const results = Array.from(candidateScores.values())
    .map((candidate) => {
      if (selectedChampionKeys.has(String(candidate.key))) {
        return null;
      }

      const roleTierStats = eligibleTierStats.get(String(candidate.key));
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
    .sort(compareByProjectedAgency);

  return {
    partialFailures,
    results,
  };
}

function baselineGetCandidateRecord(candidateScores, candidateKey, championByKey) {
  const existing = candidateScores.get(candidateKey);
  if (existing) {
    return existing;
  }

  const champion = championByKey.get(candidateKey);
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

function baselineGetTopResultKeys(results = [], sortMode = "projectedAgency", limit = 3) {
  const topResultKeys = new Set();

  for (const result of sortResults(results, sortMode)) {
    const resultKey = result?.candidateKey != null ? String(result.candidateKey) : null;
    if (resultKey == null) {
      continue;
    }

    topResultKeys.add(resultKey);
    if (topResultKeys.size >= limit) {
      break;
    }
  }

  return topResultKeys;
}

function baselineResolveQwikPayload(payload) {
  if (!payload || !Array.isArray(payload._objs)) {
    throw new Error("Qwik payload must include an _objs array.");
  }

  return baselineResolveQwikValue(payload._entry, payload._objs);
}

function baselineResolveQwikValue(value, objects) {
  if (typeof value === "string") {
    const index = baselineParseQwikRef(value, objects.length);
    if (index == null) {
      return value;
    }

    const raw = objects[index];

    if (Array.isArray(raw)) {
      return raw.map((entry) => baselineResolveQwikValue(entry, objects));
    }

    if (raw && typeof raw === "object") {
      const resolved = {};
      for (const [key, entry] of Object.entries(raw)) {
        resolved[key] = baselineResolveQwikValue(entry, objects);
      }
      return resolved;
    }

    return raw;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => baselineResolveQwikValue(entry, objects));
  }

  if (value && typeof value === "object") {
    const resolved = {};
    for (const [key, entry] of Object.entries(value)) {
      resolved[key] = baselineResolveQwikValue(entry, objects);
    }
    return resolved;
  }

  return value;
}

function baselineParseQwikRef(value, objectCount) {
  if (!/^[0-9a-z]+$/i.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 36);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed >= objectCount) {
    return null;
  }

  return parsed;
}

function benchmark(fn, { iterations = 3000, warmupIterations = 200 } = {}) {
  for (let iteration = 0; iteration < warmupIterations; iteration += 1) {
    fn();
  }

  const start = performance.now();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    fn();
  }
  const totalMs = performance.now() - start;

  return {
    iterations,
    averageMs: totalMs / iterations,
  };
}

function formatResult(label, averageMs, iterations) {
  return `${label}: ${averageMs.toFixed(4)} ms/op over ${iterations} iterations`;
}

function formatRatio(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }

  return value.toFixed(2);
}

main();
