import { expect, test } from 'playwright/test'

test('downloaded HTML is inert and keeps sanitized Markdown and Mermaid', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: '粘贴新文档' }).first().click()
  const dialog = page.getByRole('dialog', { name: '粘贴 Markdown' })
  await dialog.getByLabel('Markdown 源文本').fill(`
# 导出安全
<script>window.exportXss = true</script>
<img src=x onerror="window.exportXss=true">
[bad](javascript:alert(1))

\`\`\`mermaid
graph TD
  A[安全快照] --> B[静态 HTML]
\`\`\`
`)
  await dialog.getByRole('button', { name: '渲染为新文档' }).click()

  // Export immediately: the shell must wait for the current Markdown and
  // Mermaid render instead of downloading the previous preview snapshot.
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: '导出 HTML' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  const html = Buffer.concat(chunks).toString('utf8')

  expect(html).toContain('<h1 id="section-1">导出安全</h1>')
  expect(html).toContain('<svg')
  expect(html).toContain("default-src 'none'")
  expect(html).not.toMatch(/<script/i)
  expect(html).not.toMatch(/<[^>]+\son[a-z]+=/i)
  expect(html).not.toMatch(/<iframe|<object|<embed|<form|<foreignObject/i)
  expect(html).not.toMatch(/(?:href|src)=["']javascript:/i)
  expect(html).not.toMatch(/(?:src|href)="https?:\/\//i)
})
