const fs = require('fs')
const path = require('path')

const MARKDOWN_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.mdown',
  '.mkd',
  '.mkdn',
  '.mdx'
])

const TEXT_FALLBACK_EXTENSIONS = new Set([
  '.txt',
  '.text',
  '.log',
  '.json',
  '.jsonc',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.vim',
  '.lua',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.xml',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cc',
  '.cpp',
  '.h',
  '.hpp'
])

const DEFAULT_IGNORED_DIR_BASENAMES = new Set([
  '.git',
  '.next',
  '.omx',
  '.codex',
  'node_modules',
  'coverage'
])

const DEFAULT_IGNORED_RELATIVE_DIRS = new Set([
  'app/out',
  'dist/web'
])

const MAX_TEXT_PREVIEW_BYTES = 256 * 1024

function createBrowseError(statusCode, code, message) {
  const error = new Error(message)
  error.statusCode = statusCode
  error.code = code
  return error
}

function getRealPath(filePath) {
  if (fs.realpathSync.native) {
    return fs.realpathSync.native(filePath)
  }
  return fs.realpathSync(filePath)
}

function ensureInsideRoot(rootRealPath, candidatePath) {
  return candidatePath === rootRealPath || candidatePath.startsWith(`${rootRealPath}${path.sep}`)
}

function normalizeRelativeRequestPath(requestPath = '.') {
  const rawValue = requestPath === undefined || requestPath === null ? '.' : String(requestPath)
  const decodedValue = decodeURIComponent(rawValue)

  if (decodedValue.includes('\0')) {
    throw createBrowseError(400, 'invalid_path', 'browse path contains invalid characters')
  }

  const normalized = path.posix.normalize(decodedValue.replace(/^\/+/, '') || '.')
  if (normalized === '..' || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) {
    throw createBrowseError(403, 'outside_root', 'browse path escapes the configured root')
  }

  return normalized === '.' ? '' : normalized
}

function toPlatformRelativePath(relativePath) {
  if (!relativePath) {
    return ''
  }
  return relativePath.split('/').join(path.sep)
}

function resolveBrowseTarget(rootDir, requestPath = '.') {
  if (!rootDir) {
    throw createBrowseError(404, 'browse_disabled', 'browse mode is not enabled')
  }

  const rootRealPath = getRealPath(path.resolve(rootDir))
  const relativePath = normalizeRelativeRequestPath(requestPath)
  const absolutePath = path.resolve(rootRealPath, toPlatformRelativePath(relativePath))

  if (!ensureInsideRoot(rootRealPath, absolutePath)) {
    throw createBrowseError(403, 'outside_root', 'browse path escapes the configured root')
  }

  if (!fs.existsSync(absolutePath)) {
    throw createBrowseError(404, 'not_found', 'browse target does not exist')
  }

  const realPath = getRealPath(absolutePath)
  if (!ensureInsideRoot(rootRealPath, realPath)) {
    throw createBrowseError(403, 'outside_root', 'browse target resolves outside the configured root')
  }

  return {
    rootRealPath,
    relativePath,
    absolutePath,
    realPath
  }
}

function isMarkdownPath(filePath) {
  return MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

function isIgnoredBrowseDirectory(relativePath, name) {
  if (DEFAULT_IGNORED_DIR_BASENAMES.has(name)) {
    return true
  }

  return DEFAULT_IGNORED_RELATIVE_DIRS.has(relativePath.replace(/\\/g, '/'))
}

function detectTextFallback(filePath, buffer) {
  const extension = path.extname(filePath).toLowerCase()
  if (TEXT_FALLBACK_EXTENSIONS.has(extension)) {
    return true
  }

  if (buffer.includes(0)) {
    return false
  }

  const decoded = buffer.toString('utf8')
  return !decoded.includes('\u0000')
}

function getDownloadContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.json') {
    return 'application/json; charset=utf-8'
  }
  if (TEXT_FALLBACK_EXTENSIONS.has(extension) || isMarkdownPath(filePath)) {
    return 'text/plain; charset=utf-8'
  }
  return 'application/octet-stream'
}

function toDisplayRelativePath(relativePath) {
  return relativePath || '.'
}

async function listBrowseDirectory(rootDir, requestPath = '.') {
  const resolved = resolveBrowseTarget(rootDir, requestPath)
  const stat = await fs.promises.stat(resolved.realPath)
  if (!stat.isDirectory()) {
    throw createBrowseError(400, 'not_directory', 'browse tree target must be a directory')
  }

  const entries = await fs.promises.readdir(resolved.realPath, { withFileTypes: true })
  const visibleEntries = []

  for (const entry of entries) {
    const entryRelativePath = resolved.relativePath ? `${resolved.relativePath}/${entry.name}` : entry.name
    const entryAbsolutePath = path.join(resolved.realPath, entry.name)
    const entryLstat = await fs.promises.lstat(entryAbsolutePath)
    const isSymlink = entryLstat.isSymbolicLink()
    let entryRealPath = entryAbsolutePath
    let outsideRoot = false
    let entryStat = entryLstat

    if (isSymlink) {
      try {
        entryRealPath = getRealPath(entryAbsolutePath)
        outsideRoot = !ensureInsideRoot(resolved.rootRealPath, entryRealPath)
        if (!outsideRoot) {
          entryStat = await fs.promises.stat(entryRealPath)
        }
      } catch (error) {
        outsideRoot = true
      }
    }

    if (!outsideRoot && entryStat.isDirectory() && isIgnoredBrowseDirectory(entryRelativePath, entry.name)) {
      continue
    }

    if (outsideRoot) {
      visibleEntries.push({
        name: entry.name,
        relativePath: entryRelativePath,
        kind: 'blocked',
        blocked: true,
        reason: 'outside-root',
        isSymlink: true
      })
      continue
    }

    const kind = entryStat.isDirectory() ? 'directory' : 'file'
    visibleEntries.push({
      name: entry.name,
      relativePath: entryRelativePath,
      kind,
      isMarkdown: kind === 'file' && isMarkdownPath(entryRealPath),
      isSymlink
    })
  }

  visibleEntries.sort((left, right) => {
    const kindOrder = {
      directory: 0,
      blocked: 1,
      file: 2
    }

    const leftOrder = kindOrder[left.kind] ?? 99
    const rightOrder = kindOrder[right.kind] ?? 99
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }
    return left.name.localeCompare(right.name)
  })

  return {
    rootPath: resolved.rootRealPath,
    relativePath: toDisplayRelativePath(resolved.relativePath),
    entries: visibleEntries
  }
}

async function readBrowseFile(rootDir, requestPath) {
  const resolved = resolveBrowseTarget(rootDir, requestPath)
  const stat = await fs.promises.stat(resolved.realPath)
  if (!stat.isFile()) {
    throw createBrowseError(400, 'not_file', 'browse file target must be a file')
  }

  const name = path.basename(resolved.realPath)
  const relativePath = toDisplayRelativePath(resolved.relativePath)

  if (isMarkdownPath(resolved.realPath)) {
    const markdown = await fs.promises.readFile(resolved.realPath, 'utf8')
    return {
      kind: 'markdown',
      name,
      relativePath,
      contentLines: markdown.split(/\r?\n/)
    }
  }

  if (stat.size > MAX_TEXT_PREVIEW_BYTES) {
    return {
      kind: 'fallback',
      fallback: 'download',
      name,
      relativePath,
      size: stat.size,
      contentType: getDownloadContentType(resolved.realPath)
    }
  }

  const buffer = await fs.promises.readFile(resolved.realPath)
  if (detectTextFallback(resolved.realPath, buffer)) {
    return {
      kind: 'fallback',
      fallback: 'text',
      name,
      relativePath,
      contentType: 'text/plain; charset=utf-8',
      text: buffer.toString('utf8')
    }
  }

  return {
    kind: 'fallback',
    fallback: 'download',
    name,
    relativePath,
    size: stat.size,
    contentType: getDownloadContentType(resolved.realPath)
  }
}

module.exports = {
  DEFAULT_IGNORED_DIR_BASENAMES,
  DEFAULT_IGNORED_RELATIVE_DIRS,
  createBrowseError,
  isIgnoredBrowseDirectory,
  isMarkdownPath,
  listBrowseDirectory,
  normalizeRelativeRequestPath,
  readBrowseFile,
  resolveBrowseTarget
}
