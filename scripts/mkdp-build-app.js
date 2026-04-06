#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { writeRuntimeAssetManifest } = require("../app/runtime-asset-layout");

const repoRoot = path.resolve(__dirname, "..");
const appDir = path.resolve(__dirname, "..", "app");
const distDir = path.join(repoRoot, "dist");
const distWebDir = path.join(distDir, "web");
const distStaticDir = path.join(distDir, "static");
const nextBin = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);

function shouldUseLegacyOpenSsl() {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  return Number.isFinite(major) && major >= 17;
}

function createEnv() {
  const env = { ...process.env };
  const current = env.NODE_OPTIONS || "";

  if (
    shouldUseLegacyOpenSsl() &&
    !current.includes("--openssl-legacy-provider")
  ) {
    env.NODE_OPTIONS = current
      ? `${current} --openssl-legacy-provider`
      : "--openssl-legacy-provider";
  }

  return env;
}

function runNext(command, env) {
  const result = spawnSync(process.execPath, [nextBin, command], {
    cwd: appDir,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function ensureEmptyDir(dirPath) {
  fs.rmSync(dirPath, {
    recursive: true,
    force: true
  })
  fs.mkdirSync(dirPath, {
    recursive: true
  })
}

function copyTree(sourceDir, targetDir) {
  const entries = fs.readdirSync(sourceDir, {
    withFileTypes: true
  })

  fs.mkdirSync(targetDir, {
    recursive: true
  })

  entries.forEach((entry) => {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)

    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath)
      return
    }

    fs.copyFileSync(sourcePath, targetPath)
  })
}

function syncRuntimeAssets() {
  ensureEmptyDir(distWebDir)
  ensureEmptyDir(distStaticDir)

  copyTree(path.join(appDir, 'out'), distWebDir)
  copyTree(path.join(appDir, '_static'), distStaticDir)

  const generatedAt = new Date().toISOString()
  const runtimeManifest = {
    version: 1,
    web: {
      htmlRoot: '../dist/web',
      staticRoot: '../dist/static',
      indexHtml: '../dist/web/index.html',
      notFoundHtml: '../dist/web/404.html'
    }
  }

  fs.writeFileSync(path.join(distDir, 'asset-manifest.json'), `${JSON.stringify({
    version: 1,
    generatedAt,
    webRoot: 'web',
    staticRoot: 'static',
    indexHtml: 'web/index.html',
    notFoundHtml: 'web/404.html'
  }, null, 2)}\n`, 'utf8')

  writeRuntimeAssetManifest(appDir, runtimeManifest)
}

function main() {
  fs.rmSync(path.join(appDir, ".next"), {
    recursive: true,
    force: true,
  });

  const env = createEnv();
  runNext("build", env);
  runNext("export", env);
  syncRuntimeAssets();
}

main();
