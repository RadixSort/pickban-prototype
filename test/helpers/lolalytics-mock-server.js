const http = require("node:http");
const { once } = require("node:events");

async function startMockLolalyticsServer(responder) {
  const requests = [];
  const openSockets = new Set();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    requests.push({
      method: request.method,
      pathname: url.pathname,
      search: url.search,
      url: url.toString(),
    });

    try {
      const result = await responder({ request, url, requests });
      const status = result?.status ?? 200;
      const headers = { ...(result?.headers || {}) };

      if (typeof result?.body === "string") {
        headers["content-type"] ||= "text/plain; charset=utf-8";
        response.writeHead(status, headers);
        response.end(result.body);
        return;
      }

      headers["content-type"] ||= "application/json; charset=utf-8";
      response.writeHead(status, headers);
      response.end(JSON.stringify(result?.body ?? {}));
    } catch (error) {
      response.writeHead(500, {
        "content-type": "application/json; charset=utf-8",
      });
      response.end(
        JSON.stringify({
          error: error.message || "Unexpected mock-server failure.",
        }),
      );
    }
  });

  server.on("connection", (socket) => {
    openSockets.add(socket);
    socket.unref();
    socket.on("close", () => {
      openSockets.delete(socket);
    });
  });

  server.listen(0, "127.0.0.1");
  server.unref();
  await once(server, "listening");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  if (!Number.isInteger(port)) {
    throw new Error("Failed to start the mock Lolalytics server.");
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    megaUrl: `http://127.0.0.1:${port}/mega/`,
    requests,
    close: async () => {
      server.close();
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      for (const socket of openSockets) {
        socket.destroy();
      }
      await Promise.race([
        once(server, "close"),
        waitForCloseTimeout(),
      ]);
    },
    countRequests(matcher = () => true) {
      const predicate =
        typeof matcher === "function"
          ? matcher
          : (entry) => entry.pathname === matcher;

      return requests.filter(predicate).length;
    },
  };
}

function jsonResponse(body, status = 200, headers = {}) {
  return {
    status,
    headers,
    body,
  };
}

function textResponse(body, status = 200, headers = {}) {
  return {
    status,
    headers,
    body,
  };
}

function createQwikPayload(loaders) {
  return {
    _objs: [{ loaders }],
    _entry: "0",
  };
}

function createRoleBuildQData(enemyRowsByRole) {
  return createQwikPayload({
    build: {
      header: {
        lane: "support",
      },
      enemy: enemyRowsByRole,
    },
  });
}

function createTierMegaData(lane, rows = []) {
  const cid = {};

  rows.forEach((row, index) => {
    cid[String(row.championKey)] = {
      rank: row.rank || index + 1,
      pctLane: row.lanePercent,
      wr: row.winRate,
      pr: row.pickRate,
      games: row.games || 1000,
    };
  });

  return {
    tier: {
      1: {
        lane: {
          [lane]: {
            cid,
          },
        },
      },
    },
  };
}

function createCounterMegaData(rows = []) {
  return {
    counters: rows.map((row) => ({
      cid: Number(row.championKey),
      defaultLane: row.role,
      vsWr: row.candidateWinRate,
      d1: row.candidateCounterScore,
      n: row.games || 1000,
    })),
  };
}

function createRuneBuildMegaData({
  role = "middle",
  totalGames = 60,
  pickWinRate = 55,
  highestWinRate = 57,
  highestWinGames = Math.max(1, Math.round(totalGames * 0.6)),
} = {}) {
  return {
    header: {
      n: totalGames,
      defaultLane: role,
      lane: role,
    },
    summary: {
      runes: {
        pick: {
          wr: pickWinRate,
          n: totalGames,
          page: {
            pri: 0,
            sec: 4,
          },
          set: {
            pri: [8008, 9111, 9103, 8014],
            sec: [8304, 8347],
            mod: [5005, 5008, 5011],
          },
        },
        win: {
          wr: highestWinRate,
          n: highestWinGames,
          page: {
            pri: 0,
            sec: 4,
          },
          set: {
            pri: [8008, 9111, 9103, 8014],
            sec: [8304, 8347],
            mod: [5005, 5008, 5011],
          },
        },
      },
      pick: {
        pri: [
          [8008, pickWinRate, 100, totalGames],
          [9111, pickWinRate, 100, totalGames],
          [9103, pickWinRate, 100, totalGames],
          [8014, pickWinRate, 100, totalGames],
        ],
        sec: [
          [8304, pickWinRate, 100, totalGames],
          [8347, pickWinRate, 100, totalGames],
        ],
        mod: [
          [5005, pickWinRate, 100, totalGames],
          [5008, pickWinRate, 100, totalGames],
          [5011, pickWinRate, 100, totalGames],
        ],
      },
      win: {
        pri: [
          [8008, highestWinRate, 100, highestWinGames],
          [9111, highestWinRate, 100, highestWinGames],
          [9103, highestWinRate, 100, highestWinGames],
          [8014, highestWinRate, 100, highestWinGames],
        ],
        sec: [
          [8304, highestWinRate, 100, highestWinGames],
          [8347, highestWinRate, 100, highestWinGames],
        ],
        mod: [
          [5005, highestWinRate, 100, highestWinGames],
          [5008, highestWinRate, 100, highestWinGames],
          [5011, highestWinRate, 100, highestWinGames],
        ],
      },
    },
    nav: {
      lanes: {
        [role]: 100,
      },
    },
    response: {
      valid: true,
    },
  };
}

function createGenericBuildQData({
  allyChampionKey = "103",
  role = "middle",
  totalGames = 60,
  winRate = 55,
  bootItemId = 3006,
  bootName = "Berserker's Greaves",
} = {}) {
  return createQwikPayload({
    build: {
      header: {
        cid: Number(allyChampionKey),
        lane: role,
        n: totalGames,
      },
      runes: {
        stats: {
          8008: [[totalGames, winRate, totalGames]],
          9111: [[totalGames, winRate, totalGames]],
          9103: [[totalGames, winRate, totalGames]],
          8014: [[totalGames, winRate, totalGames]],
          8304: [
            [0, 0, 0],
            [totalGames, winRate, totalGames],
          ],
          8347: [
            [0, 0, 0],
            [totalGames, winRate, totalGames],
          ],
          5005: [[totalGames, winRate, totalGames]],
          5008: [[totalGames, winRate, totalGames]],
          5011: [[totalGames, winRate, totalGames]],
        },
      },
      summary: {
        pick: {
          sums: {
            ids: [4, 12],
            n: totalGames,
            wr: winRate,
          },
          runes: {
            wr: winRate,
            n: totalGames,
            set: {
              pri: [8008, 9111, 9103, 8014],
              sec: [8304, 8347],
              mod: [5005, 5008, 5011],
            },
          },
        },
        win: {
          sums: {
            ids: [4, 14],
            n: Math.max(1, Math.round(totalGames * 0.6)),
            wr: winRate + 2,
          },
          runes: {
            wr: winRate,
            n: totalGames,
            set: {
              pri: [8008, 9111, 9103, 8014],
              sec: [8304, 8347],
              mod: [5005, 5008, 5011],
            },
          },
        },
      },
      spells: [
        ["4_12", winRate, 100, totalGames],
        ["4_14", winRate + 2, 60, Math.max(1, Math.round(totalGames * 0.6))],
      ],
      item1: [[3118, winRate, totalGames, totalGames, 10]],
      item2: [[bootItemId, winRate, totalGames, totalGames, 13]],
      item3: [[3157, winRate, totalGames, totalGames, 21]],
      item4: [[3089, winRate, totalGames, totalGames, 27]],
      item5: [[3135, winRate, totalGames, totalGames, 31]],
      item6: [[4645, winRate, totalGames, totalGames, 34]],
      boots: [[bootItemId, winRate, totalGames, totalGames, 0]],
    },
    metadata: {
      champions: {},
      items: {
        [bootItemId]: bootName,
        3118: "Malignance",
        3135: "Void Staff",
        3157: "Zhonya's Hourglass",
        3089: "Rabadon's Deathcap",
        4645: "Shadowflame",
      },
      spells: {
        4: "Flash",
        12: "Teleport",
        14: "Ignite",
      },
      runes: {
        5005: "Attack Speed",
        5008: "Adaptive Force",
        5011: "Health",
        8008: "Lethal Tempo",
        8014: "Coup de Grace",
        8304: "Magical Footwear",
        8347: "Cosmic Insight",
        9103: "Legend: Bloodline",
        9111: "Triumph",
      },
    },
  });
}

function createMatchupBuildQData({
  allyChampionKey = "103",
  enemyChampionKey = "89",
  role = "middle",
  enemyRole = "support",
  totalGames = 60,
  winRate = 55,
  bootItemId = 3006,
  bootName = "Berserker's Greaves",
} = {}) {
  return createQwikPayload({
    build: {
      header: {
        cid: Number(allyChampionKey),
        vs: Number(enemyChampionKey),
        lane: role,
        vsLane: enemyRole,
        n: totalGames,
      },
      runes: {
        stats: {
          8008: [[totalGames, winRate, totalGames]],
          9111: [[totalGames, winRate, totalGames]],
          9103: [[totalGames, winRate, totalGames]],
          8014: [[totalGames, winRate, totalGames]],
          8304: [
            [0, 0, 0],
            [totalGames, winRate, totalGames],
          ],
          8347: [
            [0, 0, 0],
            [totalGames, winRate, totalGames],
          ],
          5005: [[totalGames, winRate, totalGames]],
          5008: [[totalGames, winRate, totalGames]],
          5011: [[totalGames, winRate, totalGames]],
        },
      },
      summary: {
        pick: {
          sums: {
            ids: [4, 12],
            n: totalGames,
            wr: winRate,
          },
          runes: {
            wr: winRate,
            n: totalGames,
            set: {
              pri: [8008, 9111, 9103, 8014],
              sec: [8304, 8347],
              mod: [5005, 5008, 5011],
            },
          },
        },
        win: {
          sums: {
            ids: [4, 14],
            n: Math.max(1, Math.round(totalGames * 0.6)),
            wr: winRate + 2,
          },
          runes: {
            wr: winRate,
            n: totalGames,
            set: {
              pri: [8008, 9111, 9103, 8014],
              sec: [8304, 8347],
              mod: [5005, 5008, 5011],
            },
          },
        },
      },
      spells: [
        ["4_12", winRate, 100, totalGames],
        ["4_14", winRate + 2, 60, Math.max(1, Math.round(totalGames * 0.6))],
      ],
      item1: [[3118, winRate, totalGames, totalGames, 10]],
      item2: [[bootItemId, winRate, totalGames, totalGames, 13]],
      item3: [[3157, winRate, totalGames, totalGames, 21]],
      item4: [[3089, winRate, totalGames, totalGames, 27]],
      item5: [[3135, winRate, totalGames, totalGames, 31]],
      item6: [[4645, winRate, totalGames, totalGames, 34]],
      boots: [[bootItemId, winRate, totalGames, totalGames, 0]],
    },
    metadata: {
      champions: {},
      items: {
        [bootItemId]: bootName,
        3118: "Malignance",
        3135: "Void Staff",
        3157: "Zhonya's Hourglass",
        3089: "Rabadon's Deathcap",
        4645: "Shadowflame",
      },
      spells: {
        4: "Flash",
        12: "Teleport",
        14: "Ignite",
      },
      runes: {
        5005: "Attack Speed",
        5008: "Adaptive Force",
        5011: "Health",
        8008: "Lethal Tempo",
        8014: "Coup de Grace",
        8304: "Magical Footwear",
        8347: "Cosmic Insight",
        9103: "Legend: Bloodline",
        9111: "Triumph",
      },
    },
  });
}

function buildTierListHtml(rows) {
  return rows.map(buildTierListRowHtml).join("\n");
}

function buildTierListRowHtml({
  slug,
  name,
  lanePercent,
  winRate,
  pickRate,
}) {
  return `
    <div class="flex h-[52px]  justify-between text-[13px] text-[#cccccc] odd:bg-[#181818] even:bg-[#101010]" q:id="${slug}">
      <div style="width:50px" class="my-auto justify-center flex" q:key="1">
        <a href="/lol/${slug}/build/?patch=7" q:key="Hl_2">
          <img src="https://cdn5.lolalytics.com/champx46/${slug}.webp" width="50" height="50" alt="${name}" />
        </a>
      </div>
      <div style="width:110px" class="my-auto justify-center flex" q:key="2">
        <a href="/lol/${slug}/build/?patch=7" q:key="Hl_0">${name}</a>
      </div>
      <div style="width:40px" class="my-auto justify-center flex" q:key="3">S</div>
      <div style="width:40px" class="my-auto justify-center flex" q:key="4">
        <div class="w-[33px] text-center" q:key="Hl_4">
          <img src="https://cdn5.lolalytics.com/lane27/support.webp" alt="support lane" />
          ${lanePercent}
        </div>
      </div>
      <div style="width:48px" class="my-auto justify-center flex" q:key="5">
        <div class="text-center" q:key="Hl_8">
          <span style="color:#67bb5b" q:key="wW_0">${winRate}</span>
          <br />
          <span class="mt-[2px] text-[11px] text-[#aaaaaa]">+0.00</span>
        </div>
      </div>
      <div style="width:48px" class="my-auto justify-center flex" q:key="6">${pickRate}</div>
    </div>
  `;
}

function waitForCloseTimeout(timeoutMs = 100) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    timer.unref?.();
  });
}

module.exports = {
  buildTierListHtml,
  createCounterMegaData,
  createRuneBuildMegaData,
  createGenericBuildQData,
  createMatchupBuildQData,
  createRoleBuildQData,
  createTierMegaData,
  jsonResponse,
  startMockLolalyticsServer,
  textResponse,
};
