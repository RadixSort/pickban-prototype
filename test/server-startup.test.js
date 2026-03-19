const test = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");

function waitForStartup(child, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(
        new Error(
          `Timed out waiting for server startup.\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    }, timeoutMs);

    function finish(error, output = { stdout, stderr }) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }

      resolve(output);
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (stdout.includes("PickBan prototype running at")) {
        finish(null, { stdout, stderr });
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("exit", (code, signal) => {
      finish(
        new Error(
          `Server exited before startup completed (code=${code}, signal=${signal}).\nstdout:\n${stdout}\nstderr:\n${stderr}`,
        ),
      );
    });
  });
}

test("server.js starts cleanly and handles SIGTERM shutdown", async (t) => {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  t.after(() => {
    if (child.exitCode == null && child.signalCode == null) {
      child.kill("SIGKILL");
    }
  });

  const startupOutput = await waitForStartup(child);
  assert.match(startupOutput.stdout, /PickBan prototype running at/);

  const exitPromise = new Promise((resolve, reject) => {
    child.once("exit", (code, signal) => {
      if (code !== 0 || signal !== null) {
        reject(new Error(`Unexpected shutdown state: code=${code}, signal=${signal}`));
        return;
      }

      resolve();
    });
  });

  child.kill("SIGTERM");
  await exitPromise;
});
