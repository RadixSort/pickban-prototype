const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");

const DEFAULT_REMOTE = "origin";
const DEFAULT_BRANCH = "main";
const DEFAULT_ZIP_URL =
  "https://github.com/RadixSort/pickban-prototype/archive/refs/heads/main.zip";
const FETCH_TIMEOUT_MS = 30000;
const GIT_TIMEOUT_MS = 10000;
const NPM_INSTALL_TIMEOUT_MS = 120000;

async function runStartupAutoUpdate({
  cwd = process.cwd(),
  env = process.env,
  exists = fs.existsSync,
  fetchImpl = globalThis.fetch,
  logger = console,
  mkdir = fs.mkdirSync,
  runCommand = runCommandSync,
  readFile = fs.readFileSync,
  writeFile = fs.writeFileSync,
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
      const gitDirPath = path.join(path.resolve(cwd), ".git");
      if (exists(gitDirPath)) {
        return skip(logger, "git unavailable in a git work tree");
      }

      return runZipAutoUpdate({
        branch,
        cwd,
        env,
        fetchImpl,
        logger,
        mkdir,
        readFile,
        runCommand,
        writeFile,
      });
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

    const versionComparison = compareReleaseVersions(remoteVersion, localVersion);
    if (versionComparison === 0) {
      logInfo(logger, `PickBan is up to date (v${normalizeVersion(localVersion)}).`);
      return { status: "up-to-date", branch, localVersion, remote, remoteVersion };
    }
    if (versionComparison == null || versionComparison < 0) {
      const reason = versionComparison == null
        ? "could not compare local and remote package versions"
        : `remote v${remoteVersion} is older than local v${localVersion}`;
      return skip(logger, reason, { branch, localVersion, remote, remoteVersion });
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

async function runZipAutoUpdate({
  branch,
  cwd,
  env,
  fetchImpl,
  logger,
  mkdir,
  readFile,
  runCommand,
  writeFile,
}) {
  const repoRoot = path.resolve(cwd);
  const localPackagePath = path.join(repoRoot, "package.json");
  const localVersion = readPackageVersion(readFile(localPackagePath, "utf8"));
  if (!localVersion) {
    return skip(logger, "local package.json did not include a version");
  }

  if (typeof fetchImpl !== "function") {
    return skip(logger, "zip fallback requires Node fetch");
  }

  const zipUrl = normalizeZipUrl(env.PICKBAN_AUTO_UPDATE_ZIP_URL) || DEFAULT_ZIP_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let archiveBuffer;
  try {
    const response = await fetchImpl(zipUrl, {
      headers: {
        "accept": "application/zip,application/octet-stream,*/*",
        "user-agent": "PickBan startup auto-update",
      },
      signal: controller.signal,
    });

    if (!response?.ok) {
      return skip(logger, `could not download release zip with status ${response?.status || "unknown"}`, {
        branch,
        localVersion,
        source: "zip",
        zipUrl,
      });
    }

    archiveBuffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const reason =
      error?.name === "AbortError"
        ? "release zip download timed out"
        : "could not download release zip";
    return skip(logger, reason, {
      branch,
      localVersion,
      source: "zip",
      zipUrl,
    });
  } finally {
    clearTimeout(timeout);
  }

  const archiveEntries = extractZipEntries(archiveBuffer);
  const remotePackageBuffer = archiveEntries.get("package.json");
  const remoteVersion = readPackageVersion(bufferToUtf8(remotePackageBuffer));
  if (!remoteVersion) {
    return skip(logger, "release zip package.json did not include a version", {
      branch,
      localVersion,
      source: "zip",
      zipUrl,
    });
  }

  const versionComparison = compareReleaseVersions(remoteVersion, localVersion);
  if (versionComparison === 0) {
    logInfo(logger, `PickBan is up to date (v${normalizeVersion(localVersion)}).`);
    return { status: "up-to-date", branch, localVersion, remoteVersion, source: "zip", zipUrl };
  }
  if (versionComparison == null || versionComparison < 0) {
    const reason = versionComparison == null
      ? "could not compare local and release package versions"
      : `release v${remoteVersion} is older than local v${localVersion}`;
    return skip(logger, reason, {
      branch,
      localVersion,
      remoteVersion,
      source: "zip",
      zipUrl,
    });
  }

  const packageFilesChanged = hasArchiveFileChanged(repoRoot, archiveEntries, readFile, "package.json") ||
    hasArchiveFileChanged(repoRoot, archiveEntries, readFile, "package-lock.json");

  writeZipEntries(repoRoot, archiveEntries, {
    mkdir,
    writeFile,
  });

  if (packageFilesChanged) {
    const installResult = runCommand("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: repoRoot,
      timeoutMs: NPM_INSTALL_TIMEOUT_MS,
    });
    if (!installResult.ok) {
      logError(
        logger,
        "PickBan updated from the release zip, but dependency installation failed. Run npm install, then npm start again if startup fails.",
      );
      return {
        status: "updated",
        branch,
        dependencyInstallFailed: true,
        localVersion,
        remoteVersion,
        source: "zip",
        zipUrl,
      };
    }
  }

  logInfo(
    logger,
    `Updated PickBan from v${normalizeVersion(localVersion)} to v${normalizeVersion(remoteVersion)} from the release zip.`,
  );
  return {
    status: "updated",
    branch,
    dependencyInstallFailed: false,
    localVersion,
    remoteVersion,
    source: "zip",
    zipUrl,
  };
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

function normalizeZipUrl(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return "";
  }

  try {
    const url = new URL(normalizedValue);
    return url.protocol === "https:" ? url.toString() : "";
  } catch (_error) {
    return "";
  }
}

function normalizeVersion(value) {
  return String(value || "").trim().replace(/^v/i, "");
}

function compareReleaseVersions(left, right) {
  const leftParts = parseReleaseVersion(left);
  const rightParts = parseReleaseVersion(right);
  if (!leftParts || !rightParts) {
    return null;
  }

  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] > rightParts[index] ? 1 : -1;
    }
  }

  return 0;
}

function parseReleaseVersion(value) {
  const match = normalizeVersion(value).match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }

  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function extractZipEntries(archiveBuffer) {
  const entries = new Map();
  const endOfCentralDirectoryOffset = findEndOfCentralDirectoryOffset(archiveBuffer);
  if (endOfCentralDirectoryOffset === -1) {
    throw new Error("Release zip did not include a central directory.");
  }

  const centralDirectorySize = archiveBuffer.readUInt32LE(endOfCentralDirectoryOffset + 12);
  const centralDirectoryOffset = archiveBuffer.readUInt32LE(endOfCentralDirectoryOffset + 16);
  let offset = centralDirectoryOffset;
  const endOffset = centralDirectoryOffset + centralDirectorySize;

  while (offset < endOffset) {
    if (archiveBuffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Release zip central directory is malformed.");
    }

    const compressionMethod = archiveBuffer.readUInt16LE(offset + 10);
    const compressedSize = archiveBuffer.readUInt32LE(offset + 20);
    const fileNameLength = archiveBuffer.readUInt16LE(offset + 28);
    const extraFieldLength = archiveBuffer.readUInt16LE(offset + 30);
    const fileCommentLength = archiveBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = archiveBuffer.readUInt32LE(offset + 42);
    const archivePath = archiveBuffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8");
    const normalizedPath = normalizeArchiveEntryPath(archivePath);

    if (normalizedPath) {
      entries.set(
        normalizedPath,
        extractZipEntryData(archiveBuffer, {
          compressedSize,
          compressionMethod,
          localHeaderOffset,
        }),
      );
    }

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries;
}

function findEndOfCentralDirectoryOffset(archiveBuffer) {
  const minimumOffset = Math.max(0, archiveBuffer.length - 65557);
  for (let offset = archiveBuffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archiveBuffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  return -1;
}

function normalizeArchiveEntryPath(archivePath) {
  const pathParts = String(archivePath || "").split("/");
  pathParts.shift();
  const entryPath = path.posix.normalize(pathParts.join("/"));
  if (!entryPath || entryPath === "." || entryPath.endsWith("/")) {
    return "";
  }

  if (path.posix.isAbsolute(entryPath) || entryPath.startsWith("../") || entryPath.includes("/../")) {
    return "";
  }

  return entryPath;
}

function extractZipEntryData(archiveBuffer, {
  compressedSize,
  compressionMethod,
  localHeaderOffset,
}) {
  if (archiveBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
    throw new Error("Release zip local file header is malformed.");
  }

  const fileNameLength = archiveBuffer.readUInt16LE(localHeaderOffset + 26);
  const extraFieldLength = archiveBuffer.readUInt16LE(localHeaderOffset + 28);
  const dataOffset = localHeaderOffset + 30 + fileNameLength + extraFieldLength;
  const compressedData = archiveBuffer.subarray(dataOffset, dataOffset + compressedSize);

  if (compressionMethod === 0) {
    return Buffer.from(compressedData);
  }

  if (compressionMethod === 8) {
    return zlib.inflateRawSync(compressedData);
  }

  throw new Error(`Release zip used unsupported compression method ${compressionMethod}.`);
}

function hasArchiveFileChanged(repoRoot, archiveEntries, readFile, relativePath) {
  const archiveBuffer = archiveEntries.get(relativePath);
  if (!archiveBuffer) {
    return false;
  }

  try {
    const currentText = readFile(path.join(repoRoot, relativePath), "utf8");
    return currentText !== bufferToUtf8(archiveBuffer);
  } catch (_error) {
    return true;
  }
}

function writeZipEntries(repoRoot, archiveEntries, {
  mkdir,
  writeFile,
}) {
  for (const [relativePath, fileBuffer] of archiveEntries) {
    const targetPath = path.join(repoRoot, relativePath);
    const relativeTarget = path.relative(repoRoot, targetPath);
    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
      continue;
    }

    mkdir(path.dirname(targetPath), {
      recursive: true,
    });
    writeFile(targetPath, fileBuffer);
  }
}

function bufferToUtf8(value) {
  return Buffer.isBuffer(value) ? value.toString("utf8") : "";
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
  extractZipEntries,
  isAutoUpdateDisabled,
  readPackageVersion,
  runStartupAutoUpdate,
};
