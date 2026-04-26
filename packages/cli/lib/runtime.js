const fs = require('fs')
const path = require('path')

const { startStandalonePreviewServer } = require('./server')

const COMMON_OPTION_HELP = [
  '  --config <path>              JSON config file',
  '  --theme <light|dark>         Theme mode',
  '  --page-title <template>      Page title template',
  '  --markdown-css <path>        Override markdown.css',
  '  --highlight-css <path>       Override highlight.css',
  '  --images-path <path>         Base path for local images'
]

function readStream(stream) {
  return new Promise((resolve, reject) => {
    let data = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      data += chunk
    })
    stream.on('end', () => resolve(data))
    stream.on('error', reject)
  })
}

function resolvePathMaybe(filePath) {
  if (!filePath) {
    return ''
  }
  return path.resolve(filePath)
}

async function loadConfig(configPath) {
  if (!configPath) {
    return {}
  }

  const absolutePath = path.resolve(configPath)
  const content = await fs.promises.readFile(absolutePath, 'utf8')
  return JSON.parse(content)
}

function mergeConfig(cliConfig, fileConfig) {
  return {
    theme: cliConfig.theme || fileConfig.theme || 'light',
    pageTitle: cliConfig.pageTitle || fileConfig.pageTitle || '「${name}」',
    markdownCss: resolvePathMaybe(cliConfig.markdownCss || fileConfig.markdownCss || ''),
    highlightCss: resolvePathMaybe(cliConfig.highlightCss || fileConfig.highlightCss || ''),
    imagesPath: resolvePathMaybe(cliConfig.imagesPath || fileConfig.imagesPath || ''),
    previewOptions: fileConfig.previewOptions || {}
  }
}

async function createStandalonePreviewSession(cliConfig = {}, runtimeOptions = {}) {
  const defaultInput = runtimeOptions.defaultInput || ''
  const inputPath = cliConfig.input || defaultInput || '-'
  const fromStdin = inputPath === '-'

  if (fromStdin && process.stdin.isTTY) {
    throw new Error('stdin is empty, pass a markdown file path or pipe markdown content in')
  }

  const fileConfig = await loadConfig(cliConfig.config || '')
  const merged = mergeConfig(cliConfig, fileConfig)
  const absoluteInput = fromStdin ? '' : path.resolve(inputPath)
  const markdown = fromStdin
    ? await readStream(process.stdin)
    : await fs.promises.readFile(absoluteInput, 'utf8')
  const sourceDir = fromStdin ? process.cwd() : path.dirname(absoluteInput)
  const sourceName = fromStdin ? 'markdown-preview' : path.basename(absoluteInput)

  const server = await startStandalonePreviewServer({
    cwd: process.cwd(),
    fileDir: sourceDir,
    imagesPath: merged.imagesPath,
    markdownCss: merged.markdownCss,
    highlightCss: merged.highlightCss,
    pageTitle: merged.pageTitle,
    previewOptions: merged.previewOptions,
    theme: merged.theme,
    name: sourceName,
    contentLines: markdown.split(/\r?\n/)
  })

  return {
    inputPath,
    absoluteInput,
    markdown,
    merged,
    origin: server.origin,
    close: () => server.close()
  }
}

async function createStandaloneBrowseSession(cliConfig = {}, runtimeOptions = {}) {
  const fileConfig = await loadConfig(cliConfig.config || '')
  const merged = mergeConfig(cliConfig, fileConfig)
  const defaultRoot = runtimeOptions.defaultRoot || process.cwd()
  const browseRoot = path.resolve(cliConfig.root || defaultRoot)
  const name = path.basename(browseRoot) || 'markdown-preview'

  const server = await startStandalonePreviewServer({
    cwd: process.cwd(),
    fileDir: browseRoot,
    imagesPath: merged.imagesPath,
    markdownCss: merged.markdownCss,
    highlightCss: merged.highlightCss,
    pageTitle: merged.pageTitle,
    previewOptions: merged.previewOptions,
    theme: merged.theme,
    name,
    browseRoot,
    contentLines: [
      '# Browse mode',
      '',
      'Select a Markdown file from the left pane.'
    ]
  })

  return {
    browseRoot,
    merged,
    origin: server.origin,
    close: () => server.close()
  }
}

async function waitForPreviewReady(page, timeoutMs = 30000) {
  await page.waitForFunction(() => {
    const exportApi = window.__mkdpExport
    return exportApi && typeof exportApi.waitForPreviewReady === 'function'
  }, undefined, {
    timeout: Math.min(timeoutMs, 10000)
  })

  await page.evaluate((timeout) => {
    return window.__mkdpExport.waitForPreviewReady(timeout)
  }, timeoutMs)
}

async function openStandalonePreviewPage(page, origin, options = {}) {
  const timeout = options.timeout || 30000
  const targetUrl = `${origin}/page/1`

  await page.goto(targetUrl, {
    waitUntil: 'networkidle',
    timeout
  })

  await waitForPreviewReady(page, timeout)
  return targetUrl
}

module.exports = {
  COMMON_OPTION_HELP,
  createStandaloneBrowseSession,
  createStandalonePreviewSession,
  loadConfig,
  mergeConfig,
  openStandalonePreviewPage,
  readStream,
  resolvePathMaybe,
  waitForPreviewReady
}
