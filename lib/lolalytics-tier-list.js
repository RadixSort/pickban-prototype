"use strict";

/**
 * Lolalytics has shipped tier lists as page HTML and mega-endpoint JSON.
 * Normalize those shapes into rows the eligibility filters can join to
 * local champion metadata.
 */
function extractTierListRows(html = "") {
  if (typeof html !== "string" || html.trim() === "") {
    return [];
  }

  const rowsBySlug = new Map();

  for (const row of extractListRows(html)) {
    rowsBySlug.set(row.slug, row);
  }

  for (const row of extractGridRows(html)) {
    rowsBySlug.set(row.slug, row);
  }

  return Array.from(rowsBySlug.values());
}

function extractTierRowsFromMegaPayload(payload = {}, targetRole = "") {
  const tierBuckets = payload?.tier;
  if (!tierBuckets || typeof tierBuckets !== "object") {
    return [];
  }

  const averageWinRate = parseOptionalFiniteNumber(payload?.avgWr);
  const rows = [];
  for (const tierBucket of Object.values(tierBuckets)) {
    const championsById = tierBucket?.lane?.[targetRole]?.cid;
    if (!championsById || typeof championsById !== "object") {
      continue;
    }

    for (const [championKey, stats] of Object.entries(championsById)) {
      const lanePercent = Number(stats?.pctLane);
      const winRate = Number(stats?.wr);
      const pickRate = Number(stats?.pr);
      const banRate = parseOptionalFiniteNumber(stats?.br);
      // The tier page's Best Worldwide Delta is `topWr - wr` for this
      // rank-, role-, and patch-scoped row. Negative deltas do not represent
      // a skill-level advantage, so normalize them to zero.
      const bestWorldwideWinRateDelta = calculateBestWorldwideWinRateDelta({
        winRate,
        bestWorldwideWinRate: stats?.topWr,
      });

      if (![lanePercent, winRate, pickRate].every(Number.isFinite)) {
        continue;
      }

      const row = {
        championKey: String(championKey),
        slug: "",
        name: "",
        lanePercent,
        winRate,
        pickRate,
      };
      const pbi =
        parseOptionalFiniteNumber(stats?.pbi) ??
        calculatePickBanInfluence({
          winRate,
          averageWinRate,
          pickRate,
          banRate,
        });
      if (pbi != null) {
        row.pbi = pbi;
      }
      if (bestWorldwideWinRateDelta != null) {
        row.bestWorldwideWinRateDelta = bestWorldwideWinRateDelta;
      }

      rows.push(row);
    }
  }

  return rows;
}

function extractListRows(html) {
  const rows = [];
  const rowSections = html.split('<div class="flex h-[52px]');

  for (const rowSection of rowSections.slice(1)) {
    const rowHtml = `<div class="flex h-[52px]${rowSection}`;
    const slug = matchFirst(rowHtml, /href="\/lol\/([^/]+)\/build\/(?:\?[^"]*)?"/);
    const name = matchFirst(rowHtml, /alt="([^"]+)"/);
    const lanePercent = parseVisibleNumber(extractColumnSection(rowHtml, "4", "5"));
    const winRate = parseVisibleNumber(extractColumnSection(rowHtml, "5", "6"));
    const pickRate = parseVisibleNumber(extractColumnSection(rowHtml, "6", "7"));

    if (!slug || !name) {
      continue;
    }

    if (![lanePercent, winRate, pickRate].every(Number.isFinite)) {
      continue;
    }

    rows.push({
      slug,
      name,
      lanePercent,
      winRate,
      pickRate,
    });
  }

  return rows;
}

function extractGridRows(html) {
  const rows = [];
  const cardSections = html.split('<div class="h-[151px] min-w-[150px] max-w-[190px] flex-auto overflow-hidden border border-[#4e6a6c] hover:border-white"');

  for (const cardSection of cardSections.slice(1)) {
    const cardHtml = `<div class="h-[151px] min-w-[150px] max-w-[190px] flex-auto overflow-hidden border border-[#4e6a6c] hover:border-white"${cardSection}`;
    const slug = matchFirst(cardHtml, /href="\/lol\/([^/]+)\/build\/(?:\?[^"]*)?"/);
    const name = matchFirst(cardHtml, /alt="([^"]+)"/);
    const lanePercent = parseVisibleNumber(extractGridLaneSection(cardHtml));
    const [winRate, pickRate] = extractGridSummaryStats(cardHtml);

    if (!slug || !name) {
      continue;
    }

    if (![lanePercent, winRate, pickRate].every(Number.isFinite)) {
      continue;
    }

    rows.push({
      slug,
      name,
      lanePercent,
      winRate,
      pickRate,
    });
  }

  return rows;
}

/**
 * Join parsed tier-list rows to local champion metadata and keep only picks
 * that satisfy the configured lane-share and pick-rate thresholds.
 */
function buildEligibleTierStats(
  rows = [],
  championBySlug = new Map(),
  championByName = new Map(),
  options = {},
) {
  const minLanePercent =
    typeof options.minLanePercent === "number" ? options.minLanePercent : Number.NEGATIVE_INFINITY;
  const minPickRate =
    typeof options.minPickRate === "number" ? options.minPickRate : Number.NEGATIVE_INFINITY;
  const championByKey = options.championByKey instanceof Map ? options.championByKey : new Map();
  const statsByCandidateKey = new Map();

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    if (row.lanePercent < minLanePercent || row.pickRate < minPickRate) {
      continue;
    }

    const champion =
      championByKey.get(String(row.championKey || "")) ||
      championBySlug.get(row.slug) ||
      championByName.get(normalizeChampionName(row.name));

    if (!champion) {
      continue;
    }

    statsByCandidateKey.set(String(champion.key), {
      candidateKey: String(champion.key),
      candidateSlug: row.slug,
      candidate: champion.name,
      lanePercent: row.lanePercent,
      winRate: row.winRate,
      pickRate: row.pickRate,
      ...(Number.isFinite(Number(row.pbi)) ? { pbi: Number(row.pbi) } : {}),
      ...(Number.isFinite(Number(row.bestWorldwideWinRateDelta))
        ? { bestWorldwideWinRateDelta: Number(row.bestWorldwideWinRateDelta) }
        : {}),
    });
  }

  return statsByCandidateKey;
}

function calculateBestWorldwideWinRateDelta({
  winRate,
  bestWorldwideWinRate,
} = {}) {
  const normalizedWinRate = parseOptionalFiniteNumber(winRate);
  const normalizedBestWorldwideWinRate = parseOptionalFiniteNumber(bestWorldwideWinRate);

  if (normalizedWinRate == null || normalizedBestWorldwideWinRate == null) {
    return null;
  }

  const roundedDelta =
    Math.round((normalizedBestWorldwideWinRate - normalizedWinRate) * 100) / 100;

  return Math.max(0, roundedDelta);
}

function calculatePickBanInfluence({
  winRate,
  averageWinRate,
  pickRate,
  banRate,
} = {}) {
  const normalizedWinRate = parseOptionalFiniteNumber(winRate);
  const normalizedAverageWinRate = parseOptionalFiniteNumber(averageWinRate);
  const normalizedPickRate = parseOptionalFiniteNumber(pickRate);
  const normalizedBanRate = parseOptionalFiniteNumber(banRate);

  if (
    normalizedWinRate == null ||
    normalizedAverageWinRate == null ||
    normalizedPickRate == null ||
    normalizedBanRate == null
  ) {
    return null;
  }

  const denominator = 100 - normalizedBanRate;
  if (
    !Number.isFinite(denominator) ||
    denominator <= 0
  ) {
    return null;
  }

  return Math.round(
    ((normalizedWinRate - normalizedAverageWinRate) * 100 * normalizedPickRate) / denominator,
  );
}

function parseOptionalFiniteNumber(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function matchFirst(value, pattern) {
  const match = value.match(pattern);
  return match ? match[1] : null;
}

function extractColumnSection(rowHtml, startKey, endKey) {
  const startMarker = `q:key="${startKey}"`;
  const endMarker = endKey ? `q:key="${endKey}"` : null;
  const startIndex = rowHtml.indexOf(startMarker);
  if (startIndex === -1) {
    return "";
  }

  const contentStart = rowHtml.indexOf(">", startIndex);
  if (contentStart === -1) {
    return "";
  }

  const contentEnd = endMarker ? rowHtml.indexOf(endMarker, contentStart + 1) : -1;
  return rowHtml.slice(contentStart + 1, contentEnd === -1 ? rowHtml.length : contentEnd);
}

function extractGridLaneSection(cardHtml) {
  const laneImageMatch = cardHtml.match(/<img[^>]+alt="[^"]+ lane"[^>]*>/);
  const laneStartIndex = laneImageMatch?.index ?? -1;
  if (laneStartIndex === -1) {
    return "";
  }

  const tagEndIndex = cardHtml.indexOf(">", laneStartIndex);
  if (tagEndIndex === -1) {
    return "";
  }

  return cardHtml.slice(tagEndIndex + 1);
}

function extractGridSummaryStats(cardHtml) {
  const marker = '<div class="flex-auto overflow-hidden text-center">';
  const summaryHtml = sliceFromMarker(cardHtml, marker);
  if (!summaryHtml) {
    return [];
  }

  const values = [];
  const statPattern = /<div class="mt-\[2px\] text-\[12px\] font-semibold[^"]*"[^>]*>([\s\S]*?)<\/div>/g;

  for (const statMatch of summaryHtml.matchAll(statPattern)) {
    const value = parseVisibleNumber(statMatch[1]);
    if (Number.isFinite(value)) {
      values.push(value);
    }

    if (values.length >= 2) {
      return values;
    }
  }

  return values;
}

function sliceFromMarker(value, marker) {
  const startIndex = value.indexOf(marker);
  if (startIndex === -1) {
    return "";
  }

  return value.slice(startIndex + marker.length);
}

function parseVisibleNumber(value) {
  if (typeof value !== "string" || value === "") {
    return Number.NaN;
  }

  const visibleText = value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = visibleText.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return Number.NaN;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeChampionName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

module.exports = {
  buildEligibleTierStats,
  buildEligibleSupportTierStats: buildEligibleTierStats,
  calculateBestWorldwideWinRateDelta,
  calculatePickBanInfluence,
  extractTierListRows,
  extractTierRowsFromMegaPayload,
  extractSupportTierListRows: extractTierListRows,
};
