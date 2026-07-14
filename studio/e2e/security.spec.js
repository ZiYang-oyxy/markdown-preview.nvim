import { expect, test } from 'playwright/test'

const TOKEN = '0123456789abcdef0123456789abcdef'

async function attachIsolatedPreview(page) {
  await page.goto('/')
  await page.evaluate(async ({ token }) => {
    const iframe = document.createElement('iframe')
    iframe.id = 'security-preview'
    iframe.name = 'security-preview'
    iframe.title = 'Security test preview'
    iframe.sandbox = 'allow-scripts'
    iframe.referrerPolicy = 'no-referrer'
    iframe.src = './studio-preview.html'
    document.body.append(iframe)
    await new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }))

    const channel = new MessageChannel()
    const responses = []
    channel.port1.onmessage = ({ data }) => responses.push(data)
    channel.port1.start()
    iframe.contentWindow.postMessage(
      { type: 'mkdp:studio-init', version: 1, token },
      '*',
      [channel.port2],
    )
    window.__securityPort = channel.port1
    window.__securityResponses = responses
  }, { token: TOKEN })

  const frame = page.frames().find((candidate) => candidate.name() === 'security-preview')
  expect(frame).toBeTruthy()
  await expect.poll(() => page.evaluate(() => window.__securityResponses.length)).toBeGreaterThan(0)
  return frame
}

async function render(page, markdown, renderId = 1) {
  await page.evaluate(
    ({ markdown, renderId, token }) => {
      window.__securityPort.postMessage({
        type: 'render',
        version: 1,
        token,
        renderId,
        markdown,
        theme: 'light',
      })
    },
    { markdown, renderId, token: TOKEN },
  )
  await expect
    .poll(() =>
      page.evaluate(
        (id) => window.__securityResponses.some(
          (response) => response.type === 'rendered' && response.renderId === id,
        ),
        renderId,
      ),
    )
    .toBe(true)
}

test('raw HTML, event handlers, dangerous URLs, and SVG data never execute', async ({ page }) => {
  const frame = await attachIsolatedPreview(page)
  await render(page, `
# 安全测试
<script>window.__studioXss = 'script'</script>
<img src=x onerror="window.__studioXss = 'event'">
![x\" onerror=\"window.__studioXss='alt'](data:image/svg+xml,<svg onload=alert(1)>)
[危险链接](javascript:window.__studioXss='link')
`)

  expect(await frame.evaluate(() => window.__studioXss)).toBeUndefined()
  await expect(frame.locator('script')).toHaveCount(1)
  await expect(frame.locator('a[href^="javascript:"]')).toHaveCount(0)
  await expect(frame.locator('img[src^="data:image/svg"]')).toHaveCount(0)
})

test('Mermaid and KaTeX remain strict and invalid diagrams get an inert fallback', async ({ page }) => {
  const frame = await attachIsolatedPreview(page)
  await render(page, `
\`\`\`mermaid
graph TD
  A[Safe] --> B[Still safe]
  click A "javascript:window.__studioXss='mermaid'"
\`\`\`

$\\href{javascript:window.__studioXss='katex'}{click}$

\`\`\`mermaid
graph TD
  broken[
\`\`\`
`)

  expect(await frame.evaluate(() => window.__studioXss)).toBeUndefined()
  await expect(frame.locator('svg')).toHaveCount(1)
  await expect(frame.locator('svg')).toContainText('Safe')
  await expect(frame.locator('foreignObject')).toHaveCount(0)
  await expect(frame.locator('[role="alert"]')).toContainText('无法渲染')
})

test('opaque sandbox cannot read parent storage and forged window messages are ignored', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('shell-secret', 'never expose'))
  const frame = await attachIsolatedPreview(page)
  const sandbox = await page.locator('#security-preview').getAttribute('sandbox')
  expect(sandbox).toBe('allow-scripts')

  const storageAccess = await frame.evaluate(() => {
    try {
      return localStorage.getItem('shell-secret')
    } catch (error) {
      return error.name
    }
  })
  expect(storageAccess).toBe('SecurityError')

  await page.evaluate(({ token }) => {
    const iframe = document.querySelector('#security-preview')
    iframe.contentWindow.postMessage({
      type: 'render',
      version: 1,
      token,
      renderId: 999,
      markdown: '# Forged',
      theme: 'light',
    }, '*')
  }, { token: TOKEN })
  await page.waitForTimeout(100)
  await expect(frame.getByRole('heading', { name: 'Forged' })).toHaveCount(0)
})
