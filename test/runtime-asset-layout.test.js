const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  resolveRuntimeAssetLayout,
  writeRuntimeAssetManifest,
} = require("../app/runtime-asset-layout");

function ensureFile(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function testRepoLayout() {
  const appRoot = path.resolve(__dirname, "..", "app");
  const layout = resolveRuntimeAssetLayout({
    appRoot,
    execPath: path.join(appRoot, "bin", "markdown-preview-linux"),
  });

  assert.strictEqual(layout.appRoot, appRoot);
  assert.strictEqual(
    path.basename(layout.manifestPath),
    "runtime-asset-manifest.json"
  );
  assert.ok(
    fs.existsSync(layout.indexHtml),
    "repo index.html should resolve from manifest"
  );
  assert.ok(
    fs.existsSync(layout.notFoundHtml),
    "repo 404.html should resolve from manifest"
  );
  assert.ok(
    fs.existsSync(layout.staticRoot),
    "repo _static root should resolve from manifest"
  );
}

function testPrebuiltLikeLayout() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mkdp-layout-"));
  const appRoot = path.join(tempRoot, "app");
  const distRoot = path.join(tempRoot, "dist");
  const execPath = path.join(appRoot, "bin", "markdown-preview-linux");

  try {
    ensureFile(execPath);
    ensureFile(path.join(distRoot, "web", "index.html"), "<html></html>");
    ensureFile(path.join(distRoot, "web", "404.html"), "<html>404</html>");
    ensureFile(path.join(distRoot, "static", "page.css"), "body {}");
    writeRuntimeAssetManifest(appRoot, {
      version: 1,
      web: {
        htmlRoot: "../dist/web",
        staticRoot: "../dist/static",
        indexHtml: "../dist/web/index.html",
        notFoundHtml: "../dist/web/404.html",
      },
    });

    const layout = resolveRuntimeAssetLayout({
      execPath,
      cwd: tempRoot,
      appDir: path.join(tempRoot, "ignored-app-dir"),
    });

    assert.strictEqual(layout.appRoot, appRoot);
    assert.strictEqual(
      layout.indexHtml,
      path.join(distRoot, "web", "index.html")
    );
    assert.strictEqual(
      layout.notFoundHtml,
      path.join(distRoot, "web", "404.html")
    );
    assert.strictEqual(layout.staticRoot, path.join(distRoot, "static"));
  } finally {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
    });
  }
}

function testMissingRuntimeAssetsError() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mkdp-layout-"));
  const appRoot = path.join(tempRoot, "app");

  try {
    fs.mkdirSync(appRoot, { recursive: true });
    writeRuntimeAssetManifest(appRoot, {
      version: 1,
      web: {
        htmlRoot: "../dist/web",
        staticRoot: "../dist/static",
        indexHtml: "../dist/web/index.html",
        notFoundHtml: "../dist/web/404.html",
      },
    });

    assert.throws(
      () =>
        resolveRuntimeAssetLayout({
          appRoot,
          cwd: tempRoot,
        }),
      /runtime web assets are missing.*yarn build-app/s
    );
  } finally {
    fs.rmSync(tempRoot, {
      recursive: true,
      force: true,
    });
  }
}

function main() {
  testRepoLayout();
  testPrebuiltLikeLayout();
  testMissingRuntimeAssetsError();
  process.stdout.write("runtime asset layout tests: ok\n");
}

main();
