const test = require("node:test");
const assert = require("node:assert/strict");
const zlib = require("node:zlib");

const {
  extractZipEntries,
  isAutoUpdateDisabled,
  readPackageVersion,
  runStartupAutoUpdate,
} = require("../lib/startup-auto-update.js");

const CWD = "/repo";
const OLDER_PACKAGE = JSON.stringify({ version: "0.6.3" });
const LOCAL_PACKAGE = JSON.stringify({ version: "0.6.4" });
const REMOTE_PACKAGE = JSON.stringify({ version: "0.6.8" });

test("startup auto-update can be disabled by env", async () => {
  const commands = [];
  const result = await runStartupAutoUpdate({
    cwd: CWD,
    env: {
      PICKBAN_DISABLE_AUTO_UPDATE: "1",
    },
    logger: createLogger(),
    runCommand: createCommandRunner(commands),
  });

  assert.equal(result.status, "disabled");
  assert.deepEqual(commands, []);
  assert.equal(isAutoUpdateDisabled({ PICKBAN_AUTO_UPDATE: "0" }), true);
});

test("startup auto-update skips branches other than main", async () => {
  const commands = [];
  const result = await runStartupAutoUpdate({
    cwd: CWD,
    env: {},
    logger: createLogger(),
    readFile: () => LOCAL_PACKAGE,
    runCommand: createCommandRunner(commands, {
      "git rev-parse --abbrev-ref HEAD": success("release\n"),
    }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "current branch release is not main");
  assert.deepEqual(
    commands.map((entry) => commandKey(entry.command, entry.args)),
    [
      "git rev-parse --is-inside-work-tree",
      "git rev-parse --show-toplevel",
      "git rev-parse --abbrev-ref HEAD",
    ],
  );
});

test("startup auto-update skips dirty work trees before fetching", async () => {
  const commands = [];
  const result = await runStartupAutoUpdate({
    cwd: CWD,
    env: {},
    logger: createLogger(),
    readFile: () => LOCAL_PACKAGE,
    runCommand: createCommandRunner(commands, {
      "git status --porcelain": success(" M public/app.js\n"),
    }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "working tree has local changes");
  assert.equal(
    commands.some((entry) => commandKey(entry.command, entry.args) === "git fetch --quiet origin main"),
    false,
  );
});

test("startup auto-update does nothing when remote main has the same version", async () => {
  const commands = [];
  const result = await runStartupAutoUpdate({
    cwd: CWD,
    env: {},
    logger: createLogger(),
    readFile: () => LOCAL_PACKAGE,
    runCommand: createCommandRunner(commands, {
      "git show FETCH_HEAD:package.json": success(LOCAL_PACKAGE),
    }),
  });

  assert.equal(result.status, "up-to-date");
  assert.equal(result.localVersion, "0.6.4");
  assert.equal(result.remoteVersion, "0.6.4");
});

test("startup auto-update does not fast-forward to an older package version", async () => {
  const commands = [];
  const result = await runStartupAutoUpdate({
    cwd: CWD,
    env: {},
    logger: createLogger(),
    readFile: () => LOCAL_PACKAGE,
    runCommand: createCommandRunner(commands, {
      "git show FETCH_HEAD:package.json": success(OLDER_PACKAGE),
    }),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "remote v0.6.3 is older than local v0.6.4");
  assert.equal(
    commands.some((entry) => commandKey(entry.command, entry.args) === "git merge --ff-only FETCH_HEAD"),
    false,
  );
});

test("startup auto-update fast-forwards and installs when remote main has a new version", async () => {
  const commands = [];
  const result = await runStartupAutoUpdate({
    cwd: CWD,
    env: {},
    logger: createLogger(),
    readFile: () => LOCAL_PACKAGE,
    runCommand: createCommandRunner(commands, {
      "git show FETCH_HEAD:package.json": success(REMOTE_PACKAGE),
      "git diff --name-only abc123 HEAD -- package.json package-lock.json": success(
        "package.json\npackage-lock.json\n",
      ),
    }),
  });

  assert.equal(result.status, "updated");
  assert.equal(result.localVersion, "0.6.4");
  assert.equal(result.remoteVersion, "0.6.8");
  assert.deepEqual(
    commands.map((entry) => commandKey(entry.command, entry.args)),
    [
      "git rev-parse --is-inside-work-tree",
      "git rev-parse --show-toplevel",
      "git rev-parse --abbrev-ref HEAD",
      "git status --porcelain",
      "git fetch --quiet origin main",
      "git show FETCH_HEAD:package.json",
      "git rev-parse HEAD",
      "git merge --ff-only FETCH_HEAD",
      "git diff --name-only abc123 HEAD -- package.json package-lock.json",
      "npm install --no-audit --no-fund",
    ],
  );
});

test("startup auto-update installs a 0.6.8 release zip for no-git 0.6.4 installs", async () => {
  const commands = [];
  const writtenFiles = new Map();
  const createdDirs = [];
  let downloadSignal = null;
  const archiveBuffer = createZipBuffer({
    "pickban-prototype-main/package.json": REMOTE_PACKAGE,
    "pickban-prototype-main/server.js": "require('express');\n",
  });
  const result = await runStartupAutoUpdate({
    cwd: CWD,
    env: {},
    exists: () => false,
    fetchImpl: async (_url, options) => {
      downloadSignal = options.signal;
      return createZipResponse(archiveBuffer);
    },
    logger: createLogger(),
    mkdir: (dirPath) => {
      createdDirs.push(dirPath);
    },
    readFile: (filePath) => {
      if (filePath === `${CWD}/package.json`) {
        return LOCAL_PACKAGE;
      }

      throw new Error(`Unexpected read: ${filePath}`);
    },
    runCommand: createCommandRunner(commands, {
      "git rev-parse --is-inside-work-tree": failure("git not found"),
    }),
    writeFile: (filePath, fileBuffer) => {
      writtenFiles.set(filePath, Buffer.from(fileBuffer).toString("utf8"));
    },
  });

  assert.equal(result.status, "updated");
  assert.equal(result.source, "zip");
  assert.equal(result.localVersion, "0.6.4");
  assert.equal(result.remoteVersion, "0.6.8");
  assert.ok(downloadSignal instanceof AbortSignal);
  assert.equal(writtenFiles.get(`${CWD}/package.json`), REMOTE_PACKAGE);
  assert.equal(writtenFiles.get(`${CWD}/server.js`), "require('express');\n");
  assert.deepEqual(createdDirs, [CWD, CWD]);
  assert.deepEqual(
    commands.map((entry) => commandKey(entry.command, entry.args)),
    [
      "git rev-parse --is-inside-work-tree",
      "npm install --no-audit --no-fund",
    ],
  );
});

test("zip auto-update does not install an older package version", async () => {
  const commands = [];
  const writtenFiles = [];
  const archiveBuffer = createZipBuffer({
    "pickban-prototype-main/package.json": OLDER_PACKAGE,
  });
  const result = await runStartupAutoUpdate({
    cwd: CWD,
    env: {},
    exists: () => false,
    fetchImpl: async () => createZipResponse(archiveBuffer),
    logger: createLogger(),
    readFile: () => LOCAL_PACKAGE,
    runCommand: createCommandRunner(commands, {
      "git rev-parse --is-inside-work-tree": failure("git not found"),
    }),
    writeFile: (filePath) => writtenFiles.push(filePath),
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "release v0.6.3 is older than local v0.6.4");
  assert.deepEqual(writtenFiles, []);
  assert.equal(
    commands.some((entry) => commandKey(entry.command, entry.args) === "npm install --no-audit --no-fund"),
    false,
  );
});

test("zip extraction strips the GitHub archive root directory", () => {
  const archiveBuffer = createZipBuffer({
    "pickban-prototype-main/package.json": LOCAL_PACKAGE,
    "pickban-prototype-main/public/index.html": "<!doctype html>\n",
  });
  const entries = extractZipEntries(archiveBuffer);

  assert.deepEqual([...entries.keys()], ["package.json", "public/index.html"]);
  assert.equal(entries.get("public/index.html").toString("utf8"), "<!doctype html>\n");
});

test("zip extraction inflates deflated entries", () => {
  const archiveBuffer = createZipBuffer(
    {
      "pickban-prototype-main/package.json": LOCAL_PACKAGE,
    },
    {
      compressionMethod: 8,
    },
  );
  const entries = extractZipEntries(archiveBuffer);

  assert.equal(entries.get("package.json").toString("utf8"), LOCAL_PACKAGE);
});

test("readPackageVersion normalizes invalid package text to an empty string", () => {
  assert.equal(readPackageVersion("{"), "");
  assert.equal(readPackageVersion(JSON.stringify({ version: " 0.6.4 " })), "0.6.4");
});

function createCommandRunner(commands, overrides = {}) {
  return (command, args, options = {}) => {
    commands.push({
      command,
      args,
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
    });

    const key = commandKey(command, args);
    if (Object.hasOwn(overrides, key)) {
      return overrides[key];
    }

    return defaultCommandResult(key);
  };
}

function createZipResponse(archiveBuffer) {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () =>
      archiveBuffer.buffer.slice(
        archiveBuffer.byteOffset,
        archiveBuffer.byteOffset + archiveBuffer.byteLength,
      ),
  };
}

function defaultCommandResult(key) {
  if (key === "git rev-parse --is-inside-work-tree") {
    return success("true\n");
  }

  if (key === "git rev-parse --show-toplevel") {
    return success(`${CWD}\n`);
  }

  if (key === "git rev-parse --abbrev-ref HEAD") {
    return success("main\n");
  }

  if (key === "git status --porcelain") {
    return success("");
  }

  if (key === "git fetch --quiet origin main") {
    return success("");
  }

  if (key === "git show FETCH_HEAD:package.json") {
    return success(REMOTE_PACKAGE);
  }

  if (key === "git rev-parse HEAD") {
    return success("abc123\n");
  }

  if (key === "git merge --ff-only FETCH_HEAD") {
    return success("");
  }

  if (key === "git diff --name-only abc123 HEAD -- package.json package-lock.json") {
    return success("");
  }

  if (key === "npm install --no-audit --no-fund") {
    return success("");
  }

  return failure(`unexpected command: ${key}`);
}

function commandKey(command, args) {
  return [command, ...args].join(" ");
}

function success(stdout = "") {
  return {
    ok: true,
    stdout,
    stderr: "",
  };
}

function failure(stderr = "") {
  return {
    ok: false,
    stdout: "",
    stderr,
  };
}

function createLogger() {
  return {
    logs: [],
    errors: [],
    log(message) {
      this.logs.push(message);
    },
    error(message) {
      this.errors.push(message);
    },
  };
}

function createZipBuffer(files, { compressionMethod = 0 } = {}) {
  const localFileRecords = [];
  const centralDirectoryRecords = [];
  let offset = 0;

  for (const [fileName, content] of Object.entries(files)) {
    const fileNameBuffer = Buffer.from(fileName, "utf8");
    const contentBuffer = Buffer.from(content);
    const compressedContentBuffer =
      compressionMethod === 8 ? zlib.deflateRawSync(contentBuffer) : contentBuffer;
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt32LE(0, 10);
    localHeader.writeUInt32LE(0, 14);
    localHeader.writeUInt32LE(compressedContentBuffer.length, 18);
    localHeader.writeUInt32LE(contentBuffer.length, 22);
    localHeader.writeUInt16LE(fileNameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt32LE(0, 12);
    centralHeader.writeUInt32LE(0, 16);
    centralHeader.writeUInt32LE(compressedContentBuffer.length, 20);
    centralHeader.writeUInt32LE(contentBuffer.length, 24);
    centralHeader.writeUInt16LE(fileNameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt32LE(0, 34);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    const localRecord = Buffer.concat([localHeader, fileNameBuffer, compressedContentBuffer]);
    localFileRecords.push(localRecord);
    centralDirectoryRecords.push(Buffer.concat([centralHeader, fileNameBuffer]));
    offset += localRecord.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralDirectoryRecords);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(centralDirectoryRecords.length, 8);
  endOfCentralDirectory.writeUInt16LE(centralDirectoryRecords.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localFileRecords, centralDirectory, endOfCentralDirectory]);
}
