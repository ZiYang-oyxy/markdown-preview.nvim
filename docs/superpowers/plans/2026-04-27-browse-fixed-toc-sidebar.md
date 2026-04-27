# Browse 固定右侧 TOC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 browse 模式中的 TOC 从浮动小窗改为可完全收起的固定右侧栏。

**Architecture:** browse shell 继续由 `scripts/lib/standalone-preview-server.js` 生成，iframe 文档页仍只负责发送 `mkdp:toc`、`mkdp:active-heading` 并接收 `mkdp:scroll-to`。本次把 TOC 容器从 `.content-body` 内的绝对定位浮层移到 `.content-workspace` 的真实右栏，并保留现有树形渲染、节点折叠和窄屏 drawer。

**Tech Stack:** Node.js CommonJS 测试、vanilla JS、内联 CSS、`localStorage`、`postMessage`。

---

## File Structure

| 文件 | 责任 | 改动 |
| --- | --- | --- |
| `scripts/lib/standalone-preview-server.js` | browse shell HTML/CSS/JS、TOC 布局与事件 | 修改 |
| `test/browse-fixed-toc-sidebar.test.js` | 固定右侧 TOC 的结构与脚本回归测试 | 新增 |

---

### Task 1: 暴露 shell HTML 生成函数并写失败测试

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js:1748`
- Create: `test/browse-fixed-toc-sidebar.test.js`

- [ ] **Step 1: 导出 `buildBrowseShellHtml` 测试入口**

在 `scripts/lib/standalone-preview-server.js` 文件末尾把导出对象从：

```js
module.exports = {
  startStandalonePreviewServer,
};
```

改为：

```js
module.exports = {
  startStandalonePreviewServer,
  buildBrowseShellHtml,
};
```

- [ ] **Step 2: 新增失败测试文件**

创建 `test/browse-fixed-toc-sidebar.test.js`，内容如下：

```js
const assert = require('assert')

const {
  buildBrowseShellHtml
} = require('../scripts/lib/standalone-preview-server')

function extractBody(html) {
  const bodyMatch = html.match(/<body>([\s\S]*)<\/body>/)
  assert.ok(bodyMatch, 'shell html should include a body')
  return bodyMatch[1]
}

function extractScript(html) {
  const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g))
  assert.ok(scripts.length > 0, 'shell html should include inline script')
  return scripts[scripts.length - 1][1]
}

function testTocSidebarIsWorkspaceColumn() {
  const html = buildBrowseShellHtml()
  const body = extractBody(html)

  assert.ok(
    body.includes('class="content-workspace" id="content-workspace"'),
    'content should contain a workspace wrapper for preview and toc columns'
  )
  assert.ok(
    body.includes('class="toc-sidebar" id="toc-sidebar"'),
    'shell should contain a fixed toc sidebar'
  )
  assert.ok(
    body.includes('id="toc-sidebar-list"'),
    'fixed toc sidebar should have its own tree container'
  )

  const contentBodyIndex = body.indexOf('class="content-body" id="content-body"')
  const tocSidebarIndex = body.indexOf('class="toc-sidebar" id="toc-sidebar"')
  assert.ok(contentBodyIndex !== -1, 'content body should exist')
  assert.ok(tocSidebarIndex !== -1, 'toc sidebar should exist')
  assert.ok(
    tocSidebarIndex > contentBodyIndex,
    'toc sidebar should be a sibling after content body, not an overlay inside it'
  )
}

function testFloatingTocIsRemovedFromWideLayout() {
  const html = buildBrowseShellHtml()

  assert.strictEqual(
    html.includes('class="toc-float"'),
    false,
    'wide layout should not render the old floating toc container'
  )
  assert.strictEqual(
    html.includes('id="toc-float-list"'),
    false,
    'wide layout should not keep the old floating toc list id'
  )
  assert.strictEqual(
    html.includes('position: absolute;\\n      top: 12px;\\n      right: 12px;'),
    false,
    'toc should no longer be positioned as a floating overlay'
  )
}

function testCollapsedStateTargetsSidebar() {
  const html = buildBrowseShellHtml()
  const script = extractScript(html)

  assert.ok(
    script.includes("var tocSidebar = document.getElementById('toc-sidebar');"),
    'script should keep a tocSidebar DOM reference'
  )
  assert.ok(
    script.includes("var tocSidebarList = document.getElementById('toc-sidebar-list');"),
    'script should render the fixed sidebar list'
  )
  assert.ok(
    script.includes("localStorage.getItem('mkdp-toc-collapsed') === '1'"),
    'script should read persisted collapsed state'
  )
  assert.ok(
    script.includes("localStorage.setItem('mkdp-toc-collapsed', '1')"),
    'close action should persist collapsed state'
  )
  assert.ok(
    script.includes("localStorage.setItem('mkdp-toc-collapsed', '0')"),
    'topbar action should persist expanded state'
  )
}

function main() {
  testTocSidebarIsWorkspaceColumn()
  testFloatingTocIsRemovedFromWideLayout()
  testCollapsedStateTargetsSidebar()
  process.stdout.write('browse fixed toc sidebar tests: ok\\n')
}

main()
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
node test/browse-fixed-toc-sidebar.test.js
```

Expected: FAIL，错误应指向缺少 `content-workspace`、`toc-sidebar` 或仍存在旧 `.toc-float`。

- [ ] **Step 4: 提交测试入口与失败测试**

```bash
git add scripts/lib/standalone-preview-server.js test/browse-fixed-toc-sidebar.test.js
git commit -m "test(browse): cover fixed toc sidebar shell structure"
```

---

### Task 2: 将 TOC 容器移到固定右侧栏

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js:362-665`
- Test: `test/browse-fixed-toc-sidebar.test.js`

- [ ] **Step 1: 修改 CSS，把浮层规则替换为 workspace 与 sidebar**

在 `scripts/lib/standalone-preview-server.js` 的内联 CSS 中，保留 `.content-body` 的基础职责，但删除 `.toc-float` 与 `.toc-float.is-visible` 规则，新增以下规则：

```css
    /* ---- Content workspace ---- */
    .content-workspace {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 240px;
      gap: 0;
    }
    .content-workspace.toc-collapsed {
      grid-template-columns: minmax(0, 1fr);
    }

    /* ---- Content body ---- */
    .content-body {
      min-width: 0;
      min-height: 0;
      position: relative;
      display: flex;
    }
```

把旧的 `/* ---- Floating TOC ---- */` 块替换为：

```css
    /* ---- TOC Sidebar ---- */
    .toc-sidebar {
      min-width: 0;
      overflow: hidden;
      background: var(--surface);
      border-left: 1px solid var(--border);
      display: none;
      flex-direction: column;
    }
    .toc-sidebar.is-visible { display: flex; }
    .toc-sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 12px 12px 10px;
      border-bottom: 1px solid var(--border);
      flex-shrink: 0;
    }
    .toc-title {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }
    .toc-sidebar-body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 10px 10px 12px;
    }
```

保留现有 `.toc-tree`、`.toc-node`、`.toc-node-row`、`.toc-node-toggle`、`.toc-node-link`、`.toc-node-children` 等树形目录样式。

- [ ] **Step 2: 修改响应式 CSS**

把当前宽屏/窄屏 TOC 浮层规则：

```css
    @media (min-width: 1100px) {
      .toc-float.is-visible { display: block; }
    }
    @media (max-width: 1099px) {
      .toc-float { display: none !important; }
    }
```

改为：

```css
    @media (max-width: 1099px) {
      .content-workspace {
        grid-template-columns: minmax(0, 1fr);
      }
      .toc-sidebar {
        display: none !important;
      }
    }
```

- [ ] **Step 3: 修改 HTML 结构**

把当前 `content-body` 中的旧 TOC 浮层：

```html
        <div class="toc-float" id="toc-float">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div class="toc-title">On this page</div>
            <button class="toc-drawer-close" id="toc-float-close" type="button" title="Close">&times;</button>
          </div>
          <div class="toc-tree" id="toc-float-list"></div>
        </div>
```

移除，并将 `content-body` 包进新的 workspace。目标 HTML 片段如下：

```html
      <div class="content-workspace" id="content-workspace">
        <div class="content-body" id="content-body">
          <div class="welcome-screen" id="welcome-screen">
            <h2>Markdown Preview</h2>
            <p>Select a file from the sidebar to get started.</p>
          </div>
          <iframe id="preview-frame" class="preview-frame" title="Markdown preview"></iframe>
          <div id="fallback-view" class="fallback-view"></div>
        </div>
        <aside class="toc-sidebar" id="toc-sidebar" aria-label="Table of contents">
          <div class="toc-sidebar-header">
            <div class="toc-title">On this page</div>
            <button class="toc-drawer-close" id="toc-sidebar-close" type="button" title="Close">&times;</button>
          </div>
          <div class="toc-sidebar-body">
            <div class="toc-tree" id="toc-sidebar-list"></div>
          </div>
        </aside>
      </div>
```

- [ ] **Step 4: 更新 DOM 引用**

在内联脚本 DOM refs 中，把旧引用：

```js
    var tocFloat = document.getElementById('toc-float');
    var tocFloatList = document.getElementById('toc-float-list');
    var tocFloatClose = document.getElementById('toc-float-close');
```

替换为：

```js
    var contentWorkspace = document.getElementById('content-workspace');
    var tocSidebar = document.getElementById('toc-sidebar');
    var tocSidebarList = document.getElementById('toc-sidebar-list');
    var tocSidebarClose = document.getElementById('toc-sidebar-close');
```

- [ ] **Step 5: 更新所有清空预览时的 TOC 隐藏逻辑**

把脚本中所有：

```js
      tocFloat.classList.remove('is-visible');
```

替换为：

```js
      hideTocSidebar();
```

本步骤会先引用尚未创建的函数，下一步补齐实现。

- [ ] **Step 6: 新增 sidebar 显隐 helper**

在 `/* ---- TOC tree ---- */` 注释之前新增：

```js
    function showTocSidebar() {
      contentWorkspace.classList.remove('toc-collapsed');
      tocSidebar.classList.add('is-visible');
    }

    function hideTocSidebar() {
      tocSidebar.classList.remove('is-visible');
      contentWorkspace.classList.add('toc-collapsed');
    }
```

- [ ] **Step 7: 更新渲染函数命名**

把：

```js
    function renderTocFloat() { renderTocTree(tocFloatList, tocHeadings); }
    function renderTocDrawerList() { renderTocTree(tocDrawerList, tocHeadings); }
```

改为：

```js
    function renderTocSidebar() { renderTocTree(tocSidebarList, tocHeadings); }
    function renderTocDrawerList() { renderTocTree(tocDrawerList, tocHeadings); }
```

把脚本中所有 `renderTocFloat()` 调用改为 `renderTocSidebar()`。

- [ ] **Step 8: 运行测试确认结构测试通过**

Run:

```bash
node test/browse-fixed-toc-sidebar.test.js
```

Expected: PASS，输出 `browse fixed toc sidebar tests: ok`。

- [ ] **Step 9: 提交布局结构变更**

```bash
git add scripts/lib/standalone-preview-server.js test/browse-fixed-toc-sidebar.test.js
git commit -m "feat(browse): move toc into fixed right sidebar"
```

---

### Task 3: 修正 TOC 收起、展开和窄屏 drawer 行为

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js:1230-1310`
- Test: `test/browse-fixed-toc-sidebar.test.js`

- [ ] **Step 1: 扩展脚本测试，覆盖宽屏与窄屏分支文本**

在 `test/browse-fixed-toc-sidebar.test.js` 中新增测试函数：

```js
function testTocToggleKeepsDrawerOnNarrowScreens() {
  const html = buildBrowseShellHtml()
  const script = extractScript(html)

  assert.ok(
    script.includes('if (window.innerWidth >= 1100)'),
    'toc toggle should keep a wide-screen branch'
  )
  assert.ok(
    script.includes('openTocDrawer();'),
    'toc toggle should still open drawer on narrow screens'
  )
  assert.ok(
    script.includes('showTocSidebar();'),
    'wide-screen expand should show the fixed toc sidebar'
  )
  assert.ok(
    script.includes('hideTocSidebar();'),
    'wide-screen collapse should hide the fixed toc sidebar'
  )
}
```

并在 `main()` 中加入：

```js
  testTocToggleKeepsDrawerOnNarrowScreens()
```

- [ ] **Step 2: 运行测试确认失败或暴露未改完位置**

Run:

```bash
node test/browse-fixed-toc-sidebar.test.js
```

Expected: 如果 Task 2 未完整替换旧逻辑，应 FAIL；如果已部分完成，继续下一步做行为收敛。

- [ ] **Step 3: 更新 `mkdp:toc` 消息处理**

将 `event.data.type === 'mkdp:toc'` 分支中的显示逻辑改为：

```js
        if (tocHeadings.length > 0) {
          if (!tocCollapsed && window.innerWidth >= 1100) {
            showTocSidebar();
          } else {
            hideTocSidebar();
          }
          tocToggleBtn.classList.remove('is-hidden');
        } else {
          hideTocSidebar();
          tocToggleBtn.classList.add('is-hidden');
        }
        renderTocSidebar();
        renderTocDrawerList();
```

- [ ] **Step 4: 更新 `mkdp:active-heading` 消息处理**

确认该分支中渲染调用为：

```js
        renderTocSidebar();
        renderTocDrawerList();
```

如果仍有 `renderTocFloat()`，替换为 `renderTocSidebar()`。

- [ ] **Step 5: 更新右侧栏关闭按钮事件**

把旧的浮层关闭监听：

```js
    tocFloatClose.addEventListener('click', function() {
      tocFloat.classList.remove('is-visible');
      tocCollapsed = true;
      localStorage.setItem('mkdp-toc-collapsed', '1');
    });
```

替换为：

```js
    tocSidebarClose.addEventListener('click', function() {
      hideTocSidebar();
      tocCollapsed = true;
      localStorage.setItem('mkdp-toc-collapsed', '1');
    });
```

- [ ] **Step 6: 更新 topbar TOC 按钮事件**

把宽屏分支改为：

```js
      if (window.innerWidth >= 1100) {
        tocCollapsed = !tocCollapsed;
        localStorage.setItem('mkdp-toc-collapsed', tocCollapsed ? '1' : '0');
        if (tocCollapsed) {
          hideTocSidebar();
        } else if (tocHeadings.length > 0) {
          showTocSidebar();
          renderTocSidebar();
        }
      } else {
        openTocDrawer();
      }
```

- [ ] **Step 7: 运行新增测试**

Run:

```bash
node test/browse-fixed-toc-sidebar.test.js
```

Expected: PASS。

- [ ] **Step 8: 提交交互变更**

```bash
git add scripts/lib/standalone-preview-server.js test/browse-fixed-toc-sidebar.test.js
git commit -m "feat(browse): persist fixed toc sidebar collapse state"
```

---

### Task 4: 回归测试 browse 服务与 shell

**Files:**
- No planned code changes

- [ ] **Step 1: 运行固定 TOC 测试**

Run:

```bash
node test/browse-fixed-toc-sidebar.test.js
```

Expected: PASS，输出：

```text
browse fixed toc sidebar tests: ok
```

- [ ] **Step 2: 运行 browse 服务测试**

Run:

```bash
node test/browse-service.test.js
```

Expected: PASS，输出：

```text
browse-service tests: ok
```

- [ ] **Step 3: 运行 build-and-browse 测试**

Run:

```bash
node test/build-and-browse.test.js
```

Expected: PASS，输出：

```text
build-and-browse tests: ok
```

- [ ] **Step 4: 检查工作树**

Run:

```bash
git status --short
```

Expected: 只剩用户已有的 `.superpowers/` 临时目录或为空；不应有未提交的实现文件。

---

## Self-Review

- Spec coverage: 本计划覆盖固定右侧栏、完全收起、topbar 重新打开、窄屏 drawer、树形渲染复用和测试。
- Placeholder scan: 每个步骤都包含明确命令、代码或期望结果，没有省略执行细节。
- Type consistency: 统一使用 `contentWorkspace`、`tocSidebar`、`tocSidebarList`、`tocSidebarClose`、`renderTocSidebar()`、`showTocSidebar()`、`hideTocSidebar()`。
