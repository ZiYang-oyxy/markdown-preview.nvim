const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  listBrowseDirectory,
  searchBrowseFiles,
  readBrowseFile,
  resolveBrowseTarget
} = require('../scripts/lib/browse-service')

async function withTempTree(run) {
  const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mkdp-browse-'))

  try {
    await fs.promises.mkdir(path.join(tempRoot, 'docs'))
    await fs.promises.mkdir(path.join(tempRoot, '.git'))
    await fs.promises.mkdir(path.join(tempRoot, 'node_modules'))
    await fs.promises.mkdir(path.join(tempRoot, 'notes'))
    await fs.promises.mkdir(path.join(tempRoot, 'notes', 'deep'))

    await fs.promises.writeFile(path.join(tempRoot, 'docs', 'guide.md'), '# Guide\n\nHello\n', 'utf8')
    await fs.promises.writeFile(path.join(tempRoot, 'notes', 'plain.txt'), 'just text\n', 'utf8')
    await fs.promises.writeFile(path.join(tempRoot, 'notes', 'deep', 'alpha-phase.md'), '# Phase\n', 'utf8')
    await fs.promises.writeFile(path.join(tempRoot, 'notes', 'deep', 'phase.bin'), Buffer.from([0, 159, 146, 150]))
    await fs.promises.writeFile(path.join(tempRoot, 'node_modules', 'hidden-phase.md'), '# Hidden\n', 'utf8')
    await fs.promises.writeFile(path.join(tempRoot, 'notes', 'binary.bin'), Buffer.from([0, 159, 146, 150]))
    await fs.promises.writeFile(path.join(tempRoot, 'notes', 'Makefile'), 'all:\n\techo hello\n', 'utf8')

    const outsideFile = path.join(tempRoot, '..', 'outside.txt')
    await fs.promises.writeFile(outsideFile, 'outside root\n', 'utf8')

    const escapeLink = path.join(tempRoot, 'notes', 'escape-link')
    const innerLink = path.join(tempRoot, 'notes', 'guide-link')

    let symlinkSupport = true
    try {
      await fs.promises.symlink(outsideFile, escapeLink)
      await fs.promises.symlink(path.join(tempRoot, 'docs', 'guide.md'), innerLink)
    } catch (error) {
      symlinkSupport = false
    }

    await run({
      root: tempRoot,
      symlinkSupport
    })
  } finally {
    await fs.promises.rm(tempRoot, {
      recursive: true,
      force: true
    })
  }
}

async function main() {
  await withTempTree(async ({ root, symlinkSupport }) => {
    const listing = await listBrowseDirectory(root, '.')
    const listingNames = listing.entries.map((entry) => entry.name)

    assert.strictEqual(listing.relativePath, '.')
    assert.deepStrictEqual(listingNames, ['docs', 'notes'])

    const docsListing = await listBrowseDirectory(root, 'docs')
    assert.deepStrictEqual(docsListing.entries, [
      {
        name: 'guide.md',
        relativePath: 'docs/guide.md',
        kind: 'file',
        isMarkdown: true,
        isSymlink: false
      }
    ])

    const markdownFile = await readBrowseFile(root, 'docs/guide.md')
    assert.deepStrictEqual(markdownFile, {
      kind: 'markdown',
      name: 'guide.md',
      relativePath: 'docs/guide.md',
      contentLines: ['# Guide', '', 'Hello', '']
    })

    const textFallback = await readBrowseFile(root, 'notes/plain.txt')
    assert.strictEqual(textFallback.kind, 'fallback')
    assert.strictEqual(textFallback.fallback, 'text')
    assert.strictEqual(textFallback.text, 'just text\n')

    const binaryFallback = await readBrowseFile(root, 'notes/binary.bin')
    assert.strictEqual(binaryFallback.kind, 'fallback')
    assert.strictEqual(binaryFallback.fallback, 'download')

    // Binary files should be excluded from directory listing
    const notesListingFiltered = await listBrowseDirectory(root, 'notes')
    const binaryEntry = notesListingFiltered.entries.find((entry) => entry.name === 'binary.bin')
    assert.strictEqual(binaryEntry, undefined, 'binary.bin should be filtered from directory listing')

    // Text files should still appear
    const textEntry = notesListingFiltered.entries.find((entry) => entry.name === 'plain.txt')
    assert.ok(textEntry, 'plain.txt should still appear in directory listing')

    // Extensionless displayable files should appear
    const makefileEntry = notesListingFiltered.entries.find((entry) => entry.name === 'Makefile')
    assert.ok(makefileEntry, 'Makefile should appear in directory listing')

    const recursiveSearch = await searchBrowseFiles(root, '.', 'ph')
    assert.strictEqual(recursiveSearch.relativePath, '.')
    assert.deepStrictEqual(recursiveSearch.entries, [
      {
        name: 'alpha-phase.md',
        relativePath: 'notes/deep/alpha-phase.md',
        kind: 'file',
        isMarkdown: true,
        isSymlink: false
      }
    ])

    assert.throws(
      () => resolveBrowseTarget(root, '../outside.txt'),
      (error) => error && error.code === 'outside_root'
    )

    if (symlinkSupport) {
      const notesListing = await listBrowseDirectory(root, 'notes')
      const escapeEntry = notesListing.entries.find((entry) => entry.name === 'escape-link')
      const innerEntry = notesListing.entries.find((entry) => entry.name === 'guide-link')

      assert.deepStrictEqual(escapeEntry, {
        name: 'escape-link',
        relativePath: 'notes/escape-link',
        kind: 'blocked',
        blocked: true,
        reason: 'outside-root',
        isSymlink: true
      })

      assert.deepStrictEqual(innerEntry, {
        name: 'guide-link',
        relativePath: 'notes/guide-link',
        kind: 'file',
        isMarkdown: true,
        isSymlink: true
      })

      await assert.rejects(
        readBrowseFile(root, 'notes/escape-link'),
        (error) => error && error.code === 'outside_root'
      )
    }
  })

  process.stdout.write('browse-service tests: ok\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`)
  process.exitCode = 1
})
