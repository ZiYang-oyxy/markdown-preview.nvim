const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright')

const {
  startStandalonePreviewServer
} = require('../scripts/lib/standalone-preview-server')

async function buildTree() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mkdp-fzf-'))
  await fs.promises.mkdir(path.join(root, 'app', 'build'), { recursive: true })
  await fs.promises.mkdir(path.join(root, 'docs'), { recursive: true })
  await fs.promises.writeFile(path.join(root, 'app', 'build', 'foo.md'), '# Foo\n', 'utf8')
  await fs.promises.writeFile(path.join(root, 'docs', 'guide.md'), '# Guide\n', 'utf8')
  await fs.promises.writeFile(path.join(root, 'readme.md'), '# Readme\n', 'utf8')
  return root
}

async function main() {
  const root = await buildTree()
  const server = await startStandalonePreviewServer({
    cwd: root,
    fileDir: root,
    previewOptions: {},
    theme: 'light',
    name: 'fzf',
    browseRoot: root,
    contentLines: []
  })

  const browser = await chromium.launch()

  try {
    // wide viewport so the sidebar (and its search box) is not collapsed
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
    await page.goto(server.origin + '/_mkdp/browse')
    await page.waitForSelector('#search-input')

    // type a fuzzy query: 'bd' should surface app/build/foo.md (b...uild...)
    await page.fill('#search-input', 'bd')

    // spinner should appear during the debounce/request window
    // (poll briefly; debounce is 180ms then a network round-trip)
    let sawSpinner = false
    for (let i = 0; i < 40; i += 1) {
      const active = await page.locator('#search-spinner.is-active').count()
      if (active > 0) { sawSpinner = true; break }
      await page.waitForTimeout(10)
    }
    assert.ok(sawSpinner, 'spinner should become active during search')

    // wait for results to render: a file item with name foo.md
    await page
      .locator('#file-list .file-item .file-name', { hasText: 'foo.md' })
      .first()
      .waitFor({ timeout: 5000 })

    // spinner should be hidden again after results arrive (class is-active removed)
    let spinnerHidden = false
    for (let i = 0; i < 50; i += 1) {
      const active = await page.locator('#search-spinner.is-active').count()
      if (active === 0) { spinnerHidden = true; break }
      await page.waitForTimeout(20)
    }
    assert.ok(spinnerHidden, 'spinner should hide after results arrive')

    // hit highlighting present
    const hlCount = await page.locator('#file-list .file-item .match-hl').count()
    assert.ok(hlCount > 0, 'matched characters should be highlighted')

    // the build path should be discoverable: foo.md is rendered in the list
    const listText = await page.locator('#file-list').innerText()
    assert.ok(/foo\.md/.test(listText), 'foo.md result should be rendered in the file list')
  } finally {
    await browser.close()
    await server.close()
    await fs.promises.rm(root, { recursive: true, force: true })
  }

  process.stdout.write('browse-fzf-search e2e tests: ok\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`)
  process.exitCode = 1
})
