const { once } = require("node:events");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

async function getAvailablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;

  server.close();
  await once(server, "close");

  if (!Number.isInteger(port)) {
    throw new Error("Failed to reserve an available TCP port.");
  }

  return port;
}

function waitForStartup(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      finish(
        new Error(
          `Timed out waiting for server startup.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }, timeoutMs);

    const handleStdout = (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes("PickBan prototype running at")) {
        finish(null, { stdout, stderr });
      }
    };

    const handleStderr = (chunk) => {
      stderr += chunk.toString();
    };

    const handleExit = (code, signal) => {
      finish(
        new Error(
          `Server exited before startup completed (code=${code}, signal=${signal}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    };

    function finish(error, output = { stdout, stderr }) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      child.stdout.off("data", handleStdout);
      child.stderr.off("data", handleStderr);
      child.off("exit", handleExit);

      if (error) {
        reject(error);
        return;
      }

      resolve(output);
    }

    child.stdout.on("data", handleStdout);
    child.stderr.on("data", handleStderr);
    child.once("exit", handleExit);
  });
}

async function spawnServerProcess({
  cwd,
  port,
  env = {},
  script = "server.js",
  timeoutMs = 5000,
} = {}) {
  const child = spawn(process.execPath, [script], {
    cwd,
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await waitForStartup(child, timeoutMs);

  return child;
}

function stopServerProcess(childOrProcess, timeoutMs = 5000) {
  const child = childOrProcess?.child || childOrProcess;

  return new Promise((resolve, reject) => {
    if (!child || child.exitCode != null || child.signalCode != null) {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      if (child.exitCode == null && child.signalCode == null) {
        child.kill("SIGKILL");
      }
    }, timeoutMs);

    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      child.stdout?.destroy();
      child.stderr?.destroy();

      if (code !== 0 || signal !== null) {
        reject(new Error(`Unexpected shutdown state: code=${code}, signal=${signal}`));
        return;
      }

      resolve();
    });

    child.kill("SIGTERM");
  });
}

async function startServer(testContext, options = {}) {
  const port = Number.isInteger(options.port) ? options.port : await getAvailablePort();
  const child = spawn(process.execPath, [options.script || "server.js"], {
    cwd: options.cwd || path.resolve(__dirname, "../.."),
    env: {
      ...process.env,
      ...(options.env || {}),
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const {
    stdout,
    stderr,
  } = await waitForStartup(child, options.timeoutMs);

  if (typeof testContext?.after === "function") {
    testContext.after(() => stopServerProcess(child).catch(() => {}));
  }

  return {
    child,
    port,
    baseUrl: `http://localhost:${port}`,
    stdout,
    stderr,
  };
}

function stopServer(child, timeoutMs = 5000) {
  return stopServerProcess(child, timeoutMs);
}

module.exports = {
  getAvailablePort,
  startServer,
  spawnServerProcess,
  stopServer,
  stopServerProcess,
  waitForStartup,
};
