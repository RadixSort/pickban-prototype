const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDraftProjection,
  hasUsableDraftProjection,
} = require("../lib/draft-projection.js");

test("buildDraftProjection aggregates ally synergy and enemy counter win rates", () => {
  const projection = buildDraftProjection({
    allySynergyResults: [
      {
        status: "fulfilled",
        value: {
          row: {
            winRate: 54,
            value: 12,
          },
        },
      },
      {
        status: "fulfilled",
        value: {
          row: {
            winRate: 56,
            value: 8,
          },
        },
      },
      {
        status: "rejected",
        reason: new Error("Missing ally synergy row."),
      },
    ],
    enemyCounterResults: [
      {
        status: "fulfilled",
        value: {
          row: {
            winRate: 46,
            value: -6,
          },
        },
      },
    ],
  });

  assert.ok(Math.abs(projection.allyWinRate - 54.666666666666664) < 1e-12);
  assert.ok(Math.abs(projection.enemyWinRate - 45.333333333333336) < 1e-12);
  assert.equal(projection.synergyScore, 10);
  assert.equal(projection.counterScore, -6);
  assert.equal(projection.projectedAgency, 4);
  assert.equal(projection.synergyMatchupCount, 2);
  assert.equal(projection.counterMatchupCount, 1);
  assert.equal(projection.sourceMatchups, 3);
  assert.equal(projection.projectedWinRateMatchupCount, 3);
  assert.deepEqual(projection.partialFailures, ["Missing ally synergy row."]);
  assert.equal(hasUsableDraftProjection(projection), true);
});

test("buildDraftProjection rejects projections without any usable win-rate samples", () => {
  const projection = buildDraftProjection({
    allySynergyResults: [
      {
        status: "fulfilled",
        value: {
          row: {
            winRate: null,
            value: 12,
          },
        },
      },
    ],
    enemyCounterResults: [
      {
        status: "fulfilled",
        value: {
          row: {
            winRate: Number.NaN,
            value: -6,
          },
        },
      },
    ],
  });

  assert.equal(projection.allyWinRate, null);
  assert.equal(projection.enemyWinRate, null);
  assert.equal(projection.synergyScore, 12);
  assert.equal(projection.counterScore, -6);
  assert.equal(projection.projectedWinRateMatchupCount, 0);
  assert.equal(projection.sourceMatchups, 2);
  assert.equal(hasUsableDraftProjection(projection), false);
});

test("buildDraftProjection applies lane weighting only to counter agency", () => {
  const projection = buildDraftProjection({
    enemyCounterResults: [
      {
        status: "fulfilled",
        value: {
          targetRole: "support",
          row: {
            opponentRole: "jungle",
            winRate: 48,
            value: 10,
          },
        },
      },
      {
        status: "fulfilled",
        value: {
          targetRole: "support",
          row: {
            opponentRole: "bottom",
            winRate: 48,
            value: 10,
          },
        },
      },
    ],
  });

  assert.equal(projection.counterScore, 7.5);
  assert.equal(projection.projectedAgency, 7.5);
  assert.equal(projection.allyWinRate, 52);
});

test("hasUsableDraftProjection rejects empty projections", () => {
  const projection = buildDraftProjection();

  assert.equal(projection.sourceMatchups, 0);
  assert.equal(projection.projectedWinRateMatchupCount, 0);
  assert.equal(hasUsableDraftProjection(projection), false);
});

test("buildDraftProjection clamps malformed win rates and falls back to a generic failure message", () => {
  const upperBoundProjection = buildDraftProjection({
    allySynergyResults: [
      {
        status: "fulfilled",
        value: {
          row: {
            winRate: 120,
            value: 8,
          },
        },
      },
    ],
    enemyCounterResults: [
      {
        status: "rejected",
        reason: {},
      },
    ],
  });

  assert.equal(upperBoundProjection.allyWinRate, 100);
  assert.equal(upperBoundProjection.enemyWinRate, 0);
  assert.equal(upperBoundProjection.projectedWinRateMatchupCount, 1);
  assert.deepEqual(upperBoundProjection.partialFailures, ["Unexpected server error."]);

  const lowerBoundProjection = buildDraftProjection({
    enemyCounterResults: [
      {
        status: "fulfilled",
        value: {
          row: {
            winRate: 150,
            value: -6,
          },
        },
      },
    ],
  });

  assert.equal(lowerBoundProjection.allyWinRate, 0);
  assert.equal(lowerBoundProjection.enemyWinRate, 100);
  assert.equal(lowerBoundProjection.projectedWinRateMatchupCount, 1);
  assert.equal(lowerBoundProjection.counterScore, -6);
});
