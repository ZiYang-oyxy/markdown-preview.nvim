const assert = require("assert");

const {
  parseArgs,
  runBuildAndBrowse,
} = require("../scripts/mkdp-build-and-browse");

function createSpawnSync(statusByCommand = {}) {
  const calls = [];
  const spawnSync = (command, args, options) => {
    calls.push({ command, args, options });
    const key = args[0];
    return {
      status: Object.prototype.hasOwnProperty.call(statusByCommand, key)
        ? statusByCommand[key]
        : 0,
    };
  };
  spawnSync.calls = calls;
  return spawnSync;
}

function testParseDefaultRoot() {
  const parsed = parseArgs(["node", "script"]);
  assert.deepStrictEqual(parsed, {
    root: ".",
    help: false,
  });
}

function testParseCustomRoot() {
  const parsed = parseArgs(["node", "script", "/tmp/docs"]);
  assert.deepStrictEqual(parsed, {
    root: "/tmp/docs",
    help: false,
  });
}

function testRunsBuildThenBrowse() {
  const spawnSync = createSpawnSync();
  const status = runBuildAndBrowse({
    argv: ["node", "script", "/tmp/docs"],
    spawnSync,
    yarnCommand: "yarn",
  });

  assert.strictEqual(status, 0);
  assert.deepStrictEqual(
    spawnSync.calls.map((call) => call.args),
    [
      ["build-app"],
      ["browse", "--", "/tmp/docs"],
    ]
  );
  spawnSync.calls.forEach((call) => {
    assert.strictEqual(call.options.stdio, "inherit");
  });
}

function testStopsWhenBuildFails() {
  const spawnSync = createSpawnSync({ "build-app": 1 });
  const status = runBuildAndBrowse({
    argv: ["node", "script", "/tmp/docs"],
    spawnSync,
    yarnCommand: "yarn",
  });

  assert.strictEqual(status, 1);
  assert.strictEqual(spawnSync.calls.length, 1);
  assert.deepStrictEqual(spawnSync.calls[0].args, ["build-app"]);
}

function main() {
  testParseDefaultRoot();
  testParseCustomRoot();
  testRunsBuildThenBrowse();
  testStopsWhenBuildFails();
  process.stdout.write("build-and-browse tests: ok\n");
}

main();
