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

const DISPLAYABLE_BASENAMES = new Set([
  'Makefile', 'Dockerfile', 'LICENSE', 'LICENCE', 'Rakefile', 'Gemfile',
  'Vagrantfile', '.gitignore', '.gitattributes', '.editorconfig',
  '.eslintrc', '.prettierrc', '.npmrc', '.env.example'
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

function isDisplayableFile(filePath) {
  if (isMarkdownPath(filePath)) {
    return true
  }
  const extension = path.extname(filePath).toLowerCase()
  if (TEXT_FALLBACK_EXTENSIONS.has(extension)) {
    return true
  }
  return DISPLAYABLE_BASENAMES.has(path.basename(filePath))
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

    if (kind === 'file' && !isDisplayableFile(entryRealPath)) {
      continue
    }

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

const FUZZY_SEPARATORS = new Set(['/', '\\', '-', '_', '.', ' '])

// Scoring constants aligned with fzf's FuzzyMatchV2 (src/algo/algo.go). The key
// invariant is SCORE_MATCH (16) >> BONUS_BOUNDARY (8): a consecutive run grows
// linearly at 16/char so it dominates scattered matches that merely collect many
// boundary bonuses across long directory paths. The earlier model used base 1,
// which let boundary bonuses dominate and ranked scattered hits above consecutive
// filename hits.
const SCORE_MATCH = 16
const BONUS_CONSECUTIVE = 4
const BONUS_BOUNDARY = 8
const FIRST_CHAR_MULTIPLIER = 2
const GAP_START = -3
const GAP_EXTENSION = -1

// fzf-style subsequence fuzzy match with scoring.
// Returns null when `query` is not a subsequence of `target`.
// On match returns { score, positions } where positions are indices into `target`.
// Smart-case: an all-lowercase query matches case-insensitively; a query containing
// any uppercase letter matches case-sensitively.
function fuzzyMatch(query, target) {
  const q = String(query == null ? '' : query)
  const t = String(target == null ? '' : target)

  if (q.length === 0) {
    return { score: 0, positions: [] }
  }

  const caseSensitive = /[A-Z]/.test(q)
  const haystack = caseSensitive ? t : t.toLowerCase()
  const needle = caseSensitive ? q : q.toLowerCase()

  const positions = []
  let score = 0
  let prevMatchIndex = -1
  let searchFrom = 0

  for (let qi = 0; qi < needle.length; qi += 1) {
    const ch = needle[qi]
    const foundAt = haystack.indexOf(ch, searchFrom)
    if (foundAt === -1) {
      return null
    }

    // base score for a matched character
    score += SCORE_MATCH

    // consecutive bonus: this match immediately follows the previous match
    if (prevMatchIndex !== -1 && foundAt === prevMatchIndex + 1) {
      score += BONUS_CONSECUTIVE
    }

    // boundary bonus: start of target, after a separator, or camelCase boundary.
    // The first matched character's boundary bonus is doubled — the leading
    // character of the typed pattern carries more positional significance (fzf
    // bonusFirstCharMultiplier).
    const isStart = foundAt === 0
    const prevChar = foundAt > 0 ? t[foundAt - 1] : ''
    const afterSeparator = FUZZY_SEPARATORS.has(prevChar)
    const camelBoundary =
      foundAt > 0 &&
      prevChar === prevChar.toLowerCase() &&
      prevChar !== prevChar.toUpperCase() &&
      t[foundAt] === t[foundAt].toUpperCase() &&
      t[foundAt] !== t[foundAt].toLowerCase()
    if (isStart || afterSeparator || camelBoundary) {
      score += qi === 0 ? BONUS_BOUNDARY * FIRST_CHAR_MULTIPLIER : BONUS_BOUNDARY
    }

    // gap penalty: characters skipped since the previous match (or since start
    // for the first matched character). A gap costs GAP_START up front plus
    // GAP_EXTENSION per extra skipped char, with NO cap, so a match buried far
    // behind a long directory prefix is penalised in proportion to that distance.
    const gap = prevMatchIndex === -1 ? foundAt : foundAt - prevMatchIndex - 1
    if (gap > 0) {
      score += GAP_START + (gap - 1) * GAP_EXTENSION
    }

    positions.push(foundAt)
    prevMatchIndex = foundAt
    searchFrom = foundAt + 1
  }

  return { score, positions }
}

async function searchBrowseFiles(rootDir, requestPath = '.', query = '') {
  const resolved = resolveBrowseTarget(rootDir, requestPath)
  const stat = await fs.promises.stat(resolved.realPath)
  if (!stat.isDirectory()) {
    throw createBrowseError(400, 'not_directory', 'browse search target must be a directory')
  }

  const normalizedQuery = String(query || '').trim()
  if (!normalizedQuery) {
    return {
      rootPath: resolved.rootRealPath,
      relativePath: toDisplayRelativePath(resolved.relativePath),
      entries: []
    }
  }

  const entries = []
  const visitedDirectories = new Set([resolved.realPath])

  async function walk(directoryRealPath, directoryRelativePath) {
    const directoryEntries = await fs.promises.readdir(directoryRealPath, { withFileTypes: true })

    for (const entry of directoryEntries) {
      const entryRelativePath = directoryRelativePath ? `${directoryRelativePath}/${entry.name}` : entry.name
      const entryAbsolutePath = path.join(directoryRealPath, entry.name)
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

      if (outsideRoot) {
        continue
      }

      if (entryStat.isDirectory()) {
        if (isIgnoredBrowseDirectory(entryRelativePath, entry.name)) {
          continue
        }

        const directoryRealTarget = getRealPath(entryRealPath)
        if (!visitedDirectories.has(directoryRealTarget)) {
          visitedDirectories.add(directoryRealTarget)
          await walk(directoryRealTarget, entryRelativePath)
        }
        continue
      }

      if (!entryStat.isFile() || !isDisplayableFile(entryRealPath)) {
        continue
      }

      const match = fuzzyMatch(normalizedQuery, entryRelativePath)
      if (!match) {
        continue
      }

      // basename priority: whether the whole query is also a subsequence of the
      // file name itself. This is the PRIMARY sort key — every filename match
      // ranks above every non-filename match, regardless of path score, so a long
      // path that merely collects many boundary bonuses can never slip between
      // filename matches. score stays the pure relative-path score and
      // matchPositions stay indexed into relativePath, so front-end highlighting
      // is unchanged.
      const nameMatched = fuzzyMatch(normalizedQuery, entry.name) !== null

      entries.push({
        name: entry.name,
        relativePath: entryRelativePath,
        kind: 'file',
        isMarkdown: isMarkdownPath(entryRealPath),
        isSymlink,
        score: match.score,
        nameMatched,
        matchPositions: match.positions
      })
    }
  }

  await walk(resolved.realPath, resolved.relativePath)

  entries.sort((left, right) => {
    // primary: filename matches before non-filename matches (absolute priority)
    if (left.nameMatched !== right.nameMatched) {
      return left.nameMatched ? -1 : 1
    }
    // secondary: higher path score first
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return left.relativePath.localeCompare(right.relativePath)
  })

  // nameMatched is an internal ranking key; drop it so the response shape is
  // unchanged for the front-end.
  for (const entry of entries) {
    delete entry.nameMatched
  }

  return {
    rootPath: resolved.rootRealPath,
    relativePath: toDisplayRelativePath(resolved.relativePath),
    entries
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
  fuzzyMatch,
  isDisplayableFile,
  isIgnoredBrowseDirectory,
  isMarkdownPath,
  listBrowseDirectory,
  normalizeRelativeRequestPath,
  readBrowseFile,
  resolveBrowseTarget,
  searchBrowseFiles
}
