const assert = require('assert')
const childProcess = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const cliRoot = path.join(repoRoot, 'packages', 'cli')

function ensureFile(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf8')
}

function runNode(args, options = {}) {
  return childProcess.spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options
  })
}

function testPackageMetadata() {
  const packageJson = require(path.join(cliRoot, 'package.json'))

  assert.strictEqual(packageJson.name, '@ziyang-oyxy/markdown-preview-toolbox')
  assert.deepStrictEqual(packageJson.bin, { mkdp: './bin/mkdp.js' })
  assert.deepStrictEqual(packageJson.files, ['bin/', 'lib/', 'assets/'])
  assert.strictEqual(packageJson.dependencies['socket.io'], '~2.4.0')
  assert.strictEqual(packageJson.peerDependencies.playwright, '>=1.30.0')
  assert.strictEqual(packageJson.peerDependenciesMeta.playwright.optional, true)
}

function testCliHelpAndVersion() {
  const binPath = path.join(cliRoot, 'bin', 'mkdp.js')
  const packageJson = require(path.join(cliRoot, 'package.json'))

  const help = runNode([binPath, '--help'])
  assert.strictEqual(help.status, 0, help.stderr)
  assert.match(help.stdout, /Usage: mkdp <command> \[options\]/)
  assert.match(help.stdout, /preview \[file\|-\]/)
  assert.match(help.stdout, /export \[file\|-\]/)
  assert.match(help.stdout, /browse \[dir\]/)

  const version = runNode([binPath, '--version'])
  assert.strictEqual(version.status, 0, version.stderr)
  assert.strictEqual(version.stdout.trim(), packageJson.version)

  const missingCommand = runNode([binPath])
  assert.strictEqual(missingCommand.status, 1)
  assert.match(missingCommand.stderr, /Usage: mkdp <command> \[options\]/)
}

function testPreviewRequiresExplicitInput() {
  const binPath = path.join(cliRoot, 'bin', 'mkdp.js')
  const result = runNode([binPath, 'preview'])

  assert.strictEqual(result.status, 1)
  assert.match(result.stderr, /Usage: mkdp preview \[file\|-\] \[options\]/)
}

function testAssetLayoutResolvesPackageAssets() {
  const { resolveAssetLayout } = require(path.join(cliRoot, 'lib', 'asset-layout'))
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mkdp-cli-assets-'))
  const assetRoot = path.join(tempRoot, 'assets')

  try {
    ensureFile(path.join(assetRoot, 'web', 'index.html'), '<html></html>')
    ensureFile(path.join(assetRoot, 'web', '404.html'), '<html>404</html>')
    ensureFile(path.join(assetRoot, 'static', 'page.css'), 'body {}')
    ensureFile(path.join(assetRoot, 'runtime-asset-manifest.json'), `${JSON.stringify({
      version: 1,
      web: {
        htmlRoot: 'web',
        staticRoot: 'static',
        indexHtml: 'web/index.html',
        notFoundHtml: 'web/404.html'
      }
    })}\n`)

    const layout = resolveAssetLayout({ packageRoot: tempRoot })
    assert.strictEqual(layout.htmlRoot, path.join(assetRoot, 'web'))
    assert.strictEqual(layout.staticRoot, path.join(assetRoot, 'static'))
    assert.strictEqual(layout.indexHtml, path.join(assetRoot, 'web', 'index.html'))
    assert.strictEqual(layout.notFoundHtml, path.join(assetRoot, 'web', '404.html'))
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function testBuildCliPackageCopiesAssets() {
  const { syncCliPackageAssets } = require(path.join(repoRoot, 'scripts', 'mkdp-build-cli-package'))
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mkdp-cli-build-'))
  const distDir = path.join(tempRoot, 'dist')
  const packageRoot = path.join(tempRoot, 'packages', 'cli')

  try {
    ensureFile(path.join(distDir, 'web', 'index.html'), '<html>index</html>')
    ensureFile(path.join(distDir, 'web', '404.html'), '<html>missing</html>')
    ensureFile(path.join(distDir, 'static', 'page.css'), 'body {}')
    ensureFile(path.join(packageRoot, 'assets', 'web', 'old.html'), 'old')
    ensureFile(path.join(packageRoot, 'assets', 'static', 'old.css'), 'old')

    syncCliPackageAssets({ distDir, packageRoot })

    assert.strictEqual(
      fs.readFileSync(path.join(packageRoot, 'assets', 'web', 'index.html'), 'utf8'),
      '<html>index</html>'
    )
    assert.strictEqual(
      fs.readFileSync(path.join(packageRoot, 'assets', 'static', 'page.css'), 'utf8'),
      'body {}'
    )
    assert.strictEqual(fs.existsSync(path.join(packageRoot, 'assets', 'web', 'old.html')), false)
    assert.strictEqual(fs.existsSync(path.join(packageRoot, 'assets', 'static', 'old.css')), false)
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true })
  }
}

function main() {
  testPackageMetadata()
  testCliHelpAndVersion()
  testPreviewRequiresExplicitInput()
  testAssetLayoutResolvesPackageAssets()
  testBuildCliPackageCopiesAssets()
  process.stdout.write('cli package tests: ok\n')
}

main()
