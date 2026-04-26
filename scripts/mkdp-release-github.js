#!/usr/bin/env node

const childProcess = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  buildReleaseNotes
} = require('./lib/github-release-notes')

function parseArgs(argv) {
  const options = {
    assets: [],
    highlights: [],
    installCommands: [],
    verificationCommands: [],
    dryRun: false,
    edit: false
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }

    if (arg === '--edit') {
      options.edit = true
      continue
    }

    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      throw new Error(`${arg} requires a value`)
    }

    index += 1
    if (arg === '--tag') {
      options.tag = next
    } else if (arg === '--title') {
      options.title = next
    } else if (arg === '--target') {
      options.target = next
    } else if (arg === '--summary') {
      options.summary = next
    } else if (arg === '--highlight') {
      options.highlights.push(next)
    } else if (arg === '--install') {
      options.installCommands.push(next)
    } else if (arg === '--verify') {
      options.verificationCommands.push(next)
    } else if (arg === '--asset') {
      options.assets.push(next)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return options
}

function readPackageVersion(repoRoot) {
  const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  return packageJson.version
}

function fillDefaults(options, repoRoot) {
  const version = readPackageVersion(repoRoot)
  const tag = options.tag || `browse-v${version}`

  return {
    ...options,
    tag,
    target: options.target || 'HEAD',
    title: options.title || `Markdown Preview Toolbox Browse UI v${version}`,
    summary: options.summary || 'Browse UI refresh for markdown-preview.nvim.',
    highlights: options.highlights.length > 0 ? options.highlights : [
      'Adds a redesigned browse mode shell with a cleaner document navigation layout.',
      'Upgrades the table of contents to a collapsible tree with scroll synchronization.',
      'Adds topbar controls for theme, Mermaid rendering, and export workflows.',
      'Improves iframe messaging so browse controls and preview state stay in sync.'
    ],
    installCommands: options.installCommands.length > 0 ? options.installCommands : [
      'git -C ~/.local/share/nvim/site/pack/packer/start/markdown-preview.nvim pull'
    ],
    verificationCommands: options.verificationCommands.length > 0 ? options.verificationCommands : [
      'node test/browse-service.test.js',
      'yarn build-lib',
      'yarn build-app'
    ]
  }
}

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe'
  })

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n')
    throw new Error(`${command} ${args.join(' ')} failed\n${output}`)
  }

  return result.stdout.trim()
}

function createNotesFile(notes) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mkdp-release-'))
  const notesFile = path.join(tempDir, 'release-notes.md')
  fs.writeFileSync(notesFile, notes, 'utf8')
  return {
    notesFile,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function buildGhArgs(options, notesFile) {
  if (options.edit) {
    return [
      'release',
      'edit',
      options.tag,
      '--target',
      options.target,
      '--title',
      options.title,
      '--notes-file',
      notesFile
    ]
  }

  return [
    'release',
    'create',
    options.tag,
    ...options.assets,
    '--target',
    options.target,
    '--title',
    options.title,
    '--notes-file',
    notesFile
  ]
}

function main() {
  const repoRoot = path.resolve(__dirname, '..')
  const options = fillDefaults(parseArgs(process.argv.slice(2)), repoRoot)
  const notes = buildReleaseNotes(options)
  const ghArgs = buildGhArgs(options, '<release-notes.md>')

  if (options.dryRun) {
    process.stdout.write(`# ${options.title}\n\n`)
    process.stdout.write(notes)
    process.stdout.write('\n')
    process.stdout.write(`gh ${ghArgs.join(' ')}\n`)
    return
  }

  const temp = createNotesFile(notes)
  try {
    const args = buildGhArgs(options, temp.notesFile)
    const url = run('gh', args, { cwd: repoRoot })
    process.stdout.write(`${url}\n`)
  } finally {
    temp.cleanup()
  }
}

module.exports = {
  buildGhArgs,
  fillDefaults,
  parseArgs
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`${error.message || String(error)}\n`)
    process.exitCode = 1
  }
}
