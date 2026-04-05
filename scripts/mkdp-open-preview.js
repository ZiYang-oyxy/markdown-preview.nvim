#!/usr/bin/env node

const opener = require('../app/lib/util/opener')
const {
  COMMON_OPTION_HELP,
  createStandalonePreviewSession
} = require('./lib/standalone-preview-runtime')

function printUsage() {
  process.stderr.write(
    [
      'Usage: mkdp-open-preview [input|-] [options]',
      '',
      'Options:',
      ...COMMON_OPTION_HELP,
      '  --browser <name>            Browser application or command',
      '  -h, --help                  Show this help'
    ].join('\n') + '\n'
  )
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const parsed = {
    input: 'test/demo.md',
    config: '',
    theme: '',
    pageTitle: '',
    markdownCss: '',
    highlightCss: '',
    imagesPath: '',
    browser: ''
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]

    if (arg === '-h' || arg === '--help') {
      parsed.help = true
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
    if (arg === '--browser') {
      parsed.browser = args[i + 1] || ''
      i += 1
      continue
    }
    if (arg === '-') {
      parsed.input = '-'
      continue
    }
    if (arg.startsWith('-')) {
      throw new Error(`unknown option: ${arg}`)
    }

    parsed.input = arg
  }

  return parsed
}

function openUrl(url, browser) {
  return new Promise((resolve, reject) => {
    const child = opener(url, browser || undefined)
    let settled = false

    const finish = (fn, value) => {
      if (settled) {
        return
      }
      settled = true
      fn(value)
    }

    child.once('error', (error) => finish(reject, error))
    child.once('spawn', () => finish(resolve))

    setTimeout(() => finish(resolve), 400)
  })
}

function waitForShutdown() {
  return new Promise((resolve) => {
    const signals = ['SIGINT', 'SIGTERM']
    const onSignal = () => {
      signals.forEach((signal) => process.off(signal, onSignal))
      resolve()
    }

    signals.forEach((signal) => process.on(signal, onSignal))
  })
}

async function main() {
  const cliArgs = parseArgs(process.argv)
  if (cliArgs.help) {
    printUsage()
    return
  }

  const session = await createStandalonePreviewSession(cliArgs, {
    defaultInput: 'test/demo.md'
  })
  const url = `${session.origin}/page/1`

  process.stdout.write(`${url}\n`)

  try {
    try {
      await openUrl(url, cliArgs.browser)
    } catch (error) {
      process.stderr.write(`failed to open browser automatically: ${error.message || String(error)}\n`)
      process.stderr.write(`open the URL manually: ${url}\n`)
    }

    process.stderr.write('preview server is running, press Ctrl+C to stop\n')
    await waitForShutdown()
  } finally {
    await session.close()
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`)
  process.exitCode = 1
})
