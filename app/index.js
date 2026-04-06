const { resolveRuntimeAssetLayout } = require("./runtime-asset-layout");

const assetLayout = resolveRuntimeAssetLayout({
  appDir: __dirname,
});

process.chdir(assetLayout.appRoot);

require("./lib/app");
