const path = require('path')
const opener = require('../opener')
const { startStudioStaticServer } = require('../studio-static-server')

function printUsage() {
  process.stderr.write([
    'Usage: mkdp studio [options]',
    '',
    'Options:',
    '  --port <number>    Loopback port (default: 17329)',
    '  --browser <name>   Browser application or command',
    '  --no-open          Print URL without opening a browser',
    '  -h, --help         Show this help'
  ].join('\n') + '\n')
}

function parseArgs(argv) {
  const parsed = { port: 17329, browser: '', open: true }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '-h' || argument === '--help') parsed.help = true
    else if (argument === '--no-open') parsed.open = false
    else if (argument === '--port') parsed.port = Number(argv[++index])
    else if (argument === '--browser') parsed.browser = argv[++index] || ''
    else throw new Error(`unknown option: ${argument}`)
  }
  if (!Number.isInteger(parsed.port) || parsed.port < 1 || parsed.port > 65535) {
    throw new Error('--port must be an integer between 1 and 65535')
  }
  return parsed
}

function openUrl(url, browser) {
  return new Promise((resolve, reject) => {
    const child = opener(url, browser || undefined)
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }
    child.once('error', (error) => finish(reject, error))
    child.once('spawn', () => finish(resolve))
    setTimeout(() => finish(resolve), 400)
  })
}

function waitForShutdown() {
  return new Promise((resolve) => {
    const onSignal = () => {
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
      resolve()
    }
    process.on('SIGINT', onSignal)
    process.on('SIGTERM', onSignal)
  })
}

async function run(argv, runtimeOptions = {}) {
  const options = parseArgs(argv)
  if (options.help) {
    printUsage()
    return
  }
  const assetRoot = runtimeOptions.assetRoot || path.join(__dirname, '..', '..', 'assets', 'studio')
  const session = await startStudioStaticServer({ assetRoot, port: options.port })
  process.stdout.write(`${session.url}\n`)
  try {
    if (options.open) {
      try {
        await openUrl(session.url, options.browser)
      } catch (error) {
        process.stderr.write(`failed to open browser automatically: ${error.message || String(error)}\n`)
      }
    }
    process.stderr.write('Studio is running on loopback only; press Ctrl+C to stop\n')
    await waitForShutdown()
  } finally {
    await session.close()
  }
}

module.exports = { parseArgs, run }
