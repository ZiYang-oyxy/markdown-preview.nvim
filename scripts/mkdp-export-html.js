#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const { startStandalonePreviewServer } = require('./lib/standalone-preview-server')

function printUsage() {
  process.stderr.write(
    [
      'Usage: mkdp-export-html [input|-] [options]',
      '',
      'Options:',
      '  -o, --output <path>          Output html path',
      '  --config <path>              JSON config file',
      '  --theme <light|dark>         Theme mode',
      '  --page-title <template>      Page title template',
      '  --markdown-css <path>        Override markdown.css',
      '  --highlight-css <path>       Override highlight.css',
      '  --images-path <path>         Base path for local images',
      '  -h, --help                   Show this help'
    ].join('\n') + '\n'
  )
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const parsed = {
    input: '',
    output: '',
    config: '',
    theme: '',
    pageTitle: '',
    markdownCss: '',
    highlightCss: '',
    imagesPath: ''
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '-h' || arg === '--help') {
      parsed.help = true
      continue
    }
    if (arg === '-o' || arg === '--output') {
      parsed.output = args[i + 1] || ''
      i += 1
      continue
    }
    if (arg === '--config') {
      parsed.config = args[i + 1] || ''
      i += 1
      continue
    }
    if (arg === '--theme') {
      parsed.theme = args[i + 1] || ''
      i += 1
      continue
    }
    if (arg === '--page-title') {
      parsed.pageTitle = args[i + 1] || ''
      i += 1
      continue
    }
    if (arg === '--markdown-css') {
      parsed.markdownCss = args[i + 1] || ''
      i += 1
      continue
    }
    if (arg === '--highlight-css') {
      parsed.highlightCss = args[i + 1] || ''
      i += 1
      continue
    }
    if (arg === '--images-path') {
      parsed.imagesPath = args[i + 1] || ''
      i += 1
      continue
    }
    if (arg === '-') {
      if (parsed.input) {
        throw new Error('stdin marker can only be provided once')
      }
      parsed.input = '-'
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`)
    }
    if (!parsed.input) {
      parsed.input = arg
      continue
    }
    throw new Error(`unexpected argument: ${arg}`)
  }

  return parsed
}

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

function resolveOutputPath(inputPath, explicitOutput) {
  if (explicitOutput) {
    return path.resolve(explicitOutput)
  }
  if (!inputPath || inputPath === '-') {
    return ''
  }
  const absoluteInput = path.resolve(inputPath)
  return path.join(path.dirname(absoluteInput), `${path.basename(absoluteInput, path.extname(absoluteInput))}.preview.html`)
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

async function renderStandaloneHtml(origin) {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const warnings = []

  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      warnings.push(`[browser:${message.type()}] ${message.text()}`)
    }
  })

  try {
    await page.goto(`${origin}/page/1`, {
      waitUntil: 'networkidle',
      timeout: 30000
    })

    await page.waitForFunction(() => {
      const exportApi = window.__mkdpExport
      return exportApi && typeof exportApi.waitForPreviewReady === 'function'
    }, undefined, {
      timeout: 10000
    })

    const result = await page.evaluate(async () => {
      await window.__mkdpExport.waitForPreviewReady(30000)
      return window.__mkdpExport.buildStandaloneHtml()
    })

    return {
      html: result.html,
      warnings: warnings.concat(result.warnings || [])
    }
  } finally {
    await page.close()
    await browser.close()
  }
}

async function main() {
  const cliArgs = parseArgs(process.argv)
  if (cliArgs.help) {
    printUsage()
    return
  }

  const fileConfig = await loadConfig(cliArgs.config)
  const merged = mergeConfig(cliArgs, fileConfig)
  const inputPath = cliArgs.input || '-'
  const fromStdin = !cliArgs.input || cliArgs.input === '-'

  if (fromStdin && process.stdin.isTTY) {
    throw new Error('stdin is empty, pass a markdown file path or pipe markdown content in')
  }

  const markdown = fromStdin
    ? await readStream(process.stdin)
    : await fs.promises.readFile(path.resolve(inputPath), 'utf8')

  const outputPath = resolveOutputPath(inputPath, cliArgs.output)
  const absoluteInput = fromStdin ? '' : path.resolve(inputPath)
  const sourceDir = fromStdin
    ? process.cwd()
    : path.dirname(absoluteInput)
  const sourceName = fromStdin
    ? 'markdown-preview'
    : path.basename(absoluteInput)

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

  try {
    const result = await renderStandaloneHtml(server.origin)
    result.warnings.forEach((warning) => {
      process.stderr.write(`${warning}\n`)
    })

    if (outputPath) {
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.promises.writeFile(outputPath, result.html, 'utf8')
      process.stderr.write(`${outputPath}\n`)
      return
    }

    process.stdout.write(result.html)
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`)
  process.exitCode = 1
})
