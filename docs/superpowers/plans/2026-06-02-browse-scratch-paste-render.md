# Browse Scratch 粘贴渲染页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 browse 新增独立路由 `/_mkdp/scratch` —— 一个左 textarea / 右预览 iframe 的草稿页,把粘贴的 markdown 文本通过 postMessage 实时渲染成 HTML,完全复用现有预览管线。

**Architecture:** 新增服务器路由返回一个内联 CSS/JS 的 Scratch Shell 页面(`buildScratchShellHtml`),其右侧 iframe 加载现有预览页 `/page/1`。textarea 输入防抖后通过 `postMessage({type:'mkdp:set-content', content})` 推给 iframe;预览页 `handleParentMessage` 新增 `mkdp:set-content` 分支,把文本喂进既有的 `onRefreshContent` 渲染入口。改完预览页源码后重新构建 Next.js 产物(`yarn build-app` 自动同步 `dist/` 并 git add)。

**Tech Stack:** Node http server、socket.io(已有)、Next.js 7 预览页(`app/pages/index.jsx`)、markdown-it/mermaid/katex 渲染链(已有)、Playwright(测试)。

**规格:** `docs/superpowers/specs/2026-06-02-browse-scratch-paste-render-design.md`

---

## 文件结构

| 文件 | 职责 | 改动类型 |
| --- | --- | --- |
| `app/pages/index.jsx` | 预览页;`handleParentMessage` 新增 `mkdp:set-content` 分支 | Modify |
| `scripts/lib/standalone-preview-server.js` | 新增 `/_mkdp/scratch` 路由 + `buildScratchShellHtml` + 导出 | Modify |
| `test/scratch-route.test.js` | 验证路由返回与 shell 结构 | Create |
| `test/scratch-render.e2e.test.js` | Playwright 端到端渲染验证 | Create |
| `app/out/`、`dist/web/` | Next 构建产物(由 `yarn build-app` 生成并 git add) | 构建产物 |

---

### Task 1: 预览页新增 `mkdp:set-content` 分支

**Goal:** 让预览页(iframe)能接收父页面通过 postMessage 推来的任意 markdown 文本并用既有渲染入口渲染。

**Files:**
- Modify: `app/pages/index.jsx`(`handleParentMessage`,约 469-500 行;插入到 `mkdp:export` 分支之后、方法结尾之前)

**Acceptance Criteria:**
- [ ] `handleParentMessage` 收到 `{type:'mkdp:set-content', content}` 时调用 `onRefreshContent` 渲染。
- [ ] `content` 同时支持字符串(自动按行切分)和字符串数组两种形态。
- [ ] 传入 `onRefreshContent` 的 payload 含 `cursor`(数组)、`name`、`options`、`isActive` 等必需字段,不抛 `cursor is undefined` 之类错误。
- [ ] 既有分支(`scroll-to`/`set-theme`/`set-mermaid-theme`/`export`)行为不变。

**Verify:** 构建后(Task 4)由 Task 5 的 Playwright 测试覆盖;本任务先做静态自检 `node -e "require('@babel/core')"` 不适用,改为人工核对分支插入位置正确。

**Steps:**

- [ ] **Step 1: 阅读现有 `handleParentMessage`**

确认其结构(`app/pages/index.jsx` 约 469-500 行):依次是 `mkdp:scroll-to`、`mkdp:set-theme`、`mkdp:set-mermaid-theme`、`mkdp:export` 四个 `if (event.data.type === ...) { ...; return }` 分支,方法以最后一个 `return` 收尾。

- [ ] **Step 2: 在 `mkdp:export` 分支之后插入新分支**

在 `handleParentMessage` 内,`mkdp:export` 分支的闭合 `}` 之后、`mkdp:set-content`:

```jsx
    if (event.data.type === 'mkdp:set-content') {
      const raw = event.data.content
      const content = Array.isArray(raw)
        ? raw
        : String(raw == null ? '' : raw).split(/\r?\n/)
      this.onRefreshContent({
        options: this.currentRefreshOptions || {},
        isActive: true,
        winline: 1,
        winheight: 1,
        cursor: [0, 1, 1, 0],
        pageTitle: '',
        theme: this.state.theme || 'light',
        name: 'scratch',
        content
      })
      return
    }
```

说明:`cursor` 必须是数组(`onRefreshContent` 内部用 `cursor[1]`);`options` 给空对象即可(其内部均有默认值);`name: 'scratch'` 会被 `onRefreshContent` 内部的文件名解析逻辑处理为标题 `scratch`。`this.currentRefreshOptions` 若不存在则回退空对象(下一步保证存在)。

- [ ] **Step 3: 缓存首次 socket payload 的 options(供后续 set-content 复用)**

在 `onRefreshContent` 方法体开头(约 733 行 `this.currentMermaidOptions = options.maid || {}` 之前或之后)记录一次 options,使主题/mermaid 配置在 scratch 模式下与文件预览一致:

```jsx
    this.currentRefreshOptions = options
    this.currentMermaidOptions = options.maid || {}
```

(仅新增 `this.currentRefreshOptions = options` 一行;若 `this.currentMermaidOptions = options.maid || {}` 已存在则保留不动。)

- [ ] **Step 4: 人工核对**

确认:新分支位于 `handleParentMessage` 内部、四个既有分支之后;`onRefreshContent` 开头新增了 `this.currentRefreshOptions = options`。本任务的运行验证在 Task 4 构建 + Task 5 测试后完成。

- [ ] **Step 5: 提交**

```bash
git add app/pages/index.jsx
git commit -m "feat(preview): handle mkdp:set-content postMessage for live text render"
```

---

### Task 2: 新增 `buildScratchShellHtml` 与 `/_mkdp/scratch` 路由

**Goal:** 服务器新增一个独立路由,返回左 textarea / 右预览 iframe 的双栏粘贴页,顶栏复用主题切换与导出按钮,textarea 输入防抖后 postMessage 推送内容给 iframe。

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js`(新增 `buildScratchShellHtml` 函数;`handleRequest` 内新增路由分支;`module.exports` 导出)

**Acceptance Criteria:**
- [ ] `GET /_mkdp/scratch`(含尾斜杠)返回 200、`content-type: text/html`,无论是否启用 `browseRoot`。
- [ ] 返回的 HTML 含 `id="scratch-input"`(textarea)与 `id="preview-frame"`(iframe,`src` 指向 `/page/1`)。
- [ ] textarea `input` 事件防抖 200ms 后向 iframe `postMessage({type:'mkdp:set-content', content: lines})`。
- [ ] iframe `load` 事件前缓存最新内容,`load` 后补推首帧。
- [ ] 顶栏"切换明暗主题"按钮向 iframe 推送 `mkdp:set-theme`;"导出 HTML"按钮推送 `mkdp:export`。
- [ ] `module.exports` 新增 `buildScratchShellHtml`。

**Verify:** `node -e "const s=require('./scripts/lib/standalone-preview-server'); const h=s.buildScratchShellHtml(); if(!/id=\"scratch-input\"/.test(h)||!/id=\"preview-frame\"/.test(h)||!/mkdp:set-content/.test(h)) {throw new Error('shell html missing required markers')}; console.log('ok')"` → 输出 `ok`

**Steps:**

- [ ] **Step 1: 在 `buildBrowseShellHtml` 之后新增 `buildScratchShellHtml`**

在 `scripts/lib/standalone-preview-server.js` 中 `buildBrowseShellHtml` 函数结束之后,新增以下函数(内联 CSS/JS,自包含,不依赖 browse shell 的 DOM)。`escapeHtml` 已在文件顶部定义(第 46 行)可直接用于按钮 SVG;此处为保持自包含,直接内联简单文本按钮:

```js
function buildScratchShellHtml() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Markdown Scratch</title>
<style>
  :root {
    --bg: #ffffff; --panel: #f6f7f9; --border: #e2e5ea;
    --text: #1f2328; --muted: #6b7280; --accent: #2f6feb;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }
  .scratch-shell { display: flex; flex-direction: column; height: 100vh; }
  .scratch-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--panel);
    flex-shrink: 0;
  }
  .scratch-topbar .title { font-size: 13px; font-weight: 600; color: var(--muted); }
  .scratch-topbar .actions { display: flex; gap: 8px; }
  .scratch-btn {
    border: 1px solid var(--border); background: var(--bg); color: var(--text);
    padding: 5px 12px; border-radius: 6px; font-size: 13px; cursor: pointer;
  }
  .scratch-btn:hover { border-color: var(--accent); color: var(--accent); }
  .scratch-body { display: flex; flex: 1; min-height: 0; }
  .scratch-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .scratch-pane.input { width: 42%; border-right: 1px solid var(--border); }
  .scratch-pane.preview { flex: 1; }
  #scratch-input {
    flex: 1; width: 100%; border: 0; resize: none; outline: none;
    padding: 16px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 14px; line-height: 1.6; color: var(--text); background: var(--bg);
  }
  .scratch-divider { width: 5px; cursor: col-resize; background: var(--border); flex-shrink: 0; }
  .scratch-divider:hover { background: var(--accent); }
  #preview-frame { flex: 1; width: 100%; border: 0; }
</style>
</head>
<body>
<div class="scratch-shell">
  <div class="scratch-topbar">
    <span class="title">Markdown Scratch</span>
    <div class="actions">
      <button class="scratch-btn" id="theme-btn" type="button" title="Toggle preview theme">Theme</button>
      <button class="scratch-btn" id="export-btn" type="button" title="Export HTML">Export HTML</button>
    </div>
  </div>
  <div class="scratch-body" id="scratch-body">
    <div class="scratch-pane input" id="input-pane">
      <textarea id="scratch-input" placeholder="Paste or type Markdown here..." spellcheck="false" autocomplete="off"></textarea>
    </div>
    <div class="scratch-divider" id="scratch-divider"></div>
    <div class="scratch-pane preview">
      <iframe id="preview-frame" title="Markdown preview" src="/page/1"></iframe>
    </div>
  </div>
</div>
<script>
  (function () {
    var input = document.getElementById('scratch-input');
    var frame = document.getElementById('preview-frame');
    var themeBtn = document.getElementById('theme-btn');
    var exportBtn = document.getElementById('export-btn');
    var divider = document.getElementById('scratch-divider');
    var inputPane = document.getElementById('input-pane');
    var body = document.getElementById('scratch-body');

    var frameReady = false;
    var pendingContent = null;
    var debounceTimer = null;
    var themeMode = 'light';

    function currentLines() {
      return input.value.split(/\\r?\\n/);
    }

    function pushContent() {
      var lines = currentLines();
      if (!frameReady) {
        pendingContent = lines;
        return;
      }
      frame.contentWindow.postMessage({ type: 'mkdp:set-content', content: lines }, '*');
    }

    input.addEventListener('input', function () {
      if (debounceTimer) { clearTimeout(debounceTimer); }
      debounceTimer = setTimeout(pushContent, 200);
    });

    frame.addEventListener('load', function () {
      frameReady = true;
      var lines = pendingContent || currentLines();
      pendingContent = null;
      frame.contentWindow.postMessage({ type: 'mkdp:set-content', content: lines }, '*');
    });

    themeBtn.addEventListener('click', function () {
      themeMode = themeMode === 'light' ? 'dark' : 'light';
      if (frameReady) {
        frame.contentWindow.postMessage({ type: 'mkdp:set-theme', theme: themeMode }, '*');
      }
    });

    exportBtn.addEventListener('click', function () {
      if (frameReady) {
        frame.contentWindow.postMessage({ type: 'mkdp:export' }, '*');
      }
    });

    /* Draggable divider */
    var dragging = false;
    divider.addEventListener('mousedown', function () { dragging = true; document.body.style.userSelect = 'none'; });
    window.addEventListener('mouseup', function () { dragging = false; document.body.style.userSelect = ''; });
    window.addEventListener('mousemove', function (e) {
      if (!dragging) { return; }
      var rect = body.getBoundingClientRect();
      var ratio = (e.clientX - rect.left) / rect.width;
      if (ratio < 0.15) { ratio = 0.15; }
      if (ratio > 0.85) { ratio = 0.85; }
      inputPane.style.width = (ratio * 100) + '%';
    });
  })();
</script>
</body>
</html>`;
}
```

- [ ] **Step 2: 在 `handleRequest` 中新增路由分支**

在 `scripts/lib/standalone-preview-server.js` 的 `handleRequest` 内,`/_mkdp/browse` 分支(约 1561 行)之前或之后新增(放在 `/page/\d+` 正则分支之前):

```js
  if (pathname === "/_mkdp/scratch" || pathname === "/_mkdp/scratch/") {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(buildScratchShellHtml());
    return;
  }
```

注意:此分支**不检查 `context.browseRoot`**(粘贴页与文件系统无关)。

- [ ] **Step 3: 导出 `buildScratchShellHtml`**

在文件底部 `module.exports = { ... }`(约 1790 行,已含 `buildBrowseShellHtml`)中加入 `buildScratchShellHtml`:

```js
module.exports = {
  startStandalonePreviewServer,
  buildBrowseShellHtml,
  buildScratchShellHtml,
  // ...保留其余已有导出
};
```

- [ ] **Step 4: 验证 shell HTML 标记**

Run: `node -e "const s=require('./scripts/lib/standalone-preview-server'); const h=s.buildScratchShellHtml(); if(!/id=\"scratch-input\"/.test(h)||!/id=\"preview-frame\"/.test(h)||!/mkdp:set-content/.test(h)) {throw new Error('shell html missing required markers')}; console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: 提交**

```bash
git add scripts/lib/standalone-preview-server.js
git commit -m "feat(browse): add /_mkdp/scratch paste-to-render page"
```

---

### Task 3: 路由单元测试

**Goal:** 用单元测试锁定 `/_mkdp/scratch` 路由的行为:返回 200、含必需 DOM 标记、不依赖 browseRoot。

**Files:**
- Create: `test/scratch-route.test.js`
- 参考现有: `test/browse-service.test.js`、`test/build-and-browse.test.js`(确认本仓库测试运行方式)

**Acceptance Criteria:**
- [ ] 测试启动 standalone server(或直接调用 `buildScratchShellHtml` + 路由 handler),断言 `/_mkdp/scratch` 返回 200 且 body 含 `scratch-input`、`preview-frame`、`mkdp:set-content`。
- [ ] 测试在 `browseRoot` 未设置时 `/_mkdp/scratch` 仍返回 200。

**Verify:** `node --test test/scratch-route.test.js` → 全部通过(若仓库用其他 runner,见 Step 1)

**Steps:**

- [ ] **Step 1: 确认测试运行方式**

Run: `cat test/browse-service.test.js | head -20 && grep -rn "test\b\|describe\|assert\|require('node:test')\|require('assert')" test/browse-service.test.js | head`
依此确定本仓库用的是 `node --test` + `node:assert` 还是其他框架,下面的测试代码按 `node:test` 编写,如不符则改为仓库实际框架。

- [ ] **Step 2: 编写测试**

```js
const test = require('node:test')
const assert = require('node:assert')
const http = require('http')
const {
  startStandalonePreviewServer,
  buildScratchShellHtml
} = require('../scripts/lib/standalone-preview-server')

function get(origin, pathname) {
  return new Promise((resolve, reject) => {
    http.get(origin + pathname, (res) => {
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () =>
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
      )
    }).on('error', reject)
  })
}

test('buildScratchShellHtml contains required markers', () => {
  const html = buildScratchShellHtml()
  assert.match(html, /id="scratch-input"/)
  assert.match(html, /id="preview-frame"/)
  assert.match(html, /mkdp:set-content/)
  assert.match(html, /src="\/page\/1"/)
})

test('GET /_mkdp/scratch returns 200 without browseRoot', async () => {
  const server = await startStandalonePreviewServer({
    /* no browseRoot — scratch must still work */
    name: 'scratch',
    contentLines: []
  })
  try {
    const res = await get(server.origin, '/_mkdp/scratch')
    assert.strictEqual(res.status, 200)
    assert.match(res.body, /id="scratch-input"/)
    assert.match(res.body, /id="preview-frame"/)
  } finally {
    await server.close()
  }
})
```

注意:`startStandalonePreviewServer` 的 context 参数形态须与现有调用一致 —— Step 1 阅读 `test/build-and-browse.test.js` 或 `standalone-preview-runtime.js` 确认 context 字段(如 `previewOptions`、`assetLayout` 是否必需),按需补齐最小 context。

- [ ] **Step 3: 运行测试**

Run: `node --test test/scratch-route.test.js`
Expected: PASS(2 tests)

- [ ] **Step 4: 提交**

```bash
git add test/scratch-route.test.js
git commit -m "test(browse): cover /_mkdp/scratch route"
```

---

### Task 4: 重新构建预览页产物并同步 dist

**Goal:** 把 Task 1 对 `app/pages/index.jsx` 的改动构建进 Next.js 产物(`app/out/`),并由构建脚本同步到 `dist/` 并 git add。

**Files:**
- 产物: `app/out/`、`dist/web/`、`dist/static/`、`dist/asset-manifest.json`(由 `yarn build-app` 生成)

**Acceptance Criteria:**
- [ ] `yarn build-app` 成功完成,无报错。
- [ ] 构建后的 `dist/web/index.html`(或其引用的 JS 产物)包含新增的 `mkdp:set-content` 逻辑。
- [ ] `dist/` 改动已被构建脚本 `git add -A dist`(脚本末尾会自动执行)。

**Verify:** `yarn build-app && grep -rl "mkdp:set-content" app/out dist/web` → 至少列出一个产物文件

**Steps:**

- [ ] **Step 1: 运行构建**

Run: `yarn build-app`
Expected: Next export 完成,末尾打印 dist 同步信息(若 node>=17 脚本会自动加 `--openssl-legacy-provider`)。

- [ ] **Step 2: 确认产物含新逻辑**

Run: `grep -rl "mkdp:set-content" app/out dist/web`
Expected: 列出至少一个 JS 产物文件(Next 会把 `index.jsx` 打包进 `_next/static/.../pages/index.js`)。

- [ ] **Step 3: 提交产物**

构建脚本已 `git add -A dist`;再补上 `app/out`:

```bash
git add app/out dist
git commit -m "build: rebuild preview assets with set-content support"
```

---

### Task 5: 端到端渲染测试(Playwright)

**Goal:** 验证完整链路 —— 打开 `/_mkdp/scratch`,在 textarea 注入 markdown,右侧 iframe 渲染出对应 HTML。

**Files:**
- Create: `test/scratch-render.e2e.test.js`
- 参考: 现有 Playwright 用法(`scripts/mkdp-test-preview.js`、`.playwright-mcp/` 痕迹、`package.json` 的 `preview-test`)

**Acceptance Criteria:**
- [ ] 测试启动 server,Playwright 打开 `/_mkdp/scratch`。
- [ ] 在 `#scratch-input` 填入含标题/代码块/列表的 markdown。
- [ ] 等待防抖后,断言 iframe 文档内出现渲染后的元素(如 `h1` 文本、`<ul>`/`<pre>`)。
- [ ] 测试结束关闭 server 与 browser。

**Verify:** `node --test test/scratch-render.e2e.test.js` → 通过(需已构建产物,依赖 Task 4)

**Steps:**

- [ ] **Step 1: 确认 Playwright 调用方式**

Run: `cat scripts/mkdp-test-preview.js | head -40 && grep -rn "playwright\|chromium\|launch\|newPage" scripts/mkdp-test-preview.js | head`
依此复用本仓库已有的 Playwright 启动/页面打开模式(浏览器路径、launch 选项)。

- [ ] **Step 2: 编写端到端测试**

```js
const test = require('node:test')
const assert = require('node:assert')
const { chromium } = require('playwright')
const {
  startStandalonePreviewServer
} = require('../scripts/lib/standalone-preview-server')

test('scratch page renders pasted markdown', async () => {
  const server = await startStandalonePreviewServer({
    name: 'scratch',
    contentLines: []
  })
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(server.origin + '/_mkdp/scratch')
    await page.waitForSelector('#scratch-input')

    const md = '# Hello Scratch\\n\\n- item one\\n- item two\\n\\n```js\\nconst x = 1\\n```\\n'
    await page.fill('#scratch-input', md)

    const frame = page.frameLocator('#preview-frame')
    // 防抖 200ms + 渲染,等待 h1 出现
    await frame.locator('h1', { hasText: 'Hello Scratch' }).waitFor({ timeout: 5000 })

    const h1Text = await frame.locator('h1').first().innerText()
    assert.match(h1Text, /Hello Scratch/)
    assert.strictEqual(await frame.locator('ul li').count() >= 2, true)
    assert.strictEqual(await frame.locator('pre').count() >= 1, true)
  } finally {
    await browser.close()
    await server.close()
  }
})
```

注意:若仓库的 Playwright 是通过 `@playwright/test` 而非裸 `playwright` 包引入,Step 1 会暴露,按实际包名调整 `require`。`startStandalonePreviewServer` 的最小 context 与 Task 3 保持一致。

- [ ] **Step 3: 运行测试**

Run: `node --test test/scratch-render.e2e.test.js`
Expected: PASS(1 test)

- [ ] **Step 4: 提交**

```bash
git add test/scratch-render.e2e.test.js
git commit -m "test(browse): e2e render test for scratch page"
```

---

### Task 6: (可选)CLI/文档入口

**Goal:** 让用户能方便地发现并打开 scratch 页面 —— 在 browse CLI 输出中提示 scratch URL,或在 README 增补说明。

**Files:**
- Modify: `scripts/mkdp-browse.js`(在打印 browse URL 处追加一行 scratch URL 提示)
- Modify: `README.md` / `README_zh.md`(简述 scratch 用法)

**Acceptance Criteria:**
- [ ] `mkdp-browse` 启动时 stderr/stdout 提示中包含 `…/_mkdp/scratch` 入口。
- [ ] README 增加一段简短说明(粘贴文本实时渲染)。

**Verify:** `node scripts/mkdp-browse.js --help` 正常;手动启动后日志含 scratch URL。

**Steps:**

- [ ] **Step 1: 在 `mkdp-browse.js` 追加提示**

在 `scripts/mkdp-browse.js` 打印 browse URL(约 131 行 `process.stdout.write(...)`)之后,追加 scratch 入口提示到 stderr:

```js
  process.stderr.write(`scratch (paste & render): ${session.origin}/_mkdp/scratch\n`);
```

- [ ] **Step 2: README 增补**

在 `README.md` 和 `README_zh.md` 的 browse 章节后,增加一小节说明 `/_mkdp/scratch` 用途(粘贴 markdown 实时渲染、可导出 HTML)。文字 2-4 句即可。

- [ ] **Step 3: 提交**

```bash
git add scripts/mkdp-browse.js README.md README_zh.md
git commit -m "docs(browse): surface scratch page entry point"
```

---

## 任务依赖

```
Task 1 (预览页分支) ──┐
                      ├──> Task 4 (构建产物) ──> Task 5 (e2e 测试)
Task 2 (路由+shell) ──┤
                      └──> Task 3 (路由单测)
Task 6 (可选入口) 依赖 Task 2
```

- Task 4 blockedBy: Task 1, Task 2
- Task 3 blockedBy: Task 2
- Task 5 blockedBy: Task 4
- Task 6 blockedBy: Task 2

---

## Self-Review

**1. 规格覆盖:**
- §4.1 路由 → Task 2 ✓
- §4.2 Scratch Shell(双栏/防抖/load 补推/顶栏) → Task 2 ✓
- §4.3 预览页 set-content 分支复用 onRefreshContent → Task 1 ✓
- §5 数据流 → Task 1+2 ✓
- §6 错误处理(iframe 未就绪缓存、安全) → Task 2 Step1(pendingContent)、Task 2 Step2(不依赖 browseRoot)✓
- §7 构建产物同步 → Task 4 ✓
- §8 测试(路由 + 渲染) → Task 3、Task 5 ✓
- §9 可选 CLI → Task 6 ✓

**2. 占位符扫描:** 各步骤含完整代码/命令;Task 3/5 的"按仓库实际框架调整"是必要的探查步骤(已给出探查命令 + 默认代码),非占位符。✓

**3. 类型一致性:** `mkdp:set-content` 消息形态(`{type, content}`)在 Task 1(接收)、Task 2(发送)、Task 5(测试)中一致;`content` 统一为字符串数组;`buildScratchShellHtml` 命名在 Task 2 定义、Task 3 导入一致;DOM id(`scratch-input`、`preview-frame`)三处一致。✓
