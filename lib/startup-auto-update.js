const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_REMOTE = "origin";
const DEFAULT_BRANCH = "main";
const FETCH_TIMEOUT_MS = 30000;
const GIT_TIMEOUT_MS = 10000;
const NPM_INSTALL_TIMEOUT_MS = 120000;

function runStartupAutoUpdate({
  cwd = process.cwd(),
  env = process.env,
  logger = console,
  runCommand = runCommandSync,
  readFile = fs.readFileSync,
} = {}) {
  if (isAutoUpdateDisabled(env)) {
    logInfo(logger, "PickBan auto-update disabled.");
    return {
      status: "disabled",
      reason: "disabled",
    };
  }

  const remote = normalizeGitRefPart(env.PICKBAN_AUTO_UPDATE_REMOTE) || DEFAULT_REMOTE;
  const branch = normalizeGitRefPart(env.PICKBAN_AUTO_UPDATE_BRANCH) || DEFAULT_BRANCH;

  try {
    const workTreeCheck = runGit(runCommand, cwd, ["rev-parse", "--is-inside-work-tree"]);
    if (!workTreeCheck.ok || workTreeCheck.stdout.trim() !== "true") {
      return skip(logger, "not a git work tree");
    }

    const repoRootResult = runGit(runCommand, cwd, ["rev-parse", "--show-toplevel"]);
    if (!repoRootResult.ok) {
      return skip(logger, "could not resolve git work tree root");
    }

    const repoRoot = repoRootResult.stdout.trim();
    const localPackagePath = path.join(repoRoot, "package.json");
    const localVersion = readPackageVersion(readFile(localPackagePath, "utf8"));
    if (!localVersion) {
      return skip(logger, "local package.json did not include a version");
    }

    const currentBranchResult = runGit(runCommand, repoRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    if (!currentBranchResult.ok) {
      return skip(logger, "could not resolve current branch");
    }

    const currentBranch = currentBranchResult.stdout.trim();
    if (currentBranch !== branch) {
      return skip(
        logger,
        `current branch ${currentBranch || "HEAD"} is not ${branch}`,
        { branch: currentBranch, targetBranch: branch, localVersion },
      );
    }

    const statusResult = runGit(runCommand, repoRoot, ["status", "--porcelain"]);
    if (!statusResult.ok) {
      return skip(logger, "could not read git status", { branch, localVersion });
    }

    if (statusResult.stdout.trim() !== "") {
      return skip(logger, "working tree has local changes", { branch, localVersion });
    }

    const fetchResult = runGit(runCommand, repoRoot, [
      "fetch",
      "--quiet",
      remote,
      branch,
    ], FETCH_TIMEOUT_MS);
    if (!fetchResult.ok) {
      return skip(logger, `could not fetch ${remote}/${branch}`, {
        branch,
        localVersion,
      });
    }

    const remotePackageResult = runGit(runCommand, repoRoot, [
      "show",
      "FETCH_HEAD:package.json",
    ]);
    if (!remotePackageResult.ok) {
      return skip(logger, `could not read ${remote}/${branch}:package.json`, {
        branch,
        localVersion,
      });
    }

    const remoteVersion = readPackageVersion(remotePackageResult.stdout);
    if (!remoteVersion) {
      return skip(logger, `${remote}/${branch} package.json did not include a version`, {
        branch,
        localVersion,
      });
    }

    if (normalizeVersion(localVersion) === normalizeVersion(remoteVersion)) {
      logInfo(logger, `PickBan is up to date (v${normalizeVersion(localVersion)}).`);
      return {
        status: "up-to-date",
        branch,
        localVersion,
        remote,
        remoteVersion,
      };
    }

    const previousHeadResult = runGit(runCommand, repoRoot, ["rev-parse", "HEAD"]);
    if (!previousHeadResult.ok) {
      return skip(logger, "could not resolve current git commit", {
        branch,
        localVersion,
        remote,
        remoteVersion,
      });
    }

    const previousHead = previousHeadResult.stdout.trim();
    const mergeResult = runGit(runCommand, repoRoot, [
      "merge",
      "--ff-only",
      "FETCH_HEAD",
    ], FETCH_TIMEOUT_MS);
    if (!mergeResult.ok) {
      return skip(logger, `could not fast-forward to ${remote}/${branch}`, {
        branch,
        localVersion,
        remote,
        remoteVersion,
      });
    }

    const packageChangeResult = runGit(runCommand, repoRoot, [
      "diff",
      "--name-only",
      previousHead,
      "HEAD",
      "--",
      "package.json",
      "package-lock.json",
    ]);
    const packageFilesChanged =
      packageChangeResult.ok && packageChangeResult.stdout.trim() !== "";

    if (packageFilesChanged) {
      const installResult = runCommand("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: repoRoot,
        timeoutMs: NPM_INSTALL_TIMEOUT_MS,
      });
      if (!installResult.ok) {
        logError(logger, "PickBan updated, but dependency installation failed.");
        return {
          status: "updated",
          branch,
          dependencyInstallFailed: true,
          localVersion,
          remote,
          remoteVersion,
        };
      }
    }

    logInfo(
      logger,
      `Updated PickBan from v${normalizeVersion(localVersion)} to v${normalizeVersion(remoteVersion)} from ${remote}/${branch}.`,
    );
    return {
      status: "updated",
      branch,
      dependencyInstallFailed: false,
      localVersion,
      remote,
      remoteVersion,
    };
  } catch (error) {
    logError(logger, `PickBan auto-update skipped: ${error.message || "unexpected error"}.`);
    return {
      status: "skipped",
      reason: "unexpected error",
    };
  }
}

function runGit(runCommand, cwd, args, timeoutMs = GIT_TIMEOUT_MS) {
  return runCommand("git", args, {
    cwd,
    timeoutMs,
  });
}

function runCommandSync(command, args, { cwd, timeoutMs } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
  });

  return {
    ok: result.status === 0 && !result.error,
    status: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
  };
}

function skip(logger, reason, details = {}) {
  logInfo(logger, `PickBan auto-update skipped: ${reason}.`);
  return {
    status: "skipped",
    reason,
    ...details,
  };
}

function readPackageVersion(packageJsonText) {
  try {
    const packageJson = JSON.parse(packageJsonText);
    return typeof packageJson.version === "string" ? packageJson.version.trim() : "";
  } catch (_error) {
    return "";
  }
}

function isAutoUpdateDisabled(env = {}) {
  return (
    isTruthyEnvValue(env.PICKBAN_DISABLE_AUTO_UPDATE) ||
    String(env.PICKBAN_AUTO_UPDATE || "").trim() === "0"
  );
}

function isTruthyEnvValue(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

function normalizeGitRefPart(value) {
  const normalizedValue = String(value || "").trim();
  return /^[A-Za-z0-9._/-]+$/.test(normalizedValue) ? normalizedValue : "";
}

function normalizeVersion(value) {
  return String(value || "").trim().replace(/^v/i, "");
}

function logInfo(logger, message) {
  if (typeof logger?.log === "function") {
    logger.log(message);
  }
}

function logError(logger, message) {
  if (typeof logger?.error === "function") {
    logger.error(message);
    return;
  }

  logInfo(logger, message);
}

module.exports = {
  isAutoUpdateDisabled,
  readPackageVersion,
  runStartupAutoUpdate,
};
