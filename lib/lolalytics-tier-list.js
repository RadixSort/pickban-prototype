"use strict";

/**
 * Lolalytics has shipped tier lists in both table-style rows and grid cards.
 * Parse both layouts and return one normalized row per champion slug.
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
  const statsByCandidateKey = new Map();

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    if (row.lanePercent < minLanePercent || row.pickRate < minPickRate) {
      continue;
    }

    const champion =
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
    });
  }

  return statsByCandidateKey;
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
  extractTierListRows,
  extractSupportTierListRows: extractTierListRows,
};
