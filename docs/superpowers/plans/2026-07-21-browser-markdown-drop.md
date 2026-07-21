# Browser Markdown Drop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users drag one local `.md` file anywhere onto the Markdown Preview Web app and immediately create and render it as a local document.

**Architecture:** Extract the Web app's existing size and UTF-8 file-reading rules into a small module, then reuse that module from both the file picker and a new window-level drop controller in `App`. A transient full-viewport overlay provides drag feedback, while existing `createDocument`, `PreviewPane`, TOC, alert, and `localStorage` behavior remain the only persistence and rendering paths.

**Tech Stack:** React 19, browser File/DataTransfer APIs, Vitest 4, Playwright 1.59, Vite 8, existing CSS theme variables.

## Global Constraints

- Accept exactly one dropped file whose name ends in `.md`, case-insensitively.
- Keep the existing 1 MiB per-document limit and strict UTF-8 validation.
- Do not upload files or add dependencies.
- Do not resolve relative images, accept directories, accept multiple files, or accept `.markdown` through drag and drop.
- Invalid drops must preserve the active document and use the existing dismissible alert.
- The existing file picker remains compatible with its current accepted file types.

---

### Task 1: Shared Markdown File Validation And Reading

**Files:**
- Create: `preview/src/markdown-file.js`
- Create: `preview/src/markdown-file.test.js`
- Modify: `preview/src/App.jsx:11-21,161-173`

**Interfaces:**
- Produces: `getDroppedMarkdownFile(files: FileList | File[]) => File`, throwing a user-facing `Error` for zero, multiple, or non-`.md` files.
- Produces: `readMarkdownFile(file: File) => Promise<string>`, enforcing 1 MiB and strict UTF-8 decoding with stable user-facing errors.
- Consumes: `File#size`, `File#name`, and `File#arrayBuffer()`.

- [ ] **Step 1: Write failing helper tests**

Create `preview/src/markdown-file.test.js`:

```js
import { describe, expect, it } from 'vitest'

import { getDroppedMarkdownFile, readMarkdownFile } from './markdown-file.js'

function fakeFile(name, bytes, overrides = {}) {
  const buffer = Uint8Array.from(bytes).buffer
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => buffer,
    ...overrides,
  }
}

describe('Markdown file import', () => {
  it('accepts exactly one case-insensitive .md drop', () => {
    const lower = fakeFile('notes.md', [])
    const upper = fakeFile('NOTES.MD', [])
    expect(getDroppedMarkdownFile([lower])).toBe(lower)
    expect(getDroppedMarkdownFile([upper])).toBe(upper)
  })

  it('rejects missing, multiple, and non-.md drops', () => {
    expect(() => getDroppedMarkdownFile([])).toThrow('请拖入一个 .md 文件。')
    expect(() => getDroppedMarkdownFile([
      fakeFile('a.md', []),
      fakeFile('b.md', []),
    ])).toThrow('一次只能拖入一个 .md 文件。')
    expect(() => getDroppedMarkdownFile([fakeFile('notes.markdown', [])]))
      .toThrow('仅支持 .md 文件。')
  })

  it('reads valid UTF-8 and preserves the size limit', async () => {
    const bytes = [...new TextEncoder().encode('# 拖入成功')]
    await expect(readMarkdownFile(fakeFile('notes.md', bytes)))
      .resolves.toBe('# 拖入成功')
    await expect(readMarkdownFile(fakeFile('large.md', [], { size: 1024 * 1024 + 1 })))
      .rejects.toThrow('单份文档不能超过 1 MiB。')
  })

  it('reports invalid UTF-8 and file read failures', async () => {
    await expect(readMarkdownFile(fakeFile('invalid.md', [0xc3, 0x28])))
      .rejects.toThrow('文件不是有效的 UTF-8 文本。')
    await expect(readMarkdownFile(fakeFile('broken.md', [], {
      arrayBuffer: async () => { throw new Error('disk error') },
    }))).rejects.toThrow('无法读取文件。')
  })
})
```

- [ ] **Step 2: Run the helper test and verify RED**

Run: `npm --prefix preview test -- --run src/markdown-file.test.js`

Expected: FAIL because `preview/src/markdown-file.js` does not exist.

- [ ] **Step 3: Implement the minimal helper**

Create `preview/src/markdown-file.js`:

```js
const MAX_MARKDOWN_FILE_BYTES = 1024 * 1024
const MARKDOWN_EXTENSION = /\.md$/i

export function getDroppedMarkdownFile(files) {
  const dropped = Array.from(files ?? [])
  if (dropped.length === 0) throw new Error('请拖入一个 .md 文件。')
  if (dropped.length > 1) throw new Error('一次只能拖入一个 .md 文件。')
  if (!MARKDOWN_EXTENSION.test(dropped[0].name)) throw new Error('仅支持 .md 文件。')
  return dropped[0]
}

export async function readMarkdownFile(file) {
  if (file.size > MAX_MARKDOWN_FILE_BYTES) {
    throw new Error('单份文档不能超过 1 MiB。')
  }

  let buffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    throw new Error('无法读取文件。')
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw new Error('文件不是有效的 UTF-8 文本。')
  }
}
```

- [ ] **Step 4: Run the helper test and verify GREEN**

Run: `npm --prefix preview test -- --run src/markdown-file.test.js`

Expected: PASS with 4 tests.

- [ ] **Step 5: Refactor the existing picker to use the helper**

Import `readMarkdownFile` in `preview/src/App.jsx` and replace the duplicated size/decode block in `importFile`:

```js
import { readMarkdownFile } from './markdown-file.js'

async function importFile(event) {
  const [file] = event.target.files
  event.target.value = ''
  if (!file) return
  try {
    const markdown = await readMarkdownFile(file)
    const createError = create(markdown)
    if (!createError) setPasteOpen(false)
  } catch (error) {
    setAlert(error.message)
  }
}
```

- [ ] **Step 6: Verify helper and existing picker behavior**

Run: `npm --prefix preview test -- --run src/markdown-file.test.js && npm --prefix preview run test:e2e -- --grep "file import rejects"`

Expected: both commands PASS; the existing invalid UTF-8 and valid picker import assertions remain green.

- [ ] **Step 7: Commit the shared import path**

```bash
git add preview/src/markdown-file.js preview/src/markdown-file.test.js preview/src/App.jsx
git commit -m "refactor(preview): share markdown file reader"
```

### Task 2: Full-Viewport Markdown Drop Interaction

**Files:**
- Modify: `preview/e2e/workflow.spec.js`
- Modify: `preview/src/App.jsx:80-335`
- Modify: `preview/src/styles.css:93-108`

**Interfaces:**
- Consumes: `getDroppedMarkdownFile(files)` and `readMarkdownFile(file)` from Task 1.
- Produces: window-level file drag handlers with overlay state and an async drop-to-document flow.
- Produces: `.file-drop-overlay`, visible only during an external file drag.

- [ ] **Step 1: Write the failing browser interaction test**

Append to `preview/e2e/workflow.spec.js`:

```js
test('dragging one .md file onto the page creates and renders a local document', async ({ page }) => {
  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(
      ['# 拖入成功\n\n## 拖入章节\n\n文件正文'],
      'dragged.md',
      { type: 'text/markdown' },
    ))
    window.__markdownDropTransfer = transfer
    window.dispatchEvent(new DragEvent('dragenter', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }))
  })

  await expect(page.getByRole('status', { name: '松开以预览 Markdown' })).toBeVisible()

  await page.evaluate(() => {
    window.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: window.__markdownDropTransfer,
    }))
    delete window.__markdownDropTransfer
  })

  await expect(page.getByRole('status', { name: '松开以预览 Markdown' })).toHaveCount(0)
  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: '拖入成功' })).toBeVisible()
  await expect(page.frameLocator('.preview-frame').getByText('文件正文')).toBeVisible()
  await expect(page.getByRole('button', { name: '跳转到拖入章节' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: '临时文档' })
    .getByRole('button', { name: /拖入成功/ })).toBeVisible()
})
```

- [ ] **Step 2: Run the browser test and verify RED**

Run: `npm --prefix preview run test:e2e -- --grep "dragging one .md"`

Expected: FAIL because the drop overlay and handlers do not exist.

- [ ] **Step 3: Add drop state and window lifecycle handlers**

In `preview/src/App.jsx`, import `getDroppedMarkdownFile`, add `dropActive` state and a drag-depth ref, then register handlers in an effect:

```js
import { getDroppedMarkdownFile, readMarkdownFile } from './markdown-file.js'

const [dropActive, setDropActive] = useState(false)
const dragDepthRef = useRef(0)

useEffect(() => {
  const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

  const onDragEnter = (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setDropActive(true)
  }
  const onDragOver = (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }
  const onDragLeave = (event) => {
    if (!hasFiles(event)) return
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setDropActive(false)
  }
  const onDrop = async (event) => {
    if (!hasFiles(event)) return
    event.preventDefault()
    dragDepthRef.current = 0
    setDropActive(false)
    try {
      const file = getDroppedMarkdownFile(event.dataTransfer.files)
      await createFromFile(file)
    } catch (error) {
      setAlert(error.message)
    }
  }

  window.addEventListener('dragenter', onDragEnter)
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('dragleave', onDragLeave)
  window.addEventListener('drop', onDrop)
  return () => {
    window.removeEventListener('dragenter', onDragEnter)
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('dragleave', onDragLeave)
    window.removeEventListener('drop', onDrop)
  }
}, [createFromFile])
```

Extract the picker body into a memoized `createFromFile` callback so the picker and drop paths share document creation:

```js
const createFromFile = useCallback(async (file) => {
  try {
    const markdown = await readMarkdownFile(file)
    const createError = create(markdown)
    if (!createError) setPasteOpen(false)
    return createError
  } catch (error) {
    setAlert(error.message)
    return error.message
  }
}, [create])
```

Make `create` a `useCallback` with `[refresh]`, and have `importFile` call `await createFromFile(file)`. Keep all hooks unconditional and before `const active = workspace.document`.

- [ ] **Step 4: Render accessible drag feedback**

Inside `.preview-shell`, immediately after the skip link, render:

```jsx
{dropActive ? (
  <div className="file-drop-overlay" role="status" aria-label="松开以预览 Markdown">
    <span aria-hidden="true">M↓</span>
    <strong>松开以预览 Markdown</strong>
    <small>仅支持单个 .md 文件</small>
  </div>
) : null}
```

- [ ] **Step 5: Style the full-viewport overlay**

Add to `preview/src/styles.css` after `.preview-shell[data-theme="dark"]`:

```css
.file-drop-overlay {
  position: fixed;
  z-index: 80;
  inset: 12px;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  border: 2px dashed var(--blue);
  color: var(--ink);
  background: color-mix(in srgb, var(--paper) 92%, transparent);
  backdrop-filter: blur(10px);
  pointer-events: none;
}

.file-drop-overlay > span {
  color: var(--blue);
  font-size: 42px;
  font-weight: 800;
}

.file-drop-overlay > strong {
  font-size: 20px;
}

.file-drop-overlay > small {
  color: var(--muted);
}
```

- [ ] **Step 6: Run the browser test and verify GREEN**

Run: `npm --prefix preview run test:e2e -- --grep "dragging one .md"`

Expected: PASS; overlay appears during drag and disappears after the new document, preview heading/body, TOC, and document rail appear.

- [ ] **Step 7: Add invalid-drop regression assertions**

Append this second test to `preview/e2e/workflow.spec.js`:

```js
test('invalid Markdown drops keep the active document unchanged', async ({ page }) => {
  await pasteDocument(page, '# 保留原文\n\n不能被非法拖入覆盖。')

  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['# Wrong'], 'notes.markdown', { type: 'text/markdown' }))
    window.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }))
  })
  await expect(page.getByRole('alert')).toContainText('仅支持 .md 文件。')
  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: '保留原文' })).toBeVisible()

  await page.getByRole('button', { name: '关闭提示' }).click()
  await page.evaluate(() => {
    const transfer = new DataTransfer()
    transfer.items.add(new File(['# A'], 'a.md', { type: 'text/markdown' }))
    transfer.items.add(new File(['# B'], 'b.md', { type: 'text/markdown' }))
    window.dispatchEvent(new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: transfer,
    }))
  })
  await expect(page.getByRole('alert')).toContainText('一次只能拖入一个 .md 文件。')
  await expect(page.frameLocator('.preview-frame').getByRole('heading', { name: '保留原文' })).toBeVisible()
})
```

- [ ] **Step 8: Run the interaction tests**

Run: `npm --prefix preview run test:e2e -- --grep "drop|dragging"`

Expected: PASS for valid, wrong-extension, and multiple-file behavior.

- [ ] **Step 9: Commit the drop interaction**

```bash
git add preview/src/App.jsx preview/src/styles.css preview/e2e/workflow.spec.js
git commit -m "feat(preview): render dropped markdown files"
```

### Task 3: Full Regression And Rendered QA

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed helper, App interaction, CSS, and Playwright coverage from Tasks 1-2.
- Produces: verification evidence for unit behavior, production build, desktop drag interaction, responsive layout, and console health.

- [ ] **Step 1: Run unit tests**

Run: `npm --prefix preview test`

Expected: all Vitest suites PASS with no unhandled errors.

- [ ] **Step 2: Run the full browser suite**

Run: `npm --prefix preview run test:e2e`

Expected: all Playwright tests PASS.

- [ ] **Step 3: Build the production Web app**

Run: `npm --prefix preview run build`

Expected: both Vite application and preview-frame builds complete successfully.

- [ ] **Step 4: Perform Browser-plugin rendered QA**

Use the in-app Browser skill against the Vite preview URL. Verify page title and URL, meaningful DOM, no framework overlay, no relevant console warnings/errors, the drag overlay screenshot, the valid `.md` drop state, and one 390x844 mobile viewport without clipping or horizontal overflow.

- [ ] **Step 5: Check final diff hygiene**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intentional implementation or generated build changes remain.
