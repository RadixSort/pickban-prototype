const path = require("node:path");
const {
  runStartupAutoUpdate,
} = require("./lib/startup-auto-update.js");

runStartupAutoUpdate({
  cwd: path.resolve(__dirname),
  logger: console,
});

require("./server.js");
