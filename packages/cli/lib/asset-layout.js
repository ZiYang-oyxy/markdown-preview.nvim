const fs = require('fs')
const path = require('path')

const MANIFEST_NAME = 'runtime-asset-manifest.json'

function readManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    throw new Error(`unable to read markdown-preview toolbox asset manifest at ${manifestPath}: ${error.message || String(error)}`)
  }
}

function requireExistingPath(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`markdown-preview toolbox asset layout is missing ${label}: ${filePath}`)
  }
  return filePath
}

function resolveAssetLayout(options = {}) {
  const packageRoot = options.packageRoot || path.resolve(__dirname, '..')
  const assetRoot = path.join(packageRoot, 'assets')
  const manifestPath = path.join(assetRoot, MANIFEST_NAME)
  const manifest = readManifest(manifestPath)
  const web = manifest.web || {}
  const resolveFromAssets = (relativePath, label) => {
    if (!relativePath) {
      throw new Error(`markdown-preview toolbox asset manifest is missing web.${label}`)
    }
    return path.resolve(assetRoot, relativePath)
  }

  return {
    appRoot: packageRoot,
    manifestPath: requireExistingPath(manifestPath, 'manifest'),
    htmlRoot: requireExistingPath(resolveFromAssets(web.htmlRoot, 'htmlRoot'), 'html root'),
    staticRoot: requireExistingPath(resolveFromAssets(web.staticRoot, 'staticRoot'), 'static root'),
    indexHtml: requireExistingPath(resolveFromAssets(web.indexHtml, 'indexHtml'), 'index.html'),
    notFoundHtml: requireExistingPath(resolveFromAssets(web.notFoundHtml, 'notFoundHtml'), '404.html')
  }
}

module.exports = {
  MANIFEST_NAME,
  resolveAssetLayout
}
