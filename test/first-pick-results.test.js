const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFirstPickMeta,
  buildFirstPickTierListResults,
} = require("../lib/first-pick-results.js");

test("buildFirstPickTierListResults ranks tier-list rows by PBI", () => {
  const result = buildFirstPickTierListResults({
    targetRole: "support",
    eligibleTierStats: new Map([
      [
        "412",
        {
          candidateKey: "412",
          candidate: "Thresh",
          lanePercent: 99.6,
          pickRate: 13.4,
          winRate: 53.5,
          pbi: 24,
        },
      ],
      [
        "432",
        {
          candidateKey: "432",
          candidate: "Bard",
          lanePercent: 99.6,
          pickRate: 7.1,
          winRate: 52.3,
          pbi: 4,
        },
      ],
      [
        "111",
        {
          candidateKey: "111",
          candidate: "Nautilus",
          lanePercent: 98.1,
          pickRate: 10.5,
          winRate: 51.6,
          pbi: -1,
        },
      ],
    ]),
    selectedChampionKeys: new Set(["432"]),
    championByKey: new Map([
      ["412", { name: "Thresh", icon: "thresh.webp" }],
      ["432", { name: "Bard", icon: "bard.webp" }],
      ["111", { name: "Nautilus", icon: "nautilus.webp" }],
    ]),
  });

  assert.deepEqual(
    result.results.map((row) => row.candidate),
    ["Thresh", "Nautilus"],
  );
  assert.deepEqual(result.results[0], {
    candidate: "Thresh",
    candidateKey: "412",
    support: "Thresh",
    supportKey: "412",
    icon: "thresh.webp",
    role: "support",
    pbi: 24,
    winRate: 53.5,
    lanePercent: 99.6,
    pickRate: 13.4,
  });
  assert.deepEqual(result.partialFailures, []);
});

test("buildFirstPickMeta marks empty-draft tier-list results", () => {
  assert.deepEqual(buildFirstPickMeta("emerald_plus", "middle"), {
    rankFilter: "emerald_plus",
    role: "middle",
    allyCount: 0,
    enemyCount: 0,
    assignedRoleCount: 0,
    resultMode: "firstPick",
    partialFailures: [],
  });
});
