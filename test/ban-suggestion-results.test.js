const test = require("node:test");
const assert = require("node:assert/strict");

const champions = require("../public/champions.json");
const { normalizeRankFilter } = require("../public/rank-filters.js");
const { ROLE_OPTIONS, normalizeRole } = require("../public/roles.js");
const {
  buildBanSuggestion,
  buildBanSuggestionCacheKey,
  normalizeBanSuggestionRequest,
} = require("../lib/ban-suggestion-results.js");
const { normalizeChampionName } = require("../lib/request-normalization.js");

const championByName = new Map(
  champions.map((champion) => [normalizeChampionName(champion.name), champion]),
);
const championByKey = new Map(
  champions.map((champion) => [String(champion.key), champion]),
);

test("ban suggestion prefers the ranked counter for a valid lane hover", () => {
  const suggestion = buildBanSuggestion({
    role: "middle",
    hoverChampion: championByName.get("ahri"),
    counterResults: [
      {
        candidate: "Anivia",
        candidateKey: "34",
        icon: "anivia.webp",
        projectedWinRate: 56,
        counterScore: 4,
      },
    ],
    fallbackResults: [
      {
        candidate: "Zed",
        candidateKey: "238",
        icon: "zed.webp",
        pbi: 18,
        winRate: 52,
      },
    ],
  });

  assert.equal(suggestion.strategy, "counter");
  assert.equal(suggestion.champion, "Anivia");
  assert.equal(suggestion.hoveredChampion, "Ahri");
  assert.equal(suggestion.projectedWinRate, 56);
  assert.equal(suggestion.pbi, null);
});

test("ban suggestion uses the highest-ranked PBI result without a usable hover counter", () => {
  const suggestion = buildBanSuggestion({
    role: "top",
    hoverChampion: championByName.get("darius"),
    counterResults: [],
    fallbackResults: [
      {
        candidate: "Malphite",
        candidateKey: "54",
        icon: "malphite.webp",
        pbi: 22,
        winRate: 53,
      },
    ],
  });

  assert.equal(suggestion.strategy, "pbi");
  assert.equal(suggestion.champion, "Malphite");
  assert.equal(suggestion.hoveredChampion, "");
  assert.equal(suggestion.pbi, 22);
});

test("invalid and incomplete hover records normalize to lane PBI fallbacks", () => {
  const request = normalizeBanSuggestionRequest(
    {
      rankFilter: "emerald_plus",
      hovers: [
        { champion: "Ahri", role: "not-a-lane" },
        { champion: "Unknown", role: "top" },
        { champion: "Ahri" },
        null,
      ],
    },
    {
      championByName,
      defaultRankFilter: "emerald_plus",
      normalizeChampionName,
      normalizeRankFilter,
      normalizeRole,
      roleOptions: ROLE_OPTIONS,
    },
  );

  assert.equal(request.hoversByRole.size, 0);
  assert.doesNotThrow(() =>
    buildBanSuggestionCacheKey({
      hoversByRole: request.hoversByRole,
      patch: "14",
      rankFilter: request.rankFilter,
      roleOptions: ROLE_OPTIONS,
    }),
  );
});

test("known unavailable champions normalize into the aggregate cache key", () => {
  const request = normalizeBanSuggestionRequest(
    {
      rankFilter: "emerald_plus",
      unavailableChampionKeys: [238, "34", "238", "unknown", { championKey: "99" }],
    },
    {
      championByKey,
      championByName,
      defaultRankFilter: "emerald_plus",
      normalizeChampionName,
      normalizeRankFilter,
      normalizeRole,
      roleOptions: ROLE_OPTIONS,
    },
  );
  const cacheKey = buildBanSuggestionCacheKey({
    hoversByRole: request.hoversByRole,
    patch: "14",
    rankFilter: request.rankFilter,
    roleOptions: ROLE_OPTIONS,
    unavailableChampionKeys: request.unavailableChampionKeys,
  });

  assert.deepEqual([...request.unavailableChampionKeys], ["238", "34", "99"]);
  assert.match(cacheKey, /unavailable=34,99,238$/);
});
