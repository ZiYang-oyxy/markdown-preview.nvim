#!/usr/bin/env node

const { spawnSync } = require("child_process");

function parseArgs(argv) {
  const args = argv.slice(2);

  if (args.includes("-h") || args.includes("--help")) {
    return {
      root: ".",
      help: true,
    };
  }

  return {
    root: args[0] || ".",
    help: false,
  };
}

function getYarnCommand(platform = process.platform) {
  return platform === "win32" ? "yarn.cmd" : "yarn";
}

function printUsage() {
  process.stderr.write(
    [
      "Usage: mkdp-build-and-browse [root]",
      "",
      "Build the latest preview runtime assets, then start browse mode.",
      "",
      "Arguments:",
      "  root                       Directory to browse. Defaults to current directory.",
      "",
      "Options:",
      "  -h, --help                 Show this help",
    ].join("\n") + "\n"
  );
}

function runYarnScript(command, args, options) {
  const result = options.spawnSync(options.yarnCommand, [command, ...args], {
    cwd: options.cwd,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return typeof result.status === "number" ? result.status : 1;
}

function runBuildAndBrowse(options = {}) {
  const argv = options.argv || process.argv;
  const parsed = parseArgs(argv);

  if (parsed.help) {
    printUsage();
    return 0;
  }

  const runOptions = {
    cwd: options.cwd || process.cwd(),
    spawnSync: options.spawnSync || spawnSync,
    yarnCommand: options.yarnCommand || getYarnCommand(),
  };

  const buildStatus = runYarnScript("build-app", [], runOptions);
  if (buildStatus !== 0) {
    return buildStatus;
  }

  return runYarnScript("browse", ["--", parsed.root], runOptions);
}

if (require.main === module) {
  try {
    process.exitCode = runBuildAndBrowse();
  } catch (error) {
    process.stderr.write(`${error.message || String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  getYarnCommand,
  parseArgs,
  runBuildAndBrowse,
};
