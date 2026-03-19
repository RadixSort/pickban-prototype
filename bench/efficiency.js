"use strict";

const { performance } = require("node:perf_hooks");

const {
  buildRoleSuggestionResults,
} = require("../lib/role-suggestion-results.js");
const {
  average,
  compareByProjectedAgency,
  getTopResultKeys,
  sortResults,
} = require("../public/result-ranking.js");

const TARGET_ROLE = "support";

function main() {
  const dataset = buildSyntheticRoleDataset();
  const rankingDataset = buildSyntheticRankingDataset();

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
