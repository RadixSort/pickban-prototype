const path = require("node:path");
const {
  runStartupAutoUpdate,
} = require("./lib/startup-auto-update.js");

(async () => {
  await runStartupAutoUpdate({
    cwd: path.resolve(__dirname),
    logger: console,
  });

  require("./server.js");
})().catch((error) => {
  console.error(`PickBan startup failed: ${error.message || "unexpected error"}.`);
  process.exit(1);
});
