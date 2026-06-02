#!/usr/bin/env node

const packageJson = require('../package.json')

function usage() {
  return [
    'Usage: mkdp <command> [options]',
    '',
    'Commands:',
    '  preview [file|-]   Preview a Markdown file in the browser',
    '  export [file|-]    Export Markdown to a standalone HTML file',
    '  browse [dir]       Browse Markdown files in a directory',
    '',
    'Options:',
    '  -h, --help         Show help',
    '  -v, --version      Show version'
  ].join('\n') + '\n'
}

function printUsage(stream) {
  stream.write(usage())
}

async function main(argv) {
  const command = argv[2]

  if (command === '-h' || command === '--help') {
    printUsage(process.stdout)
    return 0
  }

  if (command === '-v' || command === '--version') {
    process.stdout.write(`${packageJson.version}\n`)
    return 0
  }

  if (!command) {
    printUsage(process.stderr)
    return 1
  }

  if (command === 'preview') {
    await require('../lib/commands/preview').run(argv.slice(3))
    return 0
  }

  if (command === 'export') {
    await require('../lib/commands/export').run(argv.slice(3))
    return 0
  }

  if (command === 'browse') {
    await require('../lib/commands/browse').run(argv.slice(3))
    return 0
  }

  process.stderr.write(`unknown command: ${command}\n`)
  printUsage(process.stderr)
  return 1
}

main(process.argv).then((code) => {
  process.exitCode = code
}).catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`)
  process.exitCode = 1
})
