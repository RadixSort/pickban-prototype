const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  RUNE_IMPORT_PAGE_NAME_PREFIX,
  buildLeagueRunePageUpdate,
  fetchLiveDraftImport,
  getFirstEditableRunePage,
  importRunePageIntoLeagueClient,
  normalizeRunePageForImport,
} = require("../lib/riot-live-draft.js");

function createRuneRecommendation() {
  return {
    pageKey: "8000|8008,9111,9103,8014|8200|8210,8236|5008,5008,5001",
    primaryStyle: {
      styleId: 8000,
      name: "Precision",
    },
    secondaryStyle: {
      styleId: 8200,
      name: "Sorcery",
    },
    selections: {
      primary: [
        { id: 8014, slotIndex: 3 },
        { id: 8008, slotIndex: 0 },
        { id: 9111, slotIndex: 1 },
        { id: 9103, slotIndex: 2 },
      ],
      secondary: [
        { id: 8236, slotIndex: 3 },
        { id: 8210, slotIndex: 1 },
      ],
      modifiers: [
        { id: 5008 },
        { id: 5008 },
        { id: 5001 },
      ],
    },
  };
}

async function createMockLockfile() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "pickban-rune-lockfile-"));
  const lockfilePath = path.join(directory, "lockfile");
  await fs.writeFile(lockfilePath, "LeagueClientUx:1234:54321:secret:http", "utf8");
  return lockfilePath;
}

test("normalizeRunePageForImport builds ordered League Client perk ids", () => {
  const page = normalizeRunePageForImport(createRuneRecommendation());

  assert.deepEqual(page, {
    primaryStyleId: 8000,
    subStyleId: 8200,
    selectedPerkIds: [8008, 9111, 9103, 8014, 8210, 8236, 5008, 5008, 5001],
  });
});

test("fetchLiveDraftImport avoids champ-select reads when gameflow is unsupported", async () => {
  const lockfilePath = await createMockLockfile();
  const requests = [];
  const payload = await fetchLiveDraftImport({
    env: {
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
    platform: "darwin",
    requestJson: async (_credentials, resourcePath) => {
      requests.push(resourcePath);
      return {
        phase: "ChampSelect",
        gameData: {
          queue: {
            id: 450,
          },
        },
      };
    },
  });

  assert.equal(payload.status, "disabled");
  assert.equal(payload.reason, "unsupported_queue");
  assert.deepEqual(requests, ["/lol-gameflow/v1/session"]);
});

test("normalizeRunePageForImport rejects incomplete rune pages", () => {
  const page = createRuneRecommendation();
  page.selections.modifiers = [{ id: 5008 }, { id: 5001 }];

  assert.throws(
    () => normalizeRunePageForImport(page),
    /needs 3 stat modifiers/i,
  );
});

test("getFirstEditableRunePage skips default pages and chooses the first saved page", () => {
  const page = getFirstEditableRunePage([
    {
      id: 9,
      name: "Default",
      order: 0,
      isEditable: false,
      isDeletable: false,
    },
    {
      id: 12,
      name: "Second saved",
      order: 2,
      isEditable: true,
      isDeletable: true,
    },
    {
      id: 11,
      name: "First saved",
      order: 1,
      isEditable: true,
      isDeletable: true,
    },
  ]);

  assert.equal(page.id, 11);
});

test("buildLeagueRunePageUpdate rewrites the target page name and rune selections", () => {
  const runePage = normalizeRunePageForImport(createRuneRecommendation());
  const update = buildLeagueRunePageUpdate({
    championName: "Ahri",
    existingPage: {
      id: 11,
      name: "Old Page",
      order: 1,
      isEditable: true,
      isDeletable: true,
      current: false,
    },
    runePage,
  });

  assert.deepEqual(update, {
    id: 11,
    name: `${RUNE_IMPORT_PAGE_NAME_PREFIX}Ahri`,
    order: 1,
    isEditable: true,
    isDeletable: true,
    current: false,
    primaryStyleId: 8000,
    selectedPerkIds: [8008, 9111, 9103, 8014, 8210, 8236, 5008, 5008, 5001],
    subStyleId: 8200,
  });
});

test("importRunePageIntoLeagueClient updates the first editable saved page during champ select", async () => {
  const lockfilePath = await createMockLockfile();
  const requests = [];
  const payload = await importRunePageIntoLeagueClient({
    championName: "Ahri",
    env: {
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
    platform: "darwin",
    runePage: createRuneRecommendation(),
    requestJson: async (credentials, resourcePath, options = {}) => {
      requests.push({
        credentials,
        resourcePath,
        options,
      });

      if (resourcePath === "/lol-gameflow/v1/session") {
        return {
          phase: "ChampSelect",
        };
      }

      if (resourcePath === "/lol-perks/v1/pages") {
        return [
          {
            id: 1,
            name: "Default",
            order: 0,
            isEditable: false,
            isDeletable: false,
          },
          {
            id: 5,
            name: "Saved",
            order: 1,
            isEditable: true,
            isDeletable: true,
          },
        ];
      }

      if (resourcePath === "/lol-perks/v1/pages/5" && options.method === "PUT") {
        return options.body;
      }

      throw new Error(`Unexpected request ${resourcePath}`);
    },
  });

  assert.equal(payload.status, "imported");
  assert.equal(payload.page.name, "import - Ahri");
  assert.deepEqual(payload.page.selectedPerkIds, [
    8008,
    9111,
    9103,
    8014,
    8210,
    8236,
    5008,
    5008,
    5001,
  ]);
  assert.deepEqual(requests.map((request) => request.resourcePath), [
    "/lol-gameflow/v1/session",
    "/lol-perks/v1/pages",
    "/lol-perks/v1/pages/5",
  ]);
  assert.equal(requests[0].credentials.password, "secret");
  assert.equal(requests[2].options.body.name, "import - Ahri");
});

test("importRunePageIntoLeagueClient skips the page write when runes are already imported", async () => {
  const lockfilePath = await createMockLockfile();
  const requests = [];
  const payload = await importRunePageIntoLeagueClient({
    championName: "Ahri",
    env: {
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
    platform: "darwin",
    runePage: createRuneRecommendation(),
    requestJson: async (_credentials, resourcePath, options = {}) => {
      requests.push({
        resourcePath,
        method: options.method || "GET",
      });

      if (resourcePath === "/lol-gameflow/v1/session") {
        return {
          phase: "ChampSelect",
        };
      }

      if (resourcePath === "/lol-perks/v1/pages") {
        return [
          {
            id: 5,
            name: "import - Ahri",
            order: 1,
            isEditable: true,
            isDeletable: true,
            primaryStyleId: 8000,
            selectedPerkIds: [
              8008,
              9111,
              9103,
              8014,
              8210,
              8236,
              5008,
              5008,
              5001,
            ],
            subStyleId: 8200,
          },
        ];
      }

      throw new Error(`Unexpected request ${resourcePath}`);
    },
  });

  assert.equal(payload.status, "imported");
  assert.equal(payload.message, "Runes are already imported into import - Ahri.");
  assert.deepEqual(requests, [
    {
      resourcePath: "/lol-gameflow/v1/session",
      method: "GET",
    },
    {
      resourcePath: "/lol-perks/v1/pages",
      method: "GET",
    },
  ]);
});

test("importRunePageIntoLeagueClient refuses to mutate pages outside champ select", async () => {
  const lockfilePath = await createMockLockfile();
  const requests = [];
  const payload = await importRunePageIntoLeagueClient({
    championName: "Ahri",
    env: {
      PICKBAN_RIOT_LOCKFILE_PATH: lockfilePath,
    },
    platform: "darwin",
    runePage: createRuneRecommendation(),
    requestJson: async (_credentials, resourcePath) => {
      requests.push(resourcePath);
      return {
        phase: "Lobby",
      };
    },
  });

  assert.equal(payload.status, "disabled");
  assert.equal(payload.reason, "not_in_champ_select");
  assert.deepEqual(requests, ["/lol-gameflow/v1/session"]);
});
