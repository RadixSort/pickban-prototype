"use strict";

function extractSupportTierListRows(html = "") {
  if (typeof html !== "string" || html.trim() === "") {
    return [];
  }

  const rows = [];
  const rowSections = html.split('<div class="flex h-[52px]');

  for (const rowSection of rowSections.slice(1)) {
    const rowHtml = `<div class="flex h-[52px]${rowSection}`;
    const slug = matchFirst(rowHtml, /href="\/lol\/([^/]+)\/build\/\?tier=[^"]+"/);
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

function buildEligibleSupportTierStats(
  rows = [],
  championBySlug = new Map(),
  championByName = new Map(),
  options = {},
) {
  const minLanePercent =
    typeof options.minLanePercent === "number" ? options.minLanePercent : Number.NEGATIVE_INFINITY;
  const minPickRate =
    typeof options.minPickRate === "number" ? options.minPickRate : Number.NEGATIVE_INFINITY;
  const statsBySupportKey = new Map();

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

    statsBySupportKey.set(String(champion.key), {
      supportKey: String(champion.key),
      supportSlug: row.slug,
      support: champion.name,
      lanePercent: row.lanePercent,
      winRate: row.winRate,
      pickRate: row.pickRate,
    });
  }

  return statsBySupportKey;
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
  buildEligibleSupportTierStats,
  extractSupportTierListRows,
};
