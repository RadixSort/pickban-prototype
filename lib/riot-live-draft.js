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
const RUNE_IMPORT_PAGE_NAME_PREFIX = "import - ";

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
    const gameflowSession = await requestJson(credentials, "/lol-gameflow/v1/session", {
      timeoutMs,
    });
    const inactivePayload = buildInactiveLiveDraftPayload(gameflowSession);
    if (inactivePayload) {
      return inactivePayload;
    }
    const champSelectSession = await requestJson(
      credentials,
      "/lol-champ-select/v1/session",
      { timeoutMs },
    );

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

async function importRunePageIntoLeagueClient({
  championName,
  env = process.env,
  platform = process.platform,
  requestJson = requestLeagueClientJson,
  runePage,
  timeoutMs = LEAGUE_CLIENT_TIMEOUT_MS,
} = {}) {
  const normalizedChampionName = normalizeRuneImportChampionName(championName);
  const normalizedRunePage = normalizeRunePageForImport(runePage);
  const lockfilePath = await findLeagueClientLockfilePath({ env, platform });
  if (!lockfilePath) {
    return buildDisabledPayload(
      "lockfile_not_found",
      "Rune import is unavailable: no running League Client lockfile was found.",
    );
  }

  let credentials;
  try {
    credentials = parseLeagueClientLockfile(await fs.readFile(lockfilePath, "utf8"));
  } catch (error) {
    return buildDisabledPayload(
      error.code === "ENOENT" ? "lockfile_not_found" : "lockfile_unreadable",
      "Rune import is unavailable: the League Client lockfile could not be read.",
    );
  }

  try {
    const gameflowSession = await requestJson(credentials, "/lol-gameflow/v1/session", {
      timeoutMs,
    });
    const gameflowPhase = normalizeGameflowPhase(gameflowSession?.phase);
    if (gameflowPhase !== "ChampSelect") {
      return buildDisabledPayload(
        "not_in_champ_select",
        "Rune import is unavailable: no active pick/ban phase was found.",
        { gameflowPhase },
      );
    }

    const runePages = await requestJson(credentials, "/lol-perks/v1/pages", { timeoutMs });
    const targetPage = getFirstEditableRunePage(runePages);
    if (!targetPage) {
      return buildDisabledPayload(
        "rune_page_not_found",
        "Rune import is unavailable: no editable saved rune page was found in the League Client.",
        { gameflowPhase },
      );
    }

    const pageUpdate = buildLeagueRunePageUpdate({
      championName: normalizedChampionName,
      existingPage: targetPage,
      runePage: normalizedRunePage,
    });
    const pageAlreadyImported = isImportedRunePageCurrent(targetPage, pageUpdate);
    const updatedPage = pageAlreadyImported
      ? pageUpdate
      : await requestJson(
          credentials,
          `/lol-perks/v1/pages/${encodeURIComponent(String(targetPage.id))}`,
          {
            body: pageUpdate,
            method: "PUT",
            timeoutMs,
          },
        );
    const importedPage = normalizeImportedRunePage(updatedPage, pageUpdate);

    return {
      status: "imported",
      active: true,
      imported: true,
      reason: "",
      message: pageAlreadyImported
        ? `Runes are already imported into ${importedPage.name}.`
        : `Imported runes into ${importedPage.name}.`,
      gameflowPhase,
      page: importedPage,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    const reason = error.statusCode === 404 ? "champ_select_not_found" : "connection_lost";
    const message =
      reason === "champ_select_not_found"
        ? "Rune import is unavailable: no active pick/ban phase was found."
        : "Rune import failed: the League Client connection was lost.";

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

function requestLeagueClientJson(
  credentials,
  resourcePath,
  {
    body = null,
    method = "GET",
    timeoutMs = LEAGUE_CLIENT_TIMEOUT_MS,
  } = {},
) {
  const transport = credentials.protocol === "http" ? http : https;
  const authorization = Buffer.from(`riot:${credentials.password}`).toString("base64");
  const serializedBody = body == null ? "" : JSON.stringify(body);
  const headers = {
    accept: "application/json",
    authorization: `Basic ${authorization}`,
  };

  if (serializedBody) {
    headers["content-type"] = "application/json";
    headers["content-length"] = Buffer.byteLength(serializedBody);
  }

  return new Promise((resolve, reject) => {
    const request = transport.request(
      {
        hostname: LOCALHOST,
        port: credentials.port,
        path: resourcePath,
        method,
        rejectUnauthorized: false,
        headers,
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
    if (serializedBody) {
      request.write(serializedBody);
    }
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
  const lockedAllies = teamPlayers.filter((player) => player.championKey);
  const hoveredAllies = normalizeHoveredAllyPicks(champSelectSession, {
    bannedChampionKeys: collectBannedChampionKeys(champSelectSession),
    championByKey,
    lockedAllies,
    normalizeRole,
    teamPlayers,
  });
  const allies = mergeLiveAllies(lockedAllies, hoveredAllies);
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

function buildInactiveLiveDraftPayload(gameflowSession) {
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

  return null;
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

function normalizeHoveredAllyPicks(
  champSelectSession,
  {
    bannedChampionKeys = new Set(),
    championByKey,
    lockedAllies = [],
    normalizeRole,
    teamPlayers = [],
  } = {},
) {
  const actions = flattenChampSelectActions(champSelectSession?.actions);
  if (actions.length === 0) {
    return [];
  }

  const playerByCellId = new Map(
    teamPlayers
      .filter((player) => player.cellId != null)
      .map((player) => [player.cellId, player]),
  );
  const lockedChampionKeys = new Set(lockedAllies.map((player) => player.championKey));
  const lockedRoles = new Set(
    lockedAllies.map((player) => normalizeLiveRole(player.role, normalizeRole)).filter(Boolean),
  );
  const seenCellIds = new Set();
  const hoveredAllies = [];

  for (const action of actions) {
    if (!isPendingAllyPickAction(action)) {
      continue;
    }

    const championKey = normalizeChampionKey(action.championId);
    const actorCellId = normalizeCellId(action.actorCellId);
    const champion = championKey ? championByKey?.get(championKey) || null : null;
    const player = playerByCellId.get(actorCellId) || null;
    const role = normalizeLiveRole(player?.role ?? player?.assignedPosition, normalizeRole);

    if (
      !champion ||
      actorCellId == null ||
      !player ||
      seenCellIds.has(actorCellId) ||
      bannedChampionKeys.has(championKey) ||
      lockedChampionKeys.has(championKey) ||
      (role && lockedRoles.has(role))
    ) {
      continue;
    }

    seenCellIds.add(actorCellId);
    hoveredAllies.push({
      cellId: actorCellId,
      champion: champion.name,
      championKey: String(champion.key),
      championId: champion.id,
      icon: champion.icon,
      role,
      isLocalPlayer: actorCellId === normalizeCellId(champSelectSession?.localPlayerCellId),
      temporary: true,
    });
  }

  return hoveredAllies;
}

function flattenChampSelectActions(actions) {
  if (!Array.isArray(actions)) {
    return [];
  }

  return actions.flatMap((actionGroup) =>
    Array.isArray(actionGroup) ? actionGroup : [actionGroup],
  );
}

function isPendingAllyPickAction(action) {
  if (!action || typeof action !== "object") {
    return false;
  }

  const type = typeof action.type === "string" ? action.type.trim().toLowerCase() : "";
  return (
    type === "pick" &&
    action.completed !== true &&
    action.isAllyAction !== false &&
    normalizeChampionKey(action.championId)
  );
}

function collectBannedChampionKeys(champSelectSession) {
  const bannedChampionKeys = new Set();
  const addChampionKey = (value) => {
    const championKey = normalizeChampionKey(value);
    if (championKey) {
      bannedChampionKeys.add(championKey);
    }
  };

  for (const action of flattenChampSelectActions(champSelectSession?.actions)) {
    const type = typeof action?.type === "string" ? action.type.trim().toLowerCase() : "";
    if (type === "ban" && action.completed === true) {
      addChampionKey(action.championId);
    }
  }

  const bans = champSelectSession?.bans;
  if (bans && typeof bans === "object") {
    [
      ...(Array.isArray(bans.myTeamBans) ? bans.myTeamBans : []),
      ...(Array.isArray(bans.theirTeamBans) ? bans.theirTeamBans : []),
    ].forEach(addChampionKey);
  }

  return bannedChampionKeys;
}

function mergeLiveAllies(lockedAllies, hoveredAllies) {
  const allies = [...lockedAllies];
  const occupiedCellIds = new Set(
    lockedAllies
      .map((player) => normalizeCellId(player.cellId))
      .filter((cellId) => cellId != null),
  );

  for (const hoveredAlly of hoveredAllies) {
    const cellId = normalizeCellId(hoveredAlly.cellId);
    if (cellId == null || occupiedCellIds.has(cellId)) {
      continue;
    }

    occupiedCellIds.add(cellId);
    allies.push(hoveredAlly);
  }

  return allies;
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

function normalizeRuneImportChampionName(value) {
  const championName = typeof value === "string" ? value.trim() : "";
  if (!championName) {
    throw createRuneImportError(
      400,
      "invalid_champion",
      "Choose an allied champion before importing runes.",
    );
  }

  return championName;
}

function normalizeRunePageForImport(runePage) {
  if (!runePage || typeof runePage !== "object") {
    throw createRuneImportError(
      400,
      "invalid_rune_page",
      "Choose a complete rune recommendation before importing runes.",
    );
  }

  const primaryStyleId = normalizePositiveInteger(
    runePage?.primaryStyle?.styleId ?? runePage?.primaryStyleId,
  );
  const subStyleId = normalizePositiveInteger(
    runePage?.secondaryStyle?.styleId ?? runePage?.subStyleId ?? runePage?.secondaryStyleId,
  );
  const primaryPerkIds = collectRuneSelectionIds(
    runePage?.selections?.primary ?? runePage?.primaryRunes,
    4,
    "primary runes",
  );
  const secondaryPerkIds = collectRuneSelectionIds(
    runePage?.selections?.secondary ?? runePage?.secondaryRunes,
    2,
    "secondary runes",
  );
  const statModIds = collectRuneSelectionIds(
    runePage?.selections?.modifiers ?? runePage?.modifiers,
    3,
    "stat modifiers",
  );

  if (!primaryStyleId || !subStyleId) {
    throw createRuneImportError(
      400,
      "invalid_rune_page",
      "The selected rune recommendation is missing its rune trees.",
    );
  }

  const selectedPerkIds = [
    ...primaryPerkIds,
    ...secondaryPerkIds,
    ...statModIds,
  ];

  return {
    primaryStyleId,
    subStyleId,
    selectedPerkIds,
  };
}

function collectRuneSelectionIds(selections, expectedCount, label) {
  if (!Array.isArray(selections)) {
    throw createRuneImportError(
      400,
      "invalid_rune_page",
      `The selected rune recommendation is missing ${label}.`,
    );
  }

  const ids = selections
    .map((selection, index) => ({
      id: normalizePositiveInteger(selection?.id ?? selection),
      index,
      slotIndex: Number.isInteger(Number(selection?.slotIndex))
        ? Number(selection.slotIndex)
        : Number.MAX_SAFE_INTEGER,
    }))
    .filter((selection) => selection.id)
    .sort((left, right) => left.slotIndex - right.slotIndex || left.index - right.index)
    .map((selection) => selection.id);

  if (ids.length !== expectedCount) {
    throw createRuneImportError(
      400,
      "invalid_rune_page",
      `The selected rune recommendation needs ${expectedCount} ${label}.`,
    );
  }

  return ids;
}

function buildLeagueRunePageUpdate({ championName, existingPage, runePage } = {}) {
  if (!existingPage || typeof existingPage !== "object") {
    throw createRuneImportError(
      409,
      "rune_page_not_found",
      "Rune import is unavailable: no editable saved rune page was found in the League Client.",
    );
  }

  const pageId = normalizePositiveInteger(existingPage.id);
  if (!pageId) {
    throw createRuneImportError(
      409,
      "rune_page_not_found",
      "Rune import is unavailable: the first editable saved rune page was missing an id.",
    );
  }

  return {
    ...existingPage,
    id: pageId,
    name: buildImportedRunePageName(championName),
    primaryStyleId: runePage.primaryStyleId,
    selectedPerkIds: [...runePage.selectedPerkIds],
    subStyleId: runePage.subStyleId,
  };
}

function getFirstEditableRunePage(pages) {
  if (!Array.isArray(pages)) {
    return null;
  }

  return pages
    .filter(isEditableSavedRunePage)
    .sort(compareRunePagesByOrder)[0] || null;
}

function isEditableSavedRunePage(page) {
  return (
    page &&
    typeof page === "object" &&
    normalizePositiveInteger(page.id) &&
    page.isEditable !== false &&
    page.isDeletable !== false
  );
}

function compareRunePagesByOrder(left, right) {
  const leftOrder = normalizeRunePageOrder(left?.order);
  const rightOrder = normalizeRunePageOrder(right?.order);
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return normalizePositiveInteger(left?.id) - normalizePositiveInteger(right?.id);
}

function normalizeRunePageOrder(value) {
  const order = Number(value);
  return Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER;
}

function buildImportedRunePageName(championName) {
  return `${RUNE_IMPORT_PAGE_NAME_PREFIX}${normalizeRuneImportChampionName(championName)}`;
}

function normalizeImportedRunePage(updatedPage, fallbackPage) {
  const page = updatedPage && typeof updatedPage === "object" ? updatedPage : fallbackPage;

  return {
    id: normalizePositiveInteger(page?.id),
    name: typeof page?.name === "string" && page.name.trim() ? page.name.trim() : fallbackPage.name,
    primaryStyleId: normalizePositiveInteger(page?.primaryStyleId) || fallbackPage.primaryStyleId,
    selectedPerkIds: Array.isArray(page?.selectedPerkIds)
      ? page.selectedPerkIds.map(normalizePositiveInteger).filter(Boolean)
      : [...fallbackPage.selectedPerkIds],
    subStyleId: normalizePositiveInteger(page?.subStyleId) || fallbackPage.subStyleId,
  };
}

function isImportedRunePageCurrent(page, pageUpdate) {
  return (
    normalizePageName(page?.name) === normalizePageName(pageUpdate?.name) &&
    normalizePositiveInteger(page?.primaryStyleId) === pageUpdate.primaryStyleId &&
    normalizePositiveInteger(page?.subStyleId) === pageUpdate.subStyleId &&
    areRuneSelectionsEqual(page?.selectedPerkIds, pageUpdate.selectedPerkIds)
  );
}

function areRuneSelectionsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => normalizePositiveInteger(value) === right[index]);
}

function normalizePageName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function createRuneImportError(statusCode, reason, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.reason = reason;
  return error;
}

module.exports = {
  RUNE_IMPORT_PAGE_NAME_PREFIX,
  SUPPORTED_QUEUE_BY_ID,
  buildLeagueRunePageUpdate,
  buildLiveDraftImport,
  fetchLiveDraftImport,
  findLeagueClientLockfilePath,
  getFirstEditableRunePage,
  importRunePageIntoLeagueClient,
  normalizeRunePageForImport,
  parseLeagueClientLockfile,
  requestLeagueClientJson,
};
