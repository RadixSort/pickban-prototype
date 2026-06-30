const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildEligibleTierStats,
  calculateBestWorldwideWinRateDelta,
  calculatePickBanInfluence,
  extractTierListRows,
  extractTierRowsFromMegaPayload,
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

const sampleGridTierListHtml = `
  <div class="h-[151px] min-w-[150px] max-w-[190px] flex-auto overflow-hidden border border-[#4e6a6c] hover:border-white" q:key="hE_6">
    <a href="/lol/maokai/build/?tier=platinum_plus&amp;patch=7">
      <div>
        <div class="h-[20px] flex-auto border-b-[1px] border-[#4e6a6c] pt-[2px] text-center text-[15px]">Maokai</div>
        <div class="flex">
          <div class="w-[100px] overflow-hidden">
            <img src="https://cdn5.lolalytics.com/champ280/maokai.webp" alt="Maokai" />
            <div class="relative left-[60px] top-[-82px] flex h-[48px]  w-[37px] items-center justify-center bg-black bg-opacity-50 text-[12px]" q:key="hE_1">
              <div class="w-[33px] text-center text-[11px]">
                <img src="https://cdn5.lolalytics.com/lane27/support.webp" alt="support lane" class="m-auto mb-[2px]" />
                66.71
              </div>
            </div>
          </div>
          <div class="flex-auto overflow-hidden text-center">
            <div class="text-[22px] font-semibold">A-</div>
            <div class="mt-[2px] text-[12px] font-semibold text-[#4bc84b]">52.45</div>
            <div class="mt-[2px] text-[12px] font-semibold text-[#88f]">2.22</div>
            <div class="mt-[2px] text-[12px] font-semibold text-[#ec7878]">0.25</div>
            <div class="mt-[2px] text-[12px] font-semibold text-[#007800]">56.05</div>
          </div>
        </div>
      </div>
    </a>
  </div>
  <div class="h-[151px] min-w-[150px] max-w-[190px] flex-auto overflow-hidden border border-[#4e6a6c] hover:border-white" q:key="hE_6">
    <a href="/lol/morgana/build/?tier=platinum_plus&amp;patch=7">
      <div>
        <div class="h-[20px] flex-auto border-b-[1px] border-[#4e6a6c] pt-[2px] text-center text-[15px]">Morgana</div>
        <div class="flex">
          <div class="w-[100px] overflow-hidden">
            <img src="https://cdn5.lolalytics.com/champ280/morgana.webp" alt="Morgana" />
            <div class="relative left-[60px] top-[-82px] flex h-[48px]  w-[37px] items-center justify-center bg-black bg-opacity-50 text-[12px]" q:key="hE_1">
              <div class="w-[33px] text-center text-[11px]">
                <img src="https://cdn5.lolalytics.com/lane27/support.webp" alt="support lane" class="m-auto mb-[2px]" />
                87.45
              </div>
            </div>
          </div>
          <div class="flex-auto overflow-hidden text-center">
            <div class="text-[22px] font-semibold">B+</div>
            <div class="mt-[2px] text-[12px] font-semibold text-[#4bc84b]">51.92</div>
            <div class="mt-[2px] text-[12px] font-semibold text-[#88f]">1.84</div>
            <div class="mt-[2px] text-[12px] font-semibold text-[#ec7878]">0.91</div>
            <div class="mt-[2px] text-[12px] font-semibold text-[#007800]">53.64</div>
          </div>
        </div>
      </div>
    </a>
  </div>
`;

test("extractTierListRows parses lane percent, win rate, and pick rate", () => {
  assert.deepEqual(extractTierListRows(sampleTierListHtml), [
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

test("extractTierListRows parses grid cards without dropping champions", () => {
  assert.deepEqual(extractTierListRows(sampleGridTierListHtml), [
    {
      slug: "maokai",
      name: "Maokai",
      lanePercent: 66.71,
      winRate: 52.45,
      pickRate: 2.22,
    },
    {
      slug: "morgana",
      name: "Morgana",
      lanePercent: 87.45,
      winRate: 51.92,
      pickRate: 1.84,
    },
  ]);
});

test("extractTierListRows returns one row per grid champion card", () => {
  const expectedChampionCount = sampleGridTierListHtml.match(/href="\/lol\/[^/]+\/build\//g)?.length || 0;

  assert.equal(extractTierListRows(sampleGridTierListHtml).length, expectedChampionCount);
});

test("extractTierListRows does not depend on a support-only lane icon alt", () => {
  const topLaneHtml = sampleGridTierListHtml.replaceAll('alt="support lane"', 'alt="top lane"');

  assert.equal(extractTierListRows(topLaneHtml).length, 2);
});

test("extractTierListRows supports default Emerald+ build links without a tier query", () => {
  const defaultTierHtml = sampleTierListHtml.replaceAll("tier=platinum_plus&amp;", "");
  const defaultTierGridHtml = sampleGridTierListHtml.replaceAll("tier=platinum_plus&amp;", "");

  assert.equal(extractTierListRows(defaultTierHtml).length, 2);
  assert.equal(extractTierListRows(defaultTierGridHtml).length, 2);
});

test("extractTierRowsFromMegaPayload parses current mega tier payloads by champion id", () => {
  const payload = {
    tier: {
      1: {
        lane: {
          support: {
            cid: {
              267: {
                pctLane: 99.92,
                wr: 52.06,
                pr: 14.46,
                topWr: "56.25",
              },
            },
          },
        },
      },
      2: {
        lane: {
          support: {
            cid: {
              412: {
                pctLane: 99.72,
                wr: 51.59,
                pr: 12.3,
              },
            },
          },
        },
      },
    },
  };

  assert.deepEqual(extractTierRowsFromMegaPayload(payload, "support"), [
    {
      championKey: "267",
      slug: "",
      name: "",
      lanePercent: 99.92,
      winRate: 52.06,
      pickRate: 14.46,
      bestWorldwideWinRateDelta: 4.19,
    },
    {
      championKey: "412",
      slug: "",
      name: "",
      lanePercent: 99.72,
      winRate: 51.59,
      pickRate: 12.3,
    },
  ]);
});

test("calculateBestWorldwideWinRateDelta calculates the tier delta and clamps negatives", () => {
  assert.equal(
    calculateBestWorldwideWinRateDelta({
      winRate: 53.88,
      bestWorldwideWinRate: "58.50",
    }),
    4.62,
  );
  assert.equal(
    calculateBestWorldwideWinRateDelta({
      winRate: 53.88,
      bestWorldwideWinRate: "52.50",
    }),
    0,
  );
  assert.equal(
    calculateBestWorldwideWinRateDelta({
      winRate: 53.88,
      bestWorldwideWinRate: null,
    }),
    null,
  );
});

test("extractTierRowsFromMegaPayload calculates PBI from mega tier fields", () => {
  const payload = {
    avgWr: 51.81,
    tier: {
      1: {
        lane: {
          support: {
            cid: {
              412: {
                pctLane: 99.64,
                wr: 53.5,
                pr: 13.29,
                br: 7.54,
              },
            },
          },
        },
      },
    },
  };

  assert.deepEqual(extractTierRowsFromMegaPayload(payload, "support"), [
    {
      championKey: "412",
      slug: "",
      name: "",
      lanePercent: 99.64,
      winRate: 53.5,
      pickRate: 13.29,
      pbi: 24,
    },
  ]);
});

test("calculatePickBanInfluence mirrors Lolalytics tier-list PBI formula", () => {
  assert.equal(
    calculatePickBanInfluence({
      winRate: 53.5,
      averageWinRate: 51.81,
      pickRate: 13.29,
      banRate: 7.54,
    }),
    24,
  );
  assert.equal(
    calculatePickBanInfluence({
      winRate: 52,
      averageWinRate: 51,
      pickRate: 10,
      banRate: 100,
    }),
    null,
  );
});

test("buildEligibleTierStats filters rows with minimum lane and pick thresholds", () => {
  const rows = extractTierListRows(sampleTierListHtml);
  const championBySlug = new Map([
    ["thresh", { key: "412", name: "Thresh" }],
    ["sona", { key: "37", name: "Sona" }],
  ]);
  const championByName = new Map([
    ["thresh", { key: "412", name: "Thresh" }],
    ["sona", { key: "37", name: "Sona" }],
  ]);

  const eligibleTierStats = buildEligibleTierStats(
    rows,
    championBySlug,
    championByName,
    {
      minLanePercent: 10,
      minPickRate: 0.5,
    },
  );

  assert.deepEqual(Array.from(eligibleTierStats.values()), [
    {
      candidateKey: "412",
      candidateSlug: "thresh",
      candidate: "Thresh",
      lanePercent: 99.63,
      winRate: 51.88,
      pickRate: 13.73,
    },
  ]);
});

test("buildEligibleTierStats falls back to normalized champion names when slugs drift", () => {
  const eligibleTierStats = buildEligibleTierStats(
    [
      {
        slug: "legacy-belveth-slug",
        name: "Bel'Veth",
        lanePercent: 72.4,
        winRate: 51.6,
        pickRate: 2.8,
      },
    ],
    new Map(),
    new Map([["belveth", { key: "200", name: "Bel'Veth" }]]),
    {
      minLanePercent: 10,
      minPickRate: 0.5,
    },
  );

  assert.deepEqual(Array.from(eligibleTierStats.values()), [
    {
      candidateKey: "200",
      candidateSlug: "legacy-belveth-slug",
      candidate: "Bel'Veth",
      lanePercent: 72.4,
      winRate: 51.6,
      pickRate: 2.8,
    },
  ]);
});

test("buildEligibleTierStats can join current mega tier rows by champion id", () => {
  const eligibleTierStats = buildEligibleTierStats(
    [
      {
        championKey: "267",
        slug: "",
        name: "",
        lanePercent: 99.92,
        winRate: 52.06,
        pickRate: 14.46,
        pbi: 5,
      },
    ],
    new Map(),
    new Map(),
    {
      championByKey: new Map([["267", { key: "267", name: "Nami" }]]),
      minLanePercent: 10,
      minPickRate: 0.5,
    },
  );

  assert.deepEqual(Array.from(eligibleTierStats.values()), [
    {
      candidateKey: "267",
      candidateSlug: "",
      candidate: "Nami",
      lanePercent: 99.92,
      winRate: 52.06,
      pickRate: 14.46,
      pbi: 5,
    },
  ]);
});
