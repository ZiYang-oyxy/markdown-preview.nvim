import { expect, test } from 'playwright/test'

async function pasteDocument(page, markdown) {
  await page.getByRole('button', { name: '粘贴新文档' }).first().click()
  const dialog = page.getByRole('dialog', { name: '粘贴 Markdown' })
  await dialog.getByLabel('Markdown 源文本').fill(markdown)
  await dialog.getByRole('button', { name: '渲染为新文档' }).click()
  await expect(dialog).toBeHidden()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('paste creates separate local documents and reload restores the active one', async ({ page }) => {
  const documentRail = page.getByRole('complementary', { name: '临时文档' })
  await expect(page.getByRole('heading', { name: '把 Markdown 变成舒适的阅读页面' })).toBeVisible()

  await pasteDocument(page, '# 第一份\n\n这是第一份。')
  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: '第一份' })).toBeVisible()
  await expect(documentRail.getByRole('button', { name: /第一份/ })).toBeVisible()

  await pasteDocument(page, '# 第二份\n\n这是第二份。')
  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: '第二份' })).toBeVisible()
  await expect(documentRail.getByRole('button', { name: /第一份/ })).toBeVisible()
  await expect(documentRail.getByRole('button', { name: /第二份/ })).toBeVisible()

  await documentRail.getByRole('button', { name: /第一份/ }).click()
  await expect(page.frameLocator('.preview-frame').getByText('这是第一份。')).toBeVisible()
  await page.reload()
  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: '第一份' })).toBeVisible()
})

test('source editing updates only the active document and deletion is confirmed', async ({ page }) => {
  const documentRail = page.getByRole('complementary', { name: '临时文档' })
  await pasteDocument(page, '# A\n\n原文 A')
  await pasteDocument(page, '# B\n\n原文 B')

  await page.getByRole('button', { name: '查看源文本' }).click()
  const sourceDialog = page.getByRole('dialog', { name: '查看或编辑源文本' })
  await sourceDialog.getByLabel('Markdown 源文本').fill('# B 已修改\n\n只改 B')
  await sourceDialog.getByRole('button', { name: '完成' }).click()

  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: 'B 已修改' })).toBeVisible()
  await documentRail.getByRole('button', { name: /^A/ }).click()
  await expect(page.frameLocator('.preview-frame').getByText('原文 A')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: '删除当前文档' }).click()
  await expect(documentRail.getByRole('button', { name: /^A/ })).toHaveCount(0)
  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: 'B 已修改' })).toBeVisible()
})

test('file import rejects invalid UTF-8 and accepts Markdown text', async ({ page }) => {
  const input = page.locator('input[type="file"]')
  await input.setInputFiles({
    name: 'invalid.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from([0xc3, 0x28]),
  })
  await expect(page.getByRole('alert')).toContainText('UTF-8')

  await input.setInputFiles({
    name: 'imported.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# 导入成功\n\n本地文件', 'utf8'),
  })
  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: '导入成功' })).toBeVisible()
})

test('theme, TOC, and cross-tab storage notification are wired', async ({ page }) => {
  await pasteDocument(page, '# 标题\n\n## 章节一\n\n内容')
  await expect(page.getByRole('button', { name: '跳转到章节一' })).toBeVisible()
  await page.getByRole('button', { name: '切换深色主题' }).click()
  await expect(page.locator('.studio-shell')).toHaveAttribute('data-theme', 'dark')

  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'mkdp-studio:index:v1' }))
  })
  await expect(page.getByRole('status')).toContainText('其他标签页')
})

test('a slower stale render cannot replace the newest document', async ({ page }) => {
  const diagrams = Array.from(
    { length: 20 },
    (_, index) => `\`\`\`mermaid\ngraph TD\n  A${index} --> B${index}\n\`\`\``,
  ).join('\n\n')
  await pasteDocument(page, `# 旧文档\n\n${diagrams}`)
  await pasteDocument(page, '# 最新文档\n\n只应显示这一份。')

  const preview = page.frameLocator('.preview-frame')
  await expect(preview.getByRole('heading', { name: '最新文档' })).toBeVisible()
  await page.waitForTimeout(1_000)
  await expect(preview.getByRole('heading', { name: '最新文档' })).toBeVisible()
  await expect(preview.getByRole('heading', { name: '旧文档' })).toHaveCount(0)
})
