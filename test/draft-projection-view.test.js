const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getRoundedAllyWinRate,
  getRoundedRateTone,
  renderDraftProjectionView,
} = require("../public/draft-projection-view.js");

test("draft projection view rounds to complementary integers", () => {
  const html = renderDraftProjectionView(
    {
      summary: {
        allyCount: 5,
        enemyCount: 3,
        synergyMatchupCount: 20,
        counterMatchupCount: 15,
        sourceMatchups: 35,
      },
      projection: {
        allyWinRate: 53.6,
      },
    },
    {
      rankFilterLabel: "Emerald+",
    },
  );

  assert.equal(getRoundedAllyWinRate(53.6), 54);
  assert.equal(getRoundedRateTone(54, 46), "positive");
  assert.equal(getRoundedRateTone(46, 54), "negative");
  assert.match(html, /54%/);
  assert.match(html, /46%/);
  assert.match(html, /draft-projection-rate--positive/);
  assert.match(html, /draft-projection-rate--negative/);
  assert.match(html, /style="width: 54%;"/);
  assert.match(html, /style="width: 46%;"/);
});

test("draft projection view renders 50-50 outcomes as yellow on both sides", () => {
  const html = renderDraftProjectionView({
    summary: {
      allyCount: 5,
      enemyCount: 5,
      synergyMatchupCount: 20,
      counterMatchupCount: 25,
      sourceMatchups: 45,
    },
    projection: {
      allyWinRate: 49.5,
    },
  });

  assert.equal(getRoundedAllyWinRate(49.5), 50);
  assert.equal(getRoundedRateTone(50, 50), "even");
  assert.match(html, /draft-projection-rate--even/);
  assert.match(html, /style="width: 50%;"/);
});

test("draft projection view renders partial scrape failures below the win rates", () => {
  const html = renderDraftProjectionView(
    {
      summary: {
        allyCount: 5,
        enemyCount: 5,
      },
      projection: {
        allyWinRate: 52.1,
      },
    },
    {
      partialFailures: ["Ahri: Missing synergy row."],
    },
  );

  assert.match(html, /Partial scrape failures/);
  assert.match(html, /Ahri: Missing synergy row\./);
  assert.ok(
    html.indexOf("draft-projection-scoreboard") < html.indexOf("Partial scrape failures"),
  );
  assert.ok(
    html.indexOf("Partial scrape failures") < html.indexOf("draft-projection-meta"),
  );
});
