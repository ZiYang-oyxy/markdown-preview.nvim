const fs = require("fs");
const path = require("path");

const MANIFEST_NAME = "runtime-asset-manifest.json";
const DEFAULT_MANIFEST = Object.freeze({
  version: 1,
  web: {
    htmlRoot: "out",
    staticRoot: "_static",
    indexHtml: "out/index.html",
    notFoundHtml: "out/404.html",
  },
});

function buildLegacyLayout(appRoot) {
  return {
    appRoot,
    manifestPath: path.join(appRoot, MANIFEST_NAME),
    htmlRoot: path.join(appRoot, DEFAULT_MANIFEST.web.htmlRoot),
    staticRoot: path.join(appRoot, DEFAULT_MANIFEST.web.staticRoot),
    indexHtml: path.join(appRoot, DEFAULT_MANIFEST.web.indexHtml),
    notFoundHtml: path.join(appRoot, DEFAULT_MANIFEST.web.notFoundHtml),
  };
}

function uniquePaths(values) {
  const seen = new Set();
  return values
    .filter((value) => {
      if (!value) {
        return false;
      }

      const resolved = path.resolve(value);
      if (seen.has(resolved)) {
        return false;
      }

      seen.add(resolved);
      return true;
    })
    .map((value) => path.resolve(value));
}

function resolveCandidateAppRoots(options = {}) {
  const legacySnapshotRoot = options.execPath
    ? options.execPath.replace(/(markdown-preview\.nvim.*?app).+?$/, "$1")
    : "";

  return uniquePaths([
    options.appRoot,
    process.env.MKDP_APP_ROOT,
    options.appDir,
    options.execPath ? path.resolve(path.dirname(options.execPath), "..") : "",
    legacySnapshotRoot,
    options.cwd,
  ]);
}

function readManifest(manifestPath) {
  const raw = fs.readFileSync(manifestPath, "utf8");
  return JSON.parse(raw);
}

function buildLayout(appRoot, manifestPath, manifest) {
  const web = manifest.web || {};
  const manifestDir = path.dirname(manifestPath);
  const resolveFromManifest = (relativePath, fallbackPath) =>
    path.resolve(manifestDir, relativePath || fallbackPath);

  return {
    appRoot,
    manifestPath,
    htmlRoot: resolveFromManifest(web.htmlRoot, DEFAULT_MANIFEST.web.htmlRoot),
    staticRoot: resolveFromManifest(
      web.staticRoot,
      DEFAULT_MANIFEST.web.staticRoot
    ),
    indexHtml: resolveFromManifest(
      web.indexHtml,
      DEFAULT_MANIFEST.web.indexHtml
    ),
    notFoundHtml: resolveFromManifest(
      web.notFoundHtml,
      DEFAULT_MANIFEST.web.notFoundHtml
    ),
  };
}

function isUsableLayout(layout) {
  return [
    layout.htmlRoot,
    layout.staticRoot,
    layout.indexHtml,
    layout.notFoundHtml,
  ].every((filePath) => fs.existsSync(filePath));
}

function formatMissingAssetsError(layout) {
  const missing = [
    layout.htmlRoot,
    layout.staticRoot,
    layout.indexHtml,
    layout.notFoundHtml,
  ].filter((filePath) => !fs.existsSync(filePath));

  return [
    "markdown-preview runtime web assets are missing.",
    `Checked manifest: ${layout.manifestPath}`,
    `Missing: ${missing.join(", ")}`,
    "Build them with: yarn install && yarn build-app",
    "Or use the prebuilt runtime installer when release assets are available: call mkdp#util#install()",
  ].join("\n");
}

function resolveRuntimeAssetLayout(options = {}) {
  const manifestName = options.manifestName || MANIFEST_NAME;
  const candidates = resolveCandidateAppRoots({
    appRoot: options.appRoot,
    appDir: options.appDir,
    cwd: options.cwd || process.cwd(),
    execPath: options.execPath || process.execPath,
  });

  let fallback = null;

  for (const appRoot of candidates) {
    const manifestPath = path.join(appRoot, manifestName);
    if (fs.existsSync(manifestPath)) {
      const layout = buildLayout(appRoot, manifestPath, readManifest(manifestPath));

      if (!fallback) {
        fallback = layout;
      }

      if (isUsableLayout(layout)) {
        return layout;
      }
    }

    const legacyLayout = buildLegacyLayout(appRoot);
    if (!fallback) {
      fallback = legacyLayout;
    }
    if (isUsableLayout(legacyLayout)) {
      return legacyLayout;
    }
  }

  if (fallback) {
    throw new Error(formatMissingAssetsError(fallback));
  }

  throw new Error("unable to resolve markdown-preview runtime asset layout");
}

function writeRuntimeAssetManifest(appRoot, manifest = DEFAULT_MANIFEST) {
  const manifestPath = path.join(appRoot, MANIFEST_NAME);
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );
  return manifestPath;
}

module.exports = {
  DEFAULT_MANIFEST,
  MANIFEST_NAME,
  formatMissingAssetsError,
  resolveRuntimeAssetLayout,
  writeRuntimeAssetManifest,
};
