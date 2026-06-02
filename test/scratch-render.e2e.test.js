const assert = require('assert')
const { chromium } = require('playwright')

const {
  startStandalonePreviewServer
} = require('../scripts/lib/standalone-preview-server')

const MARKDOWN = [
  '# Hello Scratch',
  '',
  '- item one',
  '- item two',
  '',
  '```js',
  'const x = 1',
  '```',
  ''
].join('\n')

async function main() {
  const server = await startStandalonePreviewServer({
    cwd: process.cwd(),
    fileDir: process.cwd(),
    previewOptions: {},
    theme: 'light',
    name: 'scratch',
    contentLines: []
  })

  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    await page.goto(server.origin + '/_mkdp/scratch')
    await page.waitForSelector('#scratch-input')

    await page.fill('#scratch-input', MARKDOWN)

    const frame = page.frameLocator('#preview-frame')
    await frame.locator('h1', { hasText: 'Hello Scratch' }).waitFor({ timeout: 10000 })

    const h1Text = await frame.locator('h1').first().innerText()
    assert.match(h1Text, /Hello Scratch/)

    const liCount = await frame.locator('ul li').count()
    assert.ok(liCount >= 2, `expected >=2 list items, got ${liCount}`)

    const preCount = await frame.locator('pre').count()
    assert.ok(preCount >= 1, `expected >=1 pre block, got ${preCount}`)
  } finally {
    await browser.close()
    await server.close()
  }

  process.stdout.write('scratch-render e2e tests: ok\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`)
  process.exitCode = 1
})
