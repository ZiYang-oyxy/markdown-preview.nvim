# 文档扁平化（去卡片悬浮）与 TOC 统一右置 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `mkdp browse`、`mkdp preview`、nvim 三个界面统一为扁平无卡片悬浮风格，正文与 TOC 去掉边框/阴影/圆角/填充背景，TOC 统一移到右侧。

**Architecture:** 三界面共享 `app/_static/page.css` + `app/_static/markdown.css`；运行时经 `runtime-asset-manifest.json` 实际从 `dist/static/*.css` 加载，故每次改 `app/_static` 后须 `cp` 同步到 `dist/static`。TOC 移到右侧通过 CSS（grid 列顺序 + `order`）实现，不改 React DOM。browse shell 的 TOC/topbar 样式在 `scripts/lib/standalone-preview-server.js` 内联 CSS 中单独处理。

**Tech Stack:** 纯 CSS 改动（无构建依赖），Node standalone server，Playwright 端到端实测。

---

## 关键事实（实施前必读）

- 运行时 CSS 源：`runtime-asset-manifest.json` → `staticRoot: ../dist/static`、`indexHtml: ../dist/web/index.html`。
- 编辑源头在 `app/_static/*.css`，但**运行时读 `dist/static/*.css`**。当前两者 `diff` 完全一致。每个 CSS 任务结束必须 `cp app/_static/X.css dist/static/X.css`。
- preview 页 DOM 顺序：`#toc-panel`（index.jsx:998）在 `#content-col`（index.jsx:1019）**之前**。移 TOC 到右侧用 CSS `order`，不动 jsx，避免重建 Next.js。
- browse 模式下 preview 自带 `#toc-panel`/`#page-header`/`.mkdp-page-toolbar` 已被 `.mkdp-browse-mode` 隐藏，右侧 TOC 由 shell 的 `.toc-sidebar` 提供。
- 窄屏 `#toc-panel` 抽屉已是从右滑入（`right:0`+`translateX(104%)`），无需改方向。

---

### Task 1: 文档与 TOC 去卡片悬浮（preview/nvim 共享 CSS）

**Goal:** 移除 `.markdown-body`、`#toc-panel`、`#page-header` 的边框/阴影/圆角/填充背景，使文档与 TOC 扁平融入页面，仅保留必要分割线。

**Files:**
- Modify: `app/_static/markdown.css` (`.markdown-body` 规则，约 50-61 行)
- Modify: `app/_static/page.css`（`#page-header` 103-117；`#page-ctn .markdown-body` 219-231；`#toc-panel` 372-384；窄屏 567-584；browse 模式 713-722）
- Sync: `dist/static/markdown.css`, `dist/static/page.css`

**Acceptance Criteria:**
- [ ] `.markdown-body` 无 `border`、无 `border-radius`
- [ ] `#page-ctn .markdown-body` 无 `box-shadow`
- [ ] 各模式（with-header/header-hidden/browse/窄屏）的 `.markdown-body` 圆角均移除
- [ ] `#toc-panel` 桌面态无 `border-radius`/`box-shadow`/`backdrop-filter`/填充背景，仅保留 `border-left` 分割线
- [ ] `#page-header` 无圆角/阴影/blur/填充背景，仅保留 `border-bottom` 分割线
- [ ] `dist/static/*.css` 与 `app/_static/*.css` 一致

**Verify:** `diff -q app/_static/page.css dist/static/page.css && diff -q app/_static/markdown.css dist/static/markdown.css` → 无输出（一致）

**Steps:**

- [ ] **Step 1: 改 `markdown.css` 的 `.markdown-body`** — 移除 border 与 border-radius

```css
/* 改前 */
.markdown-body {
  font-family: "Helvetica Neue", Helvetica, "Segoe UI", Arial, freesans, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  font-size: 16px;
  color: var(--color-text-primary);
  line-height: 1.6;
  word-wrap: break-word;
  padding: 45px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border-primary);
  -webkit-border-radius: 0 0 3px 3px;
  border-radius: 0 0 3px 3px;
}
/* 改后 */
.markdown-body {
  font-family: "Helvetica Neue", Helvetica, "Segoe UI", Arial, freesans, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
  font-size: 16px;
  color: var(--color-text-primary);
  line-height: 1.6;
  word-wrap: break-word;
  padding: 45px;
  background: var(--color-bg-primary);
  border: 0;
}
```

- [ ] **Step 2: 改 `page.css:219-231`** — 去 box-shadow / border-color / 圆角

```css
/* 改前 */
#page-ctn .markdown-body {
  border-color: var(--border-color);
  box-shadow: var(--shadow-soft);
}

#page-ctn.with-header .markdown-body {
  border-top: 0;
  border-radius: 0 0 14px 14px;
}

#page-ctn.header-hidden .markdown-body {
  border-radius: 14px;
}
/* 改后 */
#page-ctn .markdown-body {
  border: 0;
  box-shadow: none;
}

#page-ctn.with-header .markdown-body {
  border-top: 0;
  border-radius: 0;
}

#page-ctn.header-hidden .markdown-body {
  border-radius: 0;
}
```

- [ ] **Step 3: 改 `page.css:103-117` 的 `#page-header`** — 扁平化，仅留 border-bottom

```css
/* 改后 */
#page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
  line-height: 24px;
  box-shadow: none;
}
```

- [ ] **Step 4: 改 `page.css:372-384` 的 `#toc-panel`（桌面 sticky 态）** — 去悬浮，留左分割线

```css
/* 改后 */
#toc-panel {
  position: sticky;
  top: 14px;
  align-self: start;
  max-height: calc(100vh - 28px);
  overflow: hidden;
  border: 0;
  border-left: 1px solid var(--border-color-soft);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  z-index: 20;
}
```

- [ ] **Step 5: 改窄屏 `page.css:567-584`** — 移除 header 与 markdown-body 圆角

```css
/* 改后：#page-header 块去掉两条 border-top-*-radius */
  #page-header {
    flex-wrap: wrap;
    align-items: flex-start;
  }
/* 改后：两条 markdown-body 圆角归零 */
  #page-ctn.header-hidden .markdown-body {
    border-radius: 0;
  }

  #page-ctn.with-header .markdown-body {
    border-radius: 0;
  }
```

- [ ] **Step 6: 改 browse 模式 `page.css:713-722`** — 去 14px 圆角，统一 main 背景

```css
/* 改后：删除/归零 browse 模式 markdown-body 圆角 */
.mkdp-browse-mode #page-ctn .markdown-body {
  border-radius: 0;
}

/* main 背景与文档统一，消除色差 */
.mkdp-browse-mode main {
  padding: 8px 12px 12px;
  background: var(--background-color);
}
```
> 注：`--background-color` 为页面主背景变量；若文档块仍有色差，回退用 `transparent`。实施时在浏览器实测确认。

- [ ] **Step 7: 同步 dist 并验证**

```bash
cp app/_static/markdown.css dist/static/markdown.css
cp app/_static/page.css dist/static/page.css
diff -q app/_static/page.css dist/static/page.css && diff -q app/_static/markdown.css dist/static/markdown.css && echo "SYNCED"
```
Expected: `SYNCED`

- [ ] **Step 8: Commit**

```bash
git add app/_static/markdown.css app/_static/page.css dist/static/markdown.css dist/static/page.css
git commit -m "feat(ui): flatten doc and toc, remove card/floating styles"
```

---

### Task 2: TOC 移到右侧（preview/nvim 桌面布局）

**Goal:** 将 `#page-shell` 的桌面 grid 改为内容在左、TOC 在右，通过 CSS `order` 处理 DOM 中 TOC 在前的事实，不改 React。

**Files:**
- Modify: `app/_static/page.css`（`#page-shell` 79-91；中宽断点 542-543；`#content-col` 与 `#toc-panel` 的 `order`）
- Sync: `dist/static/page.css`

**Acceptance Criteria:**
- [ ] 桌面宽屏 preview 模式 TOC 显示在右侧、内容在左侧
- [ ] 中等宽度断点同样内容在左、TOC 在右
- [ ] `#page-shell:not(.has-toc)` 单列布局不受影响
- [ ] 窄屏抽屉仍从右侧滑入、开合正常
- [ ] `dist/static/page.css` 与 `app/_static/page.css` 一致

**Verify:** 运行 `node scripts/mkdp-open-preview.js`（或下方实测命令）打开多级标题 md，Playwright 量 `#toc-panel` 的 `x` 坐标 > `#content-col` 的 `x` 坐标 → TOC 在右。

**Steps:**

- [ ] **Step 1: 改 `page.css:79-87` 的 `#page-shell` grid** — 内容列在前、TOC 列在后

```css
/* 改后 */
#page-shell {
  position: relative;
  max-width: 1280px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 320px);
  gap: 20px;
  align-items: start;
}
```

- [ ] **Step 2: 用 order 修正 DOM 顺序** — 在 `#content-col`（page.css:93-95）追加 order

```css
/* 改后 */
#content-col {
  min-width: 0;
  order: 1;
}
```
并在 `#toc-panel`（Task1 已改的块）追加 `order: 2;`：

```css
#toc-panel {
  /* …Task1 的属性… */
  order: 2;
}
```

- [ ] **Step 3: 改中宽断点 `page.css:542-543`** — 同步列顺序

```css
/* 改后 */
  #page-shell {
    grid-template-columns: minmax(0, 1fr) minmax(240px, 290px);
  }
```

- [ ] **Step 4: 同步 dist**

```bash
cp app/_static/page.css dist/static/page.css
diff -q app/_static/page.css dist/static/page.css && echo "SYNCED"
```
Expected: `SYNCED`

- [ ] **Step 5: Commit**

```bash
git add app/_static/page.css dist/static/page.css
git commit -m "feat(ui): move preview toc to the right column"
```

---

### Task 3: browse shell TOC 与顶栏扁平化

**Goal:** browse shell 的右侧 `.toc-sidebar` 去掉灰底填充仅留分割线，`.content-topbar` 扁平化为透明 + 仅下边框，与 preview 三处一致。

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js`（`.toc-sidebar` 432-439；`.content-topbar` 300-310）

**Acceptance Criteria:**
- [ ] `.toc-sidebar` 无 `background: var(--surface)`，保留 `border-left` 分割线
- [ ] `.content-topbar` 背景透明，保留 `border-bottom` 分割线
- [ ] browse 界面右侧 TOC 与内容区共享同一背景，无灰色色块

**Verify:** 运行 `node scripts/mkdp-browse.js .`，打开 README.md，Playwright 取 `.toc-sidebar` 的 `background-color` → 与 `body` 背景一致（非 `--surface` 灰）。

**Steps:**

- [ ] **Step 1: 改 `.toc-sidebar`（server.js:432-439）** — 去灰底

```js
    .toc-sidebar {
      min-width: 0;
      overflow: hidden;
      background: transparent;
      border-left: 1px solid var(--border);
      display: none;
      flex-direction: column;
    }
```

- [ ] **Step 2: 改 `.content-topbar`（server.js:300-310）** — 透明背景

```js
    .content-topbar {
      display: none;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      background: transparent;
      flex-shrink: 0;
      min-height: 46px;
      gap: 8px;
    }
```

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/standalone-preview-server.js
git commit -m "feat(browse): flatten toc sidebar and topbar backgrounds"
```

---

### Task 4: 端到端实测与回归（本机）

**Goal:** 在本机实际运行 browse 与 preview 两个入口，用 Playwright 截图核对四类改动生效、亮/暗主题正常、无样式回归。

**Files:**
- 无源码改动（验证任务）；如发现问题回到 Task 1-3 修正。

**Acceptance Criteria:**
- [ ] browse 打开 README.md：文档无边框/阴影/圆角、不像卡片；右侧 TOC 无灰底仅分割线
- [ ] preview 模式：TOC 在右、无悬浮；header 为扁平行 + 底部分割线；文档平铺
- [ ] 窄屏：TOC 抽屉从右滑入、折叠/活跃标题同步正常
- [ ] dark 主题：背景统一、分割线可见不刺眼
- [ ] 代码高亮/Mermaid/KaTeX/图片 lightbox 不受影响

**Verify:** 截图 `browse-readme-after.png` 与 `preview-after.png`，逐项对照本计划 AC；与基线 `browse-readme-current.png` 对比确认仅目标项变化。

**Steps:**

- [ ] **Step 1: 起 browse 服务并实测**

```bash
node scripts/mkdp-browse.js . --browser none 2>/tmp/mkdp-browse.log &
sleep 2.5 && grep _mkdp/browse /tmp/mkdp-browse.log
```
用 Playwright 打开打印出的 URL，点 README.md，截图 `browse-readme-after.png`，并 evaluate 校验：`.markdown-body` 的 `borderTopWidth==0px && boxShadow==none && borderRadius==0px`；`.toc-sidebar` 背景非灰。

- [ ] **Step 2: 起 preview 服务并实测**

```bash
node scripts/mkdp-open-preview.js README.md --browser none 2>/tmp/mkdp-preview.log &
sleep 2.5 && cat /tmp/mkdp-preview.log
```
> 注：先 `node scripts/mkdp-open-preview.js -h` 确认入参用法；若需要 bufnr/page 路由按帮助调整。Playwright 打开后校验 `#toc-panel` 在 `#content-col` 右侧、无悬浮样式、`#page-header` 仅 border-bottom。

- [ ] **Step 3: 切换 dark 主题截图核对**

通过界面主题切换器切到 dark，截图确认背景统一、分割线可见。

- [ ] **Step 4: 关闭测试服务并清理临时截图**

```bash
pkill -f mkdp-browse.js; pkill -f mkdp-open-preview.js
```

- [ ] **Step 5: 最终提交（若实测中有微调）**

```bash
git add -A && git commit -m "test(ui): verify flat doc + right toc end-to-end" || echo "no changes to commit"
```

---

## 自检（Self-Review）

- **Spec 覆盖**：A 文档去卡片→Task1 S1-2,6；B TOC 去悬浮→Task1 S4；C TOC 右置→Task2；D header 扁平→Task1 S3,S5；E browse TOC 统一→Task3；F dist 同步→各 Task 的 sync step + 关键事实说明。✓
- **占位符**：无 TBD/TODO；每个 CSS 步骤含完整改后代码。✓
- **类型/命名一致**：CSS 选择器名与源码一致（已逐行读取核对）；变量 `--background-color` 在 Step6 标注了实测回退方案。✓
- **运行时陷阱**：已澄清运行时读 `dist/static`，每个 CSS 任务都含 `cp` 同步。✓
