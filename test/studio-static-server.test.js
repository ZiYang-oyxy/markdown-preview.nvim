const assert = require('assert')
const fs = require('fs')
const http = require('http')
const os = require('os')
const path = require('path')

const { startStudioStaticServer } = require('../scripts/lib/studio-static-server')

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, options, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({
        body: Buffer.concat(chunks).toString('utf8'),
        headers: response.headers,
        statusCode: response.statusCode
      }))
    })
    req.on('error', reject)
    req.end()
  })
}

async function main() {
  const assetRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mkdp-studio-static-'))
  fs.mkdirSync(path.join(assetRoot, 'assets'))
  fs.writeFileSync(path.join(assetRoot, 'index.html'), '<h1>Markdown Preview shell</h1>')
  fs.writeFileSync(path.join(assetRoot, 'studio-preview.html'), '<h1>Preview</h1>')
  fs.writeFileSync(path.join(assetRoot, 'assets', 'app.js'), 'console.log("safe")')
  let session

  try {
    session = await startStudioStaticServer({ assetRoot, port: 0 })
    assert.match(session.url, /^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{32}\/$/)

    const index = await request(session.url)
    assert.strictEqual(index.statusCode, 200)
    assert.match(index.body, /Markdown Preview shell/)
    assert.strictEqual(index.headers['x-content-type-options'], 'nosniff')
    assert.strictEqual(index.headers['referrer-policy'], 'no-referrer')
    assert.match(index.headers['content-security-policy'], /frame-src 'self'/)

    const preview = await request(`${session.url}studio-preview.html`)
    assert.strictEqual(preview.statusCode, 200)
    assert.match(preview.headers['content-security-policy'], /default-src 'none'/)

    const script = await request(`${session.url}assets/app.js`)
    assert.strictEqual(script.statusCode, 200)
    assert.match(script.headers['content-type'], /^text\/javascript/)

    assert.strictEqual((await request(session.origin)).statusCode, 404)
    assert.strictEqual((await request(session.url, { headers: { Host: 'attacker.example' } })).statusCode, 421)
    assert.strictEqual((await request(`${session.url}%2e%2e/package.json`)).statusCode, 404)
    assert.strictEqual((await request(session.url, { method: 'POST' })).statusCode, 405)
  } finally {
    if (session) await session.close()
    fs.rmSync(assetRoot, { recursive: true, force: true })
  }

  process.stdout.write('studio static server tests: ok\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`)
  process.exitCode = 1
})
