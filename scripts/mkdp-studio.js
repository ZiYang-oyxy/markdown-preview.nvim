#!/usr/bin/env node

const path = require('path')

require('../packages/cli/lib/commands/studio').run(process.argv.slice(2), {
  assetRoot: path.join(__dirname, '..', 'studio', 'dist')
}).catch((error) => {
  process.stderr.write(`${error.message || String(error)}\n`)
  process.exitCode = 1
})
