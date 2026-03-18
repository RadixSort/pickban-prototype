const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEligibleSupportTierStats,
  extractSupportTierListRows,
} = require("../lib/lolalytics-tier-list.js");

const sampleTierListHtml = `
  <div class="flex h-[52px]  justify-between text-[13px] text-[#cccccc] odd:bg-[#181818] even:bg-[#101010]" q:id="55">
    <div style="width:50px" class="my-auto justify-center flex" q:key="1">
      <a href="/lol/thresh/build/?tier=platinum_plus&amp;patch=7" q:key="Hl_2">
        <img src="https://cdn5.lolalytics.com/champx46/thresh.webp" width="50" height="50" alt="Thresh" />
      </a>
    </div>
    <div style="width:110px" class="my-auto justify-center flex" q:key="2">
      <a href="/lol/thresh/build/?tier=platinum_plus&amp;patch=7" q:key="Hl_0">Thresh</a>
    </div>
    <div style="width:40px" class="my-auto justify-center flex" q:key="3">S+</div>
    <div style="width:40px" class="my-auto justify-center flex" q:key="4">
      <div class="w-[33px] text-center" q:key="Hl_4">
        <img src="https://cdn5.lolalytics.com/lane27/support.webp" alt="support lane" />
        99.63
      </div>
    </div>
    <div style="width:48px" class="my-auto justify-center flex" q:key="5">
      <div class="text-center" q:key="Hl_8">
        <span style="color:#67bb5b" q:key="wW_0">51.88</span>
        <br />
        <span class="mt-[2px] text-[11px] text-[#aaaaaa]">+0.96</span>
      </div>
    </div>
    <div style="width:48px" class="my-auto justify-center flex" q:key="6">13.73</div>
  </div>
  <div class="flex h-[52px]  justify-between text-[13px] text-[#cccccc] odd:bg-[#181818] even:bg-[#101010]" q:id="5r">
    <div style="width:50px" class="my-auto justify-center flex" q:key="1">
      <a href="/lol/sona/build/?tier=platinum_plus&amp;patch=7" q:key="Hl_2">
        <img src="https://cdn5.lolalytics.com/champx46/sona.webp" width="50" height="50" alt="Sona" />
      </a>
    </div>
    <div style="width:110px" class="my-auto justify-center flex" q:key="2">
      <a href="/lol/sona/build/?tier=platinum_plus&amp;patch=7" q:key="Hl_0">Sona</a>
    </div>
    <div style="width:40px" class="my-auto justify-center flex" q:key="3">S</div>
    <div style="width:40px" class="my-auto justify-center flex" q:key="4">
      <div class="w-[33px] text-center" q:key="Hl_4">
        <img src="https://cdn5.lolalytics.com/lane27/support.webp" alt="support lane" />
        99.47
      </div>
    </div>
    <div style="width:48px" class="my-auto justify-center flex" q:key="5">
      <div class="text-center" q:key="Hl_8">
        <span style="color:#46af2e" q:key="wW_0">53.19</span>
        <br />
        <span class="mt-[2px] text-[11px] text-[#aaaaaa]">+0.83</span>
      </div>
    </div>
    <div style="width:48px" class="my-auto justify-center flex" q:key="6">0.37</div>
  </div>
`;

test("extractSupportTierListRows parses lane percent, win rate, and pick rate", () => {
  assert.deepEqual(extractSupportTierListRows(sampleTierListHtml), [
    {
      slug: "thresh",
      name: "Thresh",
      lanePercent: 99.63,
      winRate: 51.88,
      pickRate: 13.73,
    },
    {
      slug: "sona",
      name: "Sona",
      lanePercent: 99.47,
      winRate: 53.19,
      pickRate: 0.37,
    },
  ]);
});

test("buildEligibleSupportTierStats filters rows with minimum lane and pick thresholds", () => {
  const rows = extractSupportTierListRows(sampleTierListHtml);
  const championBySlug = new Map([
    ["thresh", { key: "412", name: "Thresh" }],
    ["sona", { key: "37", name: "Sona" }],
  ]);
  const championByName = new Map([
    ["thresh", { key: "412", name: "Thresh" }],
    ["sona", { key: "37", name: "Sona" }],
  ]);

  const eligibleSupportTierStats = buildEligibleSupportTierStats(
    rows,
    championBySlug,
    championByName,
    {
      minLanePercent: 10,
      minPickRate: 0.5,
    },
  );

  assert.deepEqual(Array.from(eligibleSupportTierStats.values()), [
    {
      supportKey: "412",
      supportSlug: "thresh",
      support: "Thresh",
      lanePercent: 99.63,
      winRate: 51.88,
      pickRate: 13.73,
    },
  ]);
});
