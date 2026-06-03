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

  // ---- regression: filename consecutive match must beat cross-segment scatter ----
  // Real-world bug: searching 'design' ranked a file whose name has no 'design'
  // (chars scattered across long directory segments) above files whose *filename*
  // contains a consecutive 'design'. The consecutive filename match must win.
  {
    const consecutiveInName =
      'docs/superpowers/specs/2026-06-02-browse-fzf-search-design.md'
    const scatteredAcrossDirs =
      '.worktrees/browse-sidebar-search-filenames/scripts/lib/github-release-notes.js'
    const nameMatch = fuzzyMatch('design', consecutiveInName)
    const scatterMatch = fuzzyMatch('design', scatteredAcrossDirs)
    assert.ok(nameMatch, "'design' should match the consecutive-filename path")
    assert.ok(scatterMatch, "'design' should still match the scattered path")
    assert.ok(
      nameMatch.score > scatterMatch.score,
      'consecutive filename match must outrank cross-segment scattered match ' +
        `(name=${nameMatch.score} vs scatter=${scatterMatch.score})`
    )
  }

  // a consecutive filename match beats chars scattered mid-word across segments
  // (the real-world failure mode): chars buried inside words collect no boundary
  // bonus and accrue uncapped gap penalties, so the consecutive run wins even
  // when it sits behind a long directory prefix.
  // 'design' scattered mid-word across segments: wi(d)gets r(e)lease pa(s)sive
  // bu(i)ld lo(g)a motio(n) — no boundary bonuses, uncapped gap penalties.
  assert.ok(
    fuzzyMatch('design', 'a/very/long/nested/dir/path/here/the-design.md').score >
      fuzzyMatch('design', 'widgets/release/passive/build/loga/motion.js').score,
    'consecutive filename match should beat chars scattered mid-word across dirs'
  )

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

    // matchPositions must still index into relativePath after the ranking change
    // (front-end highlight depends on this).
    for (const entry of recursiveSearch.entries) {
      entry.matchPositions.forEach((pos) => {
        assert.ok(
          pos >= 0 && pos < entry.relativePath.length,
          'matchPositions must index into relativePath'
        )
      })
    }

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

  // ---- basename bonus: filename hit ranks above deep scattered hit (e2e) ----
  {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mkdp-fzf-'))
    try {
      // file whose *name* consecutively contains 'design'
      await fs.promises.mkdir(path.join(tempRoot, 'docs', 'specs'), { recursive: true })
      await fs.promises.writeFile(
        path.join(tempRoot, 'docs', 'specs', 'browse-fzf-search-design.md'),
        '# spec\n',
        'utf8'
      )
      // file whose name has NO 'design'; chars only reachable by scattering across
      // long directory segments: si(d)ebar / s(e)arch / (s)cripts / l(i)b / (g)ithub / (n)otes
      await fs.promises.mkdir(
        path.join(tempRoot, 'browse-sidebar-search', 'scripts', 'lib'),
        { recursive: true }
      )
      await fs.promises.writeFile(
        path.join(tempRoot, 'browse-sidebar-search', 'scripts', 'lib', 'github-release-notes.js'),
        '// js\n',
        'utf8'
      )

      const search = await searchBrowseFiles(tempRoot, '.', 'design')
      const paths = search.entries.map((e) => e.relativePath)
      assert.ok(
        paths.indexOf('docs/specs/browse-fzf-search-design.md') !== -1,
        'design spec file must be in results'
      )
      assert.strictEqual(
        search.entries[0].relativePath,
        'docs/specs/browse-fzf-search-design.md',
        'consecutive-filename match must rank first, not the scattered deep path'
      )
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true })
    }
  }

  // ---- basename hit has ABSOLUTE priority: every filename match outranks every
  // non-filename match, regardless of path score. A long scattered path that
  // collects many boundary bonuses must NOT slip between filename matches. ----
  {
    const tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mkdp-fzf-prio-'))
    try {
      // filename match, but driven to a LOW total score: 'design' is scattered
      // mid-word inside the filename (no boundary bonuses) and the file sits deep
      // (large first-char gap). Path score ~30, so with a fixed basename bonus its
      // total (~126) sits BELOW the scattered .log below.
      await fs.promises.mkdir(
        path.join(tempRoot, 'xx', 'xx', 'xx', 'xx', 'xx', 'xx', 'xx', 'xx'),
        { recursive: true }
      )
      await fs.promises.writeFile(
        path.join(
          tempRoot, 'xx', 'xx', 'xx', 'xx', 'xx', 'xx', 'xx', 'xx',
          'widgetsreleasepassivebuildlogamotion.md'
        ),
        '# n\n',
        'utf8'
      )

      // NO 'design' subsequence in filename ('release.log'); query reachable only
      // by scattering across many separator-bounded segments, each granting a
      // boundary bonus -> HIGH path score (~134) that, under a fixed bonus, slips
      // ABOVE the low-scoring filename match above.
      await fs.promises.mkdir(
        path.join(tempRoot, 'de', 'si', 'gn', 'de', 'si', 'gn', 'de', 'si', 'gn', 'de', 'si', 'gn'),
        { recursive: true }
      )
      await fs.promises.writeFile(
        path.join(
          tempRoot, 'de', 'si', 'gn', 'de', 'si', 'gn', 'de', 'si', 'gn', 'de', 'si', 'gn',
          'release.log'
        ),
        'log\n',
        'utf8'
      )

      const search = await searchBrowseFiles(tempRoot, '.', 'design')
      const nameMatches = (p) => fuzzyMatch('design', path.basename(p)) !== null
      const flags = search.entries.map((e) => nameMatches(e.relativePath))
      // every filename match must come before every non-match: once a non-match
      // appears, no filename match may follow.
      let sawNonMatch = false
      for (let i = 0; i < flags.length; i += 1) {
        if (!flags[i]) {
          sawNonMatch = true
        } else if (sawNonMatch) {
          assert.fail(
            'filename match appeared after a non-match at rank ' + (i + 1) +
              ' (' + search.entries[i].relativePath + '); basename priority not absolute'
          )
        }
      }
      // sanity: both files matched, and the scattered .log is present but ranked
      // strictly after the filename match despite its higher path score.
      assert.strictEqual(search.entries.length, 2, 'both files should match')
      assert.ok(
        search.entries[0].relativePath.endsWith('.md'),
        'low-scoring filename match must still rank first (absolute basename priority)'
      )
      assert.ok(
        search.entries[1].relativePath.endsWith('release.log'),
        'higher-path-score scattered .log must rank last'
      )
    } finally {
      await fs.promises.rm(tempRoot, { recursive: true, force: true })
    }
  }

  process.stdout.write('browse-service tests: ok\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`)
  process.exitCode = 1
})
