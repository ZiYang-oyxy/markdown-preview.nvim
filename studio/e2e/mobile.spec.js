import { expect, test } from 'playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

async function createDocument(page, markdown) {
  await page.getByRole('button', { name: '新建文档' }).click()
  const dialog = page.getByRole('dialog', { name: '粘贴 Markdown' })
  await dialog.getByLabel('Markdown 源文本').fill(markdown)
  await dialog.getByRole('button', { name: '渲染为新文档' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('mobile uses full-screen paste, document, TOC, and source sheets', async ({ page }) => {
  await expect(page.getByRole('button', { name: '新建文档' })).toBeVisible()
  await createDocument(page, '# 手机文档\n\n## 手机章节\n\n内容')

  await page.getByRole('button', { name: '打开文档列表' }).click()
  const documents = page.getByRole('dialog', { name: '临时文档' })
  await expect(documents).toBeVisible()
  await expect(documents.getByRole('button', { name: /手机文档/ })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '打开文档列表' })).toBeFocused()

  await page.getByRole('button', { name: '打开本文目录' }).click()
  const toc = page.getByRole('dialog', { name: '本文目录' })
  await expect(toc.getByRole('button', { name: '跳转到手机章节' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: '查看源文本' }).click()
  const source = page.getByRole('dialog', { name: '查看或编辑源文本' })
  await expect(source).toBeVisible()
  const box = await source.boundingBox()
  expect(box.width).toBeGreaterThanOrEqual(380)
  expect(box.height).toBeGreaterThanOrEqual(820)
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '查看源文本' })).toBeFocused()
})

test('mobile has no page-level horizontal overflow and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await createDocument(page, '# 宽度测试\n\n`averyveryveryveryveryverylongword`')

  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client)
  await expect(page.locator('.render-line')).toHaveCSS('animation-duration', '1e-05s')
})

test('mobile can switch theme and keeps it after reload', async ({ page }) => {
  await page.getByRole('button', { name: '切换深色主题' }).click()
  await expect(page.locator('.studio-shell')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('.studio-shell')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByRole('button', { name: '切换浅色主题' })).toBeVisible()
})
