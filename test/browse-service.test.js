const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const {
  listBrowseDirectory,
  searchBrowseFiles,
  readBrowseFile,
  resolveBrowseTarget,
  fuzzyMatch
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
  // ---- fuzzyMatch unit tests ----
  function assertFuzzy(query, target, expectMatch) {
    const result = fuzzyMatch(query, target)
    if (expectMatch) {
      assert.ok(result, `expected '${query}' to match '${target}'`)
    } else {
      assert.strictEqual(result, null, `expected '${query}' NOT to match '${target}'`)
    }
    return result
  }

  // subsequence match + positions
  const bdBuild = assertFuzzy('bd', 'build', true)
  assert.deepStrictEqual(bdBuild.positions, [0, 4], 'bd should match b(0) and d(4) in build')
  assertFuzzy('abc', 'build', false)

  // smart-case: lowercase query is case-insensitive, query with uppercase is case-sensitive
  assertFuzzy('bd', 'Build', true)
  assertFuzzy('Bd', 'build', false)

  // consecutive run scores higher than scattered
  assert.ok(
    fuzzyMatch('bui', 'build').score > fuzzyMatch('bld', 'build').score,
    'consecutive matches should score higher than scattered ones'
  )

  // separator-boundary match scores higher than mid-word match
  assert.ok(
    fuzzyMatch('f', 'app/foo').score > fuzzyMatch('f', 'affoo').score,
    'match right after a separator should score higher than a mid-word match'
  )

  // empty query returns zero-score empty-position match
  assert.deepStrictEqual(fuzzyMatch('', 'build'), { score: 0, positions: [] })

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
    // 'ph' is a subsequence of notes/deep/alpha-phase.md (phase.bin is filtered as
    // binary). Only alpha-phase.md should remain.
    const phPaths = recursiveSearch.entries.map((e) => e.relativePath)
    assert.deepStrictEqual(phPaths, ['notes/deep/alpha-phase.md'])
    const phEntry = recursiveSearch.entries[0]
    assert.strictEqual(phEntry.name, 'alpha-phase.md')
    assert.strictEqual(phEntry.kind, 'file')
    assert.strictEqual(phEntry.isMarkdown, true)
    assert.strictEqual(phEntry.isSymlink, false)
    assert.strictEqual(typeof phEntry.score, 'number')
    assert.ok(Array.isArray(phEntry.matchPositions), 'entry should carry matchPositions')
    // positions index into relativePath
    phEntry.matchPositions.forEach((pos) => {
      assert.ok(pos >= 0 && pos < phEntry.relativePath.length, 'position within relativePath')
    })

    // fzf subsequence across path segments: 'nda' hits notes/deep/alpha-phase.md
    const crossSegment = await searchBrowseFiles(root, '.', 'nda')
    const crossPaths = crossSegment.entries.map((e) => e.relativePath)
    assert.ok(
      crossPaths.includes('notes/deep/alpha-phase.md'),
      'query spanning path segments should match the full relative path'
    )

    // results sorted by score descending: a 'gd' query should surface docs/guide.md first
    const guideSearch = await searchBrowseFiles(root, '.', 'gd')
    assert.ok(
      guideSearch.entries.length >= 1 && guideSearch.entries[0].relativePath === 'docs/guide.md',
      "'gd' should match docs/guide.md as top result"
    )
    for (let i = 1; i < guideSearch.entries.length; i += 1) {
      assert.ok(
        guideSearch.entries[i - 1].score >= guideSearch.entries[i].score,
        'entries must be sorted by score descending'
      )
    }

    // empty query returns no entries
    const emptySearch = await searchBrowseFiles(root, '.', '')
    assert.deepStrictEqual(emptySearch.entries, [])

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
