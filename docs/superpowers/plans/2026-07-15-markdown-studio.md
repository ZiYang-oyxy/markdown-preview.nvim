# Markdown Studio Implementation Plan（已被安全静态版计划取代）

> 后继计划：`2026-07-15-markdown-studio-secure-static.md`。本文件保留用于记录原始设计演进，不再执行。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent `mkdp studio` workspace that turns pasted Markdown into locally persisted, switchable reading documents with Mermaid rendering on desktop and mobile.

**Architecture:** Add a standalone Studio shell around the existing preview iframe instead of creating a second Markdown renderer. The shell owns IndexedDB persistence, temporary-document navigation, responsive dialogs, and bridge messages; the existing preview page continues to own Markdown-it, Mermaid, KaTeX, TOC, themes, and HTML export.

**Tech Stack:** Node.js 16-compatible CommonJS, existing standalone HTTP/socket server, browser IndexedDB, React 16 preview page, Playwright, Node `assert` tests.

## Global Constraints

- Every paste creates a new document unless the user explicitly edits the current source.
- Documents remain local to browser IndexedDB database `mkdp-markdown-studio`, version `1`.
- The default surface is rendered reading mode; source editing is an on-demand Drawer/Sheet.
- Reuse the existing Markdown, Mermaid, KaTeX, highlighting, TOC, theme, and export pipeline.
- Keep the accepted colors exact: `#F6F8FB`, `#FFFFFF`, `#171A21`, `#697386`, `#DDE3EC`, `#1769E8`, `#208A55`.
- Desktop uses document rail, reading canvas, and TOC; `<768px` uses a single reading column and Sheets.
- Do not add a file tree, cloud account, remote storage, CDN, Monaco, or CodeMirror.
- Keep Node runtime code compatible with Node.js 16; use a UUID fallback when `crypto.randomUUID` is absent.
- Root runtime and packaged CLI runtime must expose equivalent Studio behavior.

---

## File Structure

- Create `scripts/lib/markdown-studio-shell.js`: Studio HTML/CSS/client-JS builder and server-testable title helper.
- Modify `scripts/lib/standalone-preview-server.js`: serve the Studio shell and retain Scratch compatibility.
- Modify `scripts/lib/standalone-preview-runtime.js`: start Studio sessions without Browser state.
- Create `scripts/mkdp-studio.js`: repository-local Studio launcher.
- Create `packages/cli/lib/studio-shell.js`: packaged copy of the shell module.
- Modify `packages/cli/lib/server.js` and `packages/cli/lib/runtime.js`: packaged route/runtime parity.
- Create `packages/cli/lib/commands/studio.js`: published CLI command.
- Modify `packages/cli/bin/mkdp.js`: register `mkdp studio`.
- Modify `app/pages/index.jsx`: harden and extend the Studio iframe bridge.
- Modify `package.json` and `README.md` / `README_zh.md`: expose the feature.
- Create `test/markdown-studio-shell.test.js`: helper, shell, route, and runtime tests.
- Create `test/markdown-studio.e2e.test.js`: persistence, switching, editing, Mermaid, and mobile flow.
- Modify `test/cli-package.test.js`: packaged CLI parity.

---

### Task 1: Studio shell contract and route

**Files:**
- Create: `scripts/lib/markdown-studio-shell.js`
- Modify: `scripts/lib/standalone-preview-server.js`
- Test: `test/markdown-studio-shell.test.js`

**Interfaces:**
- Produces: `extractStudioTitle(markdown, untitledIndex)` and `buildMarkdownStudioShellHtml(options)`.
- Consumes: existing `/page/1` preview iframe and `mkdp:set-content` bridge.

- [ ] **Step 1: Write failing helper and shell tests**

```js
const assert = require('assert')
const {
  buildMarkdownStudioShellHtml,
  extractStudioTitle
} = require('../scripts/lib/markdown-studio-shell')

assert.strictEqual(extractStudioTitle('# AI 工作流\n正文', 1), 'AI 工作流')
assert.strictEqual(extractStudioTitle('第一行\n第二行', 1), '第一行')
assert.strictEqual(extractStudioTitle('  \n', 3), '未命名文档 3')

const html = buildMarkdownStudioShellHtml({ origin: '' })
assert.match(html, /id="studio-shell"/)
assert.match(html, /id="document-list"/)
assert.match(html, /id="paste-dialog"/)
assert.match(html, /id="source-dialog"/)
assert.match(html, /id="preview-frame"/)
assert.match(html, /mkdp-markdown-studio/)
assert.match(html, /#1769E8/)
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/markdown-studio-shell.test.js`

Expected: FAIL with `Cannot find module '../scripts/lib/markdown-studio-shell'`.

- [ ] **Step 3: Implement the title helper and semantic shell skeleton**

```js
function extractStudioTitle(markdown, untitledIndex = 1) {
  const lines = String(markdown || '').split(/\r?\n/)
  const heading = lines.find((line) => /^#\s+\S/.test(line))
  const candidate = heading
    ? heading.replace(/^#\s+/, '')
    : lines.find((line) => line.trim())
  return candidate ? candidate.trim().slice(0, 120) : `未命名文档 ${untitledIndex}`
}

function buildMarkdownStudioShellHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>Markdown Studio</title>
  <style>
    :root { --canvas:#F6F8FB;--paper:#FFFFFF;--ink:#171A21;--muted:#697386;--rule:#DDE3EC;--blue:#1769E8;--green:#208A55; }
    * { box-sizing:border-box; }
    html,body { height:100%;margin:0; }
    body { color:var(--ink);background:var(--canvas);font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif; }
    .studio-shell { display:grid;grid-template:58px minmax(0,1fr)/260px minmax(0,1fr) 220px;height:100%; }
    .studio-header { grid-column:1/-1;display:flex;align-items:center;border-bottom:1px solid var(--rule);background:var(--paper); }
    #document-rail,#toc-rail { min-width:0;background:var(--canvas); }
    #reading-workspace { min-width:0;background:var(--paper); }
    #preview-frame { width:100%;height:100%;border:0; }
    @media (max-width:1179px) { #document-rail { position:fixed;inset:58px auto 0 0;width:280px;transform:translateX(-100%); } }
    @media (max-width:767px) { .studio-shell { grid-template:54px minmax(0,1fr)/1fr; } #toc-rail { display:none; } }
  </style>
</head>
<body>
  <div id="studio-shell" class="studio-shell">
    <header class="studio-header">
      <button id="open-documents-btn" type="button" aria-label="打开临时文档">☰</button>
      <strong>Markdown Studio</strong>
      <span id="storage-status" role="status">已保存到本地</span>
    </header>
    <aside id="document-rail" aria-label="临时文档">
      <h2>临时文档</h2>
      <nav id="document-list" aria-label="临时文档列表"></nav>
      <button id="new-document-btn" type="button">＋ 粘贴新文档</button>
    </aside>
    <main id="reading-workspace">
      <div id="document-toolbar" aria-label="文档工具">
        <button id="source-btn" type="button">查看源文</button>
        <button id="copy-btn" type="button">复制 Markdown</button>
        <button id="export-btn" type="button">导出 HTML</button>
      </div>
      <section id="empty-state">
        <h1>粘贴 Markdown，立即阅读</h1>
        <button id="empty-paste-btn" type="button">从剪贴板粘贴</button>
        <button id="empty-import-btn" type="button">导入 .md 文件</button>
      </section>
      <iframe id="preview-frame" title="Markdown 阅读视图" src="/page/1"></iframe>
    </main>
    <aside id="toc-rail" aria-label="本页目录"><h2>本页目录</h2><nav id="studio-toc"></nav></aside>
  </div>
  <dialog id="paste-dialog" aria-labelledby="paste-title">
    <form method="dialog"><button type="submit" aria-label="关闭粘贴新文档">×</button></form>
    <h2 id="paste-title">粘贴新文档</h2>
    <textarea id="paste-input" placeholder="在这里粘贴 Markdown 源文本"></textarea>
    <p>支持 Mermaid · 代码高亮 · KaTeX</p>
    <input id="markdown-file-input" type="file" accept=".md,.markdown,.mdown,.mkd,.mkdn,.mdx,text/markdown">
    <button id="create-document-btn" type="button" disabled>创建并渲染</button>
    <p>将创建新的临时文档</p>
  </dialog>
  <dialog id="source-dialog" aria-labelledby="source-title">
    <h2 id="source-title">查看源文</h2>
    <textarea id="source-input"></textarea>
    <button id="close-source-btn" type="button">返回阅读</button>
  </dialog>
</body>
</html>`
}

module.exports = { buildMarkdownStudioShellHtml, extractStudioTitle }
```

Before completing this step, replace text glyph placeholders such as `☰` and `×` with inline SVGs that use `currentColor`, add visible focus styles, and keep the IDs and copy above unchanged; behavior is added in Task 2.

- [ ] **Step 4: Register Studio and Scratch-compatible routes**

```js
const { buildMarkdownStudioShellHtml } = require('./markdown-studio-shell')

if (
  pathname === '/_mkdp/studio' || pathname === '/_mkdp/studio/' ||
  pathname === '/_mkdp/scratch' || pathname === '/_mkdp/scratch/'
) {
  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.end(buildMarkdownStudioShellHtml())
  return
}
```

Remove `buildScratchShellHtml` only after all imports/tests use the new builder; export `buildMarkdownStudioShellHtml` from the server for compatibility tests.

- [ ] **Step 5: Add a route test and run it**

Extend `test/markdown-studio-shell.test.js` to start `startStandalonePreviewServer` without `browseRoot`, request both routes, and assert status `200` plus `id="studio-shell"`.

Run: `node test/markdown-studio-shell.test.js`

Expected: PASS and `markdown-studio-shell tests: ok`.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/markdown-studio-shell.js scripts/lib/standalone-preview-server.js test/markdown-studio-shell.test.js
git commit -m "feat(studio): add standalone workspace shell"
```

---

### Task 2: IndexedDB documents and paste-first interactions

**Files:**
- Modify: `scripts/lib/markdown-studio-shell.js`
- Modify: `test/markdown-studio-shell.test.js`
- Create: `test/markdown-studio.e2e.test.js`

**Interfaces:**
- Produces client functions `openStudioDatabase`, `listDocuments`, `putDocument`, `deleteDocument`, `createDocumentFromMarkdown`, and `selectDocument` inside the shell.
- Produces DOM contract IDs used by later tests: `new-document-btn`, `paste-input`, `create-document-btn`, `source-input`, `document-list`, `preview-frame`, `storage-status`.

- [ ] **Step 1: Write a failing first-document E2E test**

```js
await page.goto(`${server.origin}/_mkdp/studio`)
await page.getByRole('button', { name: '粘贴新文档' }).click()
await page.locator('#paste-input').fill('# AI 工作流指南\n\n正文')
await page.getByRole('button', { name: '创建并渲染' }).click()
await page.frameLocator('#preview-frame').getByRole('heading', {
  name: 'AI 工作流指南'
}).waitFor()
await assert.strictEqual(page.locator('[data-document-id]').count(), 1)
```

- [ ] **Step 2: Run the E2E test to verify it fails**

Run: `node test/markdown-studio.e2e.test.js`

Expected: FAIL because the new-document interaction does not create a persisted document.

- [ ] **Step 3: Implement IndexedDB with explicit memory fallback**

```js
var DB_NAME = 'mkdp-markdown-studio'
var DB_VERSION = 1
var DOCUMENTS_STORE = 'documents'
var PREFERENCES_STORE = 'preferences'

function openStudioDatabase() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = function () {
      var db = request.result
      if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        var documents = db.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' })
        documents.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(PREFERENCES_STORE)) {
        db.createObjectStore(PREFERENCES_STORE, { keyPath: 'key' })
      }
    }
    request.onsuccess = function () { resolve(request.result) }
    request.onerror = function () { reject(request.error) }
  })
}
```

Wrap store operations in Promises. On initialization failure, switch to an in-memory `Map`, set `storage-status` to `仅当前会话保存`, and retain all current-session behavior.

- [ ] **Step 4: Implement document creation, selection, rendering, and title rules**

```js
function createDocumentFromMarkdown(markdown) {
  var now = Date.now()
  var documentRecord = {
    id: createStudioId(),
    title: extractStudioTitle(markdown, state.documents.length + 1),
    titleMode: 'auto',
    markdown: markdown,
    createdAt: now,
    updatedAt: now
  }
  return putDocument(documentRecord).then(function () {
    return selectDocument(documentRecord.id)
  })
}
```

`selectDocument` must update `activeDocumentId`, render the sorted list, send only the latest pending content after iframe load, persist the active ID, close the paste dialog, and restore the selected row focus.

- [ ] **Step 5: Add paste, Clipboard API, drag/drop, and `.md` import flows**

Use one `createDocumentFromMarkdown` entry point. Reject empty content. Accept `.md`, `.markdown`, `.mdown`, `.mkd`, `.mkdn`, `.mdx`, and `text/markdown`; read as UTF-8 text. Clipboard denial must focus `paste-input` and display `请按 Cmd/Ctrl+V 粘贴 Markdown`.

- [ ] **Step 6: Verify creation and multiple-document switching**

Extend E2E to create “第一份” and “第二份”, assert two list rows, switch to the first row, and assert the iframe contains “第一份” and not “第二份”.

Run: `node test/markdown-studio.e2e.test.js`

Expected: PASS for first creation, second creation, and switching.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/markdown-studio-shell.js test/markdown-studio-shell.test.js test/markdown-studio.e2e.test.js
git commit -m "feat(studio): persist pasted markdown documents"
```

---

### Task 3: Reading tools, source editing, TOC, and secure bridge

**Files:**
- Modify: `scripts/lib/markdown-studio-shell.js`
- Modify: `app/pages/index.jsx`
- Modify: `test/markdown-studio.e2e.test.js`

**Interfaces:**
- Consumes: preview messages `mkdp:set-content`, `mkdp:set-theme`, `mkdp:scroll-to`, `mkdp:export`.
- Produces: secure same-origin messages and current preview state/TOC back to the shell.

- [ ] **Step 1: Write failing source-edit and Mermaid assertions**

```js
await createDocument(page, [
  '# Diagram', '', '```mermaid', 'flowchart TD', 'A --> B', '```'
].join('\n'))
await page.frameLocator('#preview-frame').locator('.mermaid svg').waitFor()
await page.getByRole('button', { name: '查看源文' }).click()
await page.locator('#source-input').fill('# Updated\n\nNew body')
await page.frameLocator('#preview-frame').getByRole('heading', { name: 'Updated' }).waitFor()
await page.reload()
await page.frameLocator('#preview-frame').getByRole('heading', { name: 'Updated' }).waitFor()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/markdown-studio.e2e.test.js`

Expected: FAIL because source Drawer editing and persistence are not wired.

- [ ] **Step 3: Secure the iframe message bridge**

In both parent and preview page:

```js
if (event.origin !== window.location.origin) {
  return
}
```

Replace `postMessage(payload, '*')` with:

```js
previewFrame.contentWindow.postMessage(payload, window.location.origin)
```

Retain same-origin operation for Browser and Studio and add a preview test proving a foreign-origin synthetic message is ignored.

- [ ] **Step 4: Implement source Drawer/Sheet editing**

Opening copies the selected document Markdown into `source-input`. On input, debounce 250ms, update `updatedAt`, persist, rerender the list, and send content. Manual renaming sets `titleMode: 'manual'`; otherwise update an auto title after source edits. Capture iframe scroll before opening and restore it after closing.

- [ ] **Step 5: Wire TOC, theme, copy, export, delete, and Mermaid zoom**

- Render preview `tocItems` messages into `#studio-toc` and send `mkdp:scroll-to` on click.
- Toggle theme through `mkdp:set-theme`, persist the preference, and update shell tokens.
- Copy exact current Markdown through `navigator.clipboard.writeText` with a textarea fallback.
- Trigger existing standalone export with `mkdp:export`.
- Confirm delete in a semantic dialog, then select the next most recently updated document.
- Open Mermaid SVG in a full-screen dialog; provide `放大`, `缩小`, `适应屏幕`, and `关闭`, without altering the original rendered diagram.

- [ ] **Step 6: Run focused preview and Studio tests**

Run: `node test/markdown-studio.e2e.test.js`

Expected: PASS for Mermaid, source persistence, TOC, copy, delete, and theme cases.

Run: `node scripts/mkdp-test-preview.js`

Expected: existing preview suite PASS, including Mermaid theme and export cases.

- [ ] **Step 7: Rebuild preview assets if `app/pages/index.jsx` changed**

Run: `yarn build-app`

Expected: exit `0`; regenerated app/dist preview assets contain the same-origin bridge guard.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/markdown-studio-shell.js app/pages/index.jsx app/out dist/web test/markdown-studio.e2e.test.js
git commit -m "feat(studio): add reading and source tools"
```

---

### Task 4: Responsive visual implementation and fidelity pass

**Files:**
- Modify: `scripts/lib/markdown-studio-shell.js`
- Modify: `test/markdown-studio.e2e.test.js`

**Interfaces:**
- Consumes: accepted desktop/mobile concepts and exact token system.
- Produces: desktop three-region layout, tablet drawers, mobile single-column Sheets, and the render-line transition.

- [ ] **Step 1: Add failing responsive assertions**

```js
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${server.origin}/_mkdp/studio`)
assert.strictEqual(await page.locator('#document-rail').evaluate((el) => {
  return getComputedStyle(el).position
}), 'fixed')
assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth), 390)
await page.getByRole('button', { name: '打开临时文档' }).click()
await expect(page.locator('#document-rail')).toHaveAttribute('data-open', 'true')
```

- [ ] **Step 2: Run the mobile test to verify it fails**

Run: `node test/markdown-studio.e2e.test.js --mobile`

Expected: FAIL on drawer layout or horizontal overflow.

- [ ] **Step 3: Implement the exact visual system**

Define the accepted tokens as CSS custom properties and use them everywhere. Desktop grid is `260px minmax(0, 1fr) 220px` at `>=1180px`; tablet hides the document rail in a Drawer; mobile `<768px` hides both rails and uses full-screen Sheets. Reading content is centered with `max-width:860px`. Code, tables, and Mermaid containers own their overflow.

- [ ] **Step 4: Implement one signature motion and reduced-motion behavior**

Use the 2px Render Blue line on the selected document and a single 180ms transition when a pasted document becomes active. Do not animate unrelated cards or controls.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 5: Capture desktop and mobile screenshots**

Run the Studio server and capture:

- Desktop: `1536x1024` to `test/artifacts/markdown-studio-desktop.png`.
- Mobile reading: `390x844` to `test/artifacts/markdown-studio-mobile-reading.png`.
- Mobile paste: `390x844` to `test/artifacts/markdown-studio-mobile-paste.png`.

Inspect all three against `docs/superpowers/assets/markdown-studio/desktop-concept.png` and `mobile-concept.png`; fix layout, typography, palette, overflow, and control-density drift before proceeding.

- [ ] **Step 6: Run responsive E2E**

Run: `node test/markdown-studio.e2e.test.js`

Expected: PASS at desktop and 390px viewports with no horizontal page overflow.

- [ ] **Step 7: Commit**

```bash
git add scripts/lib/markdown-studio-shell.js test/markdown-studio.e2e.test.js test/artifacts/markdown-studio-*.png
git commit -m "style(studio): implement responsive reading workspace"
```

---

### Task 5: Root runtime and published CLI command

**Files:**
- Modify: `scripts/lib/standalone-preview-runtime.js`
- Create: `scripts/mkdp-studio.js`
- Modify: `package.json`
- Create: `packages/cli/lib/studio-shell.js`
- Modify: `packages/cli/lib/server.js`
- Modify: `packages/cli/lib/runtime.js`
- Create: `packages/cli/lib/commands/studio.js`
- Modify: `packages/cli/bin/mkdp.js`
- Modify: `test/cli-package.test.js`

**Interfaces:**
- Produces: `createStandaloneStudioSession(cliConfig)` in both runtimes.
- Produces: `npm run studio` and `mkdp studio [options]`.

- [ ] **Step 1: Write failing runtime and CLI tests**

```js
assert.match(help.stdout, /studio\s+Open the temporary Markdown workspace/)

const { createStandaloneStudioSession } = require('../packages/cli/lib/runtime')
const session = await createStandaloneStudioSession({ theme: 'light' })
const response = await requestText(`${session.origin}/_mkdp/studio`)
assert.strictEqual(response.statusCode, 200)
assert.match(response.body, /id="studio-shell"/)
await session.close()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node test/cli-package.test.js`

Expected: FAIL because `studio` and `createStandaloneStudioSession` are absent.

- [ ] **Step 3: Add the root Studio session and launcher**

```js
async function createStandaloneStudioSession(cliConfig = {}) {
  const fileConfig = await loadConfig(cliConfig.config || '')
  const merged = mergeConfig(cliConfig, fileConfig)
  const server = await startStandalonePreviewServer({
    cwd: process.cwd(),
    fileDir: process.cwd(),
    imagesPath: merged.imagesPath,
    markdownCss: merged.markdownCss,
    highlightCss: merged.highlightCss,
    pageTitle: merged.pageTitle,
    previewOptions: merged.previewOptions,
    theme: merged.theme,
    name: 'Markdown Studio',
    contentLines: []
  })
  return { merged, origin: server.origin, close: () => server.close() }
}
```

`scripts/mkdp-studio.js` follows the existing browse launcher but opens `/_mkdp/studio`. Add `"studio": "node ./scripts/mkdp-studio.js"` to root scripts.

- [ ] **Step 4: Add packaged CLI parity**

Copy the completed shell module to `packages/cli/lib/studio-shell.js`, wire the same route into `packages/cli/lib/server.js`, add the runtime function, and create `commands/studio.js` with options `--config`, `--theme`, `--page-title`, `--markdown-css`, `--highlight-css`, `--images-path`, and `--browser`.

Update help and dispatch:

```js
if (command === 'studio') {
  await require('../lib/commands/studio').run(argv.slice(3))
  return 0
}
```

- [ ] **Step 5: Run CLI and route regression tests**

Run: `node test/cli-package.test.js && node test/scratch-route.test.js && node test/browse-fixed-toc-sidebar.test.js`

Expected: all PASS; Scratch compatibility and Browser remain available.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/standalone-preview-runtime.js scripts/mkdp-studio.js package.json packages/cli/lib/studio-shell.js packages/cli/lib/server.js packages/cli/lib/runtime.js packages/cli/lib/commands/studio.js packages/cli/bin/mkdp.js test/cli-package.test.js
git commit -m "feat(cli): add markdown studio command"
```

---

### Task 6: Documentation and final verification

**Files:**
- Modify: `README.md`
- Modify: `README_zh.md`
- Modify: `docs/superpowers/specs/2026-07-15-markdown-studio-design.md`

**Interfaces:**
- Documents: install/run commands, local-only privacy, supported Markdown features, persistence, and limitations.

- [ ] **Step 1: Document the user workflow**

Add concise sections containing:

```bash
# repository checkout
npm run studio

# published toolbox
mkdp studio
```

Explain that each paste creates a new local document, data stays in that browser, clearing site data removes it, and relative local image paths from pasted Markdown are not portable unless an image base path is configured.

- [ ] **Step 2: Run all relevant Node tests**

Run:

```bash
node test/markdown-studio-shell.test.js
node test/markdown-studio.e2e.test.js
node test/cli-package.test.js
node test/scratch-route.test.js
node test/browse-fixed-toc-sidebar.test.js
node test/browse-service.test.js
node test/runtime-asset-layout.test.js
```

Expected: all commands exit `0`.

- [ ] **Step 3: Run build and preview regression verification**

Run: `npm run build-lib`

Expected: TypeScript build exits `0`.

Run: `node scripts/mkdp-test-preview.js`

Expected: preview, Mermaid, theme, and standalone export tests PASS.

- [ ] **Step 4: Perform final visual and accessibility review**

Verify desktop `1536x1024`, tablet `1024x768`, and mobile `390x844`; inspect focus order, dialog focus trap, Escape behavior, reduced motion, light/dark contrast, Mermaid zoom, empty state, storage fallback, and delete confirmation. Record any intentional design deviation in the final handoff; otherwise fix it.

- [ ] **Step 5: Commit**

```bash
git add README.md README_zh.md docs/superpowers/specs/2026-07-15-markdown-studio-design.md
git commit -m "docs(studio): document temporary markdown workspace"
```
