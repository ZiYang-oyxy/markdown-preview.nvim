import { expect, test } from 'playwright/test'

async function pasteDocument(page, markdown) {
  await page.getByRole('button', { name: '粘贴新文档' }).first().click()
  const dialog = page.getByRole('dialog', { name: '粘贴 Markdown' })
  await dialog.getByLabel('Markdown 源文本').fill(markdown)
  await dialog.getByRole('button', { name: '渲染为新文档' }).click()
}

test('missing preview runtime stops loading and shows a recovery error', async ({ page }) => {
  await page.route('**/assets/preview-frame.js', (route) => route.abort())
  await page.goto('/')
  await pasteDocument(page, '# 无法加载预览')

  await expect(page.getByRole('alert')).toContainText('安全预览无法启动', { timeout: 10_000 })
  await expect(page.getByRole('status', { name: '正在安全渲染…' })).toBeHidden()
  await expect(page.getByRole('status', { name: '预览暂时不可用' })).toBeVisible()
  await expect(page.locator('.preview-frame')).toBeHidden()
})

test('snapshot timeout restores the export action with an error', async ({ page }) => {
  await page.goto('/')
  await pasteDocument(page, '# 导出超时')
  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: '导出超时' })).toBeVisible()
  await page.locator('.preview-frame').evaluate((iframe) => {
    iframe.src = 'about:blank'
  })
  await page.getByRole('button', { name: '导出 HTML' }).click()

  await expect(page.getByRole('alert')).toContainText(/导出失败：.*预览.*超时/, { timeout: 10_000 })
  await expect(page.getByRole('button', { name: '导出 HTML' })).toBeEnabled()
})
