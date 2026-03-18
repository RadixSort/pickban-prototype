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

test("extractSupportTierListRows parses grid cards without dropping champions", () => {
  assert.deepEqual(extractSupportTierListRows(sampleGridTierListHtml), [
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

test("extractSupportTierListRows returns one row per grid champion card", () => {
  const expectedChampionCount =
    sampleGridTierListHtml.match(/href="\/lol\/[^/]+\/build\/\?tier=/g)?.length || 0;

  assert.equal(extractSupportTierListRows(sampleGridTierListHtml).length, expectedChampionCount);
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
