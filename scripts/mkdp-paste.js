#!/usr/bin/env node

const path = require('path')

require('../packages/cli/lib/commands/paste').run(process.argv.slice(2), {
  assetRoot: path.join(__dirname, '..', 'preview', 'dist')
}).catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`)
  process.exitCode = 1
})
