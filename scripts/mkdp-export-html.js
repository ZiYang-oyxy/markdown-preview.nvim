#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const {
  COMMON_OPTION_HELP,
  createStandalonePreviewSession,
  openStandalonePreviewPage
} = require('./lib/standalone-preview-runtime')

function printUsage() {
  process.stderr.write(
    [
      'Usage: mkdp-export-html [input|-] [options]',
      '',
      'Options:',
      '  -o, --output <path>          Output html path',
      ...COMMON_OPTION_HELP,
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
    await openStandalonePreviewPage(page, origin, {
      timeout: 30000
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

  const session = await createStandalonePreviewSession(cliArgs)
  const outputPath = resolveOutputPath(cliArgs.input || '-', cliArgs.output)

  try {
    const result = await renderStandaloneHtml(session.origin)
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
    await session.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`)
  process.exitCode = 1
})
