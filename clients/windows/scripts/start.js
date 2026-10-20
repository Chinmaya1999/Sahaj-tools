// Starts the desktop app for development. Some IDE terminals set ELECTRON_RUN_AS_NODE, which would make Electron behave like plain Node.
const { spawn } = require("node:child_process");
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(require("electron"), ["."], { stdio: "inherit", env, cwd: require("node:path").join(__dirname, "..") });
child.on("exit", (code) => process.exit(code ?? 0));
