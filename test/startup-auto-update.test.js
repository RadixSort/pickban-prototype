const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isAutoUpdateDisabled,
  readPackageVersion,
  runStartupAutoUpdate,
} = require("../lib/startup-auto-update.js");

const CWD = "/repo";
const LOCAL_PACKAGE = JSON.stringify({ version: "0.6.3" });
const REMOTE_PACKAGE = JSON.stringify({ version: "0.6.4" });

test("startup auto-update can be disabled by env", () => {
  const commands = [];
  const result = runStartupAutoUpdate({
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

test("startup auto-update skips branches other than main", () => {
  const commands = [];
  const result = runStartupAutoUpdate({
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

test("startup auto-update skips dirty work trees before fetching", () => {
  const commands = [];
  const result = runStartupAutoUpdate({
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

test("startup auto-update does nothing when remote main has the same version", () => {
  const commands = [];
  const result = runStartupAutoUpdate({
    cwd: CWD,
    env: {},
    logger: createLogger(),
    readFile: () => LOCAL_PACKAGE,
    runCommand: createCommandRunner(commands, {
      "git show FETCH_HEAD:package.json": success(LOCAL_PACKAGE),
    }),
  });

  assert.equal(result.status, "up-to-date");
  assert.equal(result.localVersion, "0.6.3");
  assert.equal(result.remoteVersion, "0.6.3");
});

test("startup auto-update fast-forwards and installs when remote main has a new version", () => {
  const commands = [];
  const result = runStartupAutoUpdate({
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
  assert.equal(result.localVersion, "0.6.3");
  assert.equal(result.remoteVersion, "0.6.4");
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

test("readPackageVersion normalizes invalid package text to an empty string", () => {
  assert.equal(readPackageVersion("{"), "");
  assert.equal(readPackageVersion(JSON.stringify({ version: " 0.6.3 " })), "0.6.3");
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
