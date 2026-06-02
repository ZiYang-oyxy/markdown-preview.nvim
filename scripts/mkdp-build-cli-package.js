#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

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

function requireDirectory(dirPath, label) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    throw new Error(`${label} does not exist: ${dirPath}`)
  }
}

function syncCliPackageAssets(options = {}) {
  const repoRoot = options.repoRoot || path.resolve(__dirname, '..')
  const distDir = options.distDir || path.join(repoRoot, 'dist')
  const packageRoot = options.packageRoot || path.join(repoRoot, 'packages', 'cli')
  const sourceWebDir = path.join(distDir, 'web')
  const sourceStaticDir = path.join(distDir, 'static')
  const targetAssetDir = path.join(packageRoot, 'assets')
  const targetWebDir = path.join(targetAssetDir, 'web')
  const targetStaticDir = path.join(targetAssetDir, 'static')

  requireDirectory(sourceWebDir, 'dist web assets')
  requireDirectory(sourceStaticDir, 'dist static assets')

  ensureEmptyDir(targetWebDir)
  ensureEmptyDir(targetStaticDir)
  copyTree(sourceWebDir, targetWebDir)
  copyTree(sourceStaticDir, targetStaticDir)
}

function main() {
  syncCliPackageAssets()
}

module.exports = {
  copyTree,
  ensureEmptyDir,
  syncCliPackageAssets
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error.message || String(error)}\n`)
    process.exitCode = 1
  }
}
