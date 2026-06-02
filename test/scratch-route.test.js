const assert = require('assert')
const http = require('http')

const {
  startStandalonePreviewServer,
  buildScratchShellHtml
} = require('../scripts/lib/standalone-preview-server')

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        contentType: res.headers['content-type'] || '',
        body: Buffer.concat(chunks).toString('utf8')
      }))
    }).on('error', reject)
  })
}

async function main() {
  // 1. shell html markers
  const html = buildScratchShellHtml()
  assert.match(html, /id="scratch-input"/)
  assert.match(html, /id="preview-frame"/)
  assert.match(html, /mkdp:set-content/)
  assert.match(html, /src="\/page\/1"/)

  // 2. route returns 200 without browseRoot
  const server = await startStandalonePreviewServer({
    cwd: process.cwd(),
    fileDir: process.cwd(),
    previewOptions: {},
    theme: 'light',
    name: 'scratch',
    contentLines: []
  })

  try {
    const res = await httpGet(`${server.origin}/_mkdp/scratch`)
    assert.strictEqual(res.statusCode, 200)
    assert.ok(res.contentType.includes('text/html'), 'content-type should be text/html')
    assert.match(res.body, /id="scratch-input"/)
    assert.match(res.body, /id="preview-frame"/)
  } finally {
    await server.close()
  }

  process.stdout.write('scratch-route tests: ok\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`)
  process.exitCode = 1
})
