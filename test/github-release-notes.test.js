const assert = require('assert')

const {
  buildReleaseNotes
} = require('../scripts/lib/github-release-notes')

function main() {
  const notes = buildReleaseNotes({
    summary: 'Browse UI refresh for markdown-preview.nvim.',
    highlights: [
      'Adds a redesigned browse mode shell.',
      'Upgrades the table of contents to a collapsible tree.'
    ],
    installCommands: [
      'git -C ~/.local/share/nvim/site/pack/packer/start/markdown-preview.nvim pull'
    ],
    verificationCommands: [
      'node test/browse-service.test.js',
      'yarn build-lib',
      'yarn build-app'
    ]
  })

  assert.ok(notes.startsWith('Browse UI refresh for markdown-preview.nvim.\n\nHighlights:\n'))
  assert.ok(notes.includes('- Adds a redesigned browse mode shell.\n'))
  assert.ok(notes.includes('- Upgrades the table of contents to a collapsible tree.\n'))
  assert.ok(notes.includes('Install / update:\n```bash\n'))
  assert.ok(notes.includes('git -C ~/.local/share/nvim/site/pack/packer/start/markdown-preview.nvim pull\n```'))
  assert.ok(notes.includes('Verification:\n```bash\nnode test/browse-service.test.js\nyarn build-lib\nyarn build-app\n```'))
  assert.strictEqual(notes.includes('## 亮点'), false)
  assert.strictEqual(notes.endsWith('\n'), true)

  process.stdout.write('github-release-notes tests: ok\n')
}

main()
