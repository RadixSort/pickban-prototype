const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const path = require("path");

const LOCKFILE_ENV_KEYS = [
  "PICKBAN_RIOT_LOCKFILE_PATH",
  "LEAGUE_CLIENT_LOCKFILE_PATH",
  "RIOT_LOCKFILE_PATH",
];
const LEAGUE_CLIENT_TIMEOUT_MS = 2500;
const LOCALHOST = "127.0.0.1";

const SUPPORTED_QUEUE_BY_ID = new Map([
  [400, { description: "Normal Draft", type: "normal_draft" }],
  [420, { description: "Ranked Solo/Duo", type: "ranked" }],
  [440, { description: "Ranked Flex", type: "ranked" }],
]);

async function fetchLiveDraftImport({
  championByKey,
  env = process.env,
  normalizeRole,
  platform = process.platform,
  requestJson = requestLeagueClientJson,
  timeoutMs = LEAGUE_CLIENT_TIMEOUT_MS,
} = {}) {
  const lockfilePath = await findLeagueClientLockfilePath({ env, platform });
  if (!lockfilePath) {
    return buildDisabledPayload(
      "lockfile_not_found",
      "Auto champion import is disabled: no running League Client lockfile was found.",
    );
  }

  let credentials;
  try {
    credentials = parseLeagueClientLockfile(await fs.readFile(lockfilePath, "utf8"));
  } catch (error) {
    return buildDisabledPayload(
      error.code === "ENOENT" ? "lockfile_not_found" : "lockfile_unreadable",
      "Auto champion import is disabled: the League Client lockfile could not be read.",
    );
  }

  try {
    const [
      gameflowSession,
      champSelectSession,
    ] = await Promise.all([
      requestJson(credentials, "/lol-gameflow/v1/session", { timeoutMs }),
      requestJson(credentials, "/lol-champ-select/v1/session", { timeoutMs }),
    ]);

    return buildLiveDraftImport({
      championByKey,
      champSelectSession,
      gameflowSession,
      normalizeRole,
    });
  } catch (error) {
    const reason = error.statusCode === 404 ? "champ_select_not_found" : "connection_lost";
    const message =
      reason === "champ_select_not_found"
        ? "Auto champion import is disabled: no active pick/ban phase was found."
        : "Auto champion import is disabled: the League Client connection was lost.";

    return buildDisabledPayload(reason, message);
  }
}

async function findLeagueClientLockfilePath({ env = process.env, platform = process.platform } = {}) {
  for (const key of LOCKFILE_ENV_KEYS) {
    const configuredPath = typeof env[key] === "string" ? env[key].trim() : "";
    if (configuredPath) {
      return configuredPath;
    }
  }

  if (platform !== "win32") {
    return null;
  }

  for (const candidatePath of getWindowsLockfileCandidates(env)) {
    if (await fileExists(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

function getWindowsLockfileCandidates(env = process.env) {
  const candidates = [
    "C:\\Riot Games\\League of Legends\\lockfile",
  ];

  for (const root of [env.ProgramFiles, env["ProgramFiles(x86)"]]) {
    if (typeof root === "string" && root.trim()) {
      candidates.push(path.win32.join(root, "Riot Games", "League of Legends", "lockfile"));
    }
  }

  return Array.from(new Set(candidates));
}

async function fileExists(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch (_error) {
    return false;
  }
}

function parseLeagueClientLockfile(value) {
  const parts = String(value || "").trim().split(":");
  if (parts.length !== 5) {
    throw new Error("League Client lockfile has an unexpected format.");
  }

  const [
    processName,
    pid,
    port,
    password,
    protocol,
  ] = parts;
  const normalizedProtocol = protocol.toLowerCase();
  const parsedPort = Number(port);

  if (!processName || !pid || !Number.isInteger(parsedPort) || parsedPort <= 0 || !password) {
    throw new Error("League Client lockfile is missing required connection details.");
  }

  if (normalizedProtocol !== "https" && normalizedProtocol !== "http") {
    throw new Error("League Client lockfile uses an unsupported protocol.");
  }

  return {
    password,
    port: parsedPort,
    protocol: normalizedProtocol,
  };
}

function requestLeagueClientJson(credentials, resourcePath, { timeoutMs = LEAGUE_CLIENT_TIMEOUT_MS } = {}) {
  const transport = credentials.protocol === "http" ? http : https;
  const authorization = Buffer.from(`riot:${credentials.password}`).toString("base64");

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        hostname: LOCALHOST,
        port: credentials.port,
        path: resourcePath,
        method: "GET",
        rejectUnauthorized: false,
        headers: {
          accept: "application/json",
          authorization: `Basic ${authorization}`,
        },
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            const error = new Error(
              `League Client request failed for ${resourcePath} with status ${response.statusCode}.`,
            );
            error.statusCode = response.statusCode;
            error.resourcePath = resourcePath;
            reject(error);
            return;
          }

          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (error) {
            error.resourcePath = resourcePath;
            reject(error);
          }
        });
      },
    );

    request.on("error", reject);
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out while connecting to the League Client at ${resourcePath}.`));
    });
    request.end();
  });
}

function buildLiveDraftImport({
  championByKey,
  champSelectSession,
  gameflowSession,
  normalizeRole,
} = {}) {
  const gameflowPhase = normalizeGameflowPhase(gameflowSession?.phase);
  if (gameflowPhase !== "ChampSelect") {
    return buildDisabledPayload(
      "not_in_champ_select",
      "Auto champion import is disabled: no active pick/ban phase was found.",
      { gameflowPhase },
    );
  }

  const queueId = extractQueueId(gameflowSession);
  const supportedQueue = SUPPORTED_QUEUE_BY_ID.get(queueId);
  if (!supportedQueue) {
    return buildDisabledPayload(
      "unsupported_queue",
      "Auto champion import is disabled: this mode is not Normal Draft or Ranked.",
      {
        gameflowPhase,
        queue: buildQueueMetadata(queueId, null),
      },
    );
  }

  const localPlayerCellId = normalizeCellId(champSelectSession?.localPlayerCellId);
  const teamPlayers = normalizeChampSelectTeam(champSelectSession?.myTeam, {
    championByKey,
    localPlayerCellId,
    normalizeRole,
  });
  const enemyPlayers = normalizeChampSelectTeam(champSelectSession?.theirTeam, {
    championByKey,
    localPlayerCellId,
    normalizeRole,
  });
  const localPlayer = teamPlayers.find((player) => player.isLocalPlayer) || null;
  const allies = teamPlayers.filter((player) => player.championKey);
  const enemies = enemyPlayers.filter((player) => player.championKey);

  return {
    status: "active",
    active: true,
    reason: "",
    message: "Champion picks are automatically being imported from the League Client.",
    gameflowPhase,
    queue: buildQueueMetadata(queueId, supportedQueue),
    assignedRole: localPlayer?.role || null,
    localPlayerCellId,
    allies,
    enemies,
    fetchedAt: new Date().toISOString(),
  };
}

function normalizeChampSelectTeam(team, { championByKey, localPlayerCellId, normalizeRole } = {}) {
  if (!Array.isArray(team)) {
    return [];
  }

  return team
    .map((player) =>
      normalizeChampSelectPlayer(player, {
        championByKey,
        localPlayerCellId,
        normalizeRole,
      }),
    )
    .filter(Boolean);
}

function normalizeChampSelectPlayer(
  player,
  {
    championByKey,
    localPlayerCellId,
    normalizeRole,
  } = {},
) {
  if (!player || typeof player !== "object") {
    return null;
  }

  const cellId = normalizeCellId(player.cellId);
  const championKey = normalizeChampionKey(player.championId);
  const champion = championKey ? championByKey?.get(championKey) || null : null;

  return {
    cellId,
    champion: champion?.name || "",
    championKey: champion ? String(champion.key) : "",
    championId: champion?.id || "",
    icon: champion?.icon || "",
    role: normalizeLiveRole(player.assignedPosition, normalizeRole),
    isLocalPlayer: cellId != null && cellId === localPlayerCellId,
  };
}

function normalizeLiveRole(value, normalizeRole) {
  const rawValue = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!rawValue || rawValue === "none" || rawValue === "invalid") {
    return null;
  }

  if (rawValue === "utility") {
    return "support";
  }

  return typeof normalizeRole === "function" ? normalizeRole(rawValue) : null;
}

function normalizeChampionKey(value) {
  const championKey = Number(value);
  if (!Number.isInteger(championKey) || championKey <= 0) {
    return "";
  }

  return String(championKey);
}

function normalizeCellId(value) {
  const cellId = Number(value);
  return Number.isInteger(cellId) ? cellId : null;
}

function normalizeGameflowPhase(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "Unknown";
}

function extractQueueId(gameflowSession) {
  const candidates = [
    gameflowSession?.gameData?.queue?.id,
    gameflowSession?.gameData?.queue?.queueId,
    gameflowSession?.gameData?.queueId,
    gameflowSession?.gameData?.gameQueueConfigId,
    gameflowSession?.queueId,
  ];

  for (const value of candidates) {
    const queueId = Number(value);
    if (Number.isInteger(queueId)) {
      return queueId;
    }
  }

  return null;
}

function buildQueueMetadata(queueId, supportedQueue) {
  return {
    id: Number.isInteger(queueId) ? queueId : null,
    description: supportedQueue?.description || "Unsupported queue",
    type: supportedQueue?.type || "unsupported",
  };
}

function buildDisabledPayload(reason, message, details = {}) {
  return {
    status: "disabled",
    active: false,
    reason,
    message,
    assignedRole: null,
    allies: [],
    enemies: [],
    fetchedAt: new Date().toISOString(),
    ...details,
  };
}

module.exports = {
  SUPPORTED_QUEUE_BY_ID,
  buildLiveDraftImport,
  fetchLiveDraftImport,
  findLeagueClientLockfilePath,
  parseLeagueClientLockfile,
  requestLeagueClientJson,
};
