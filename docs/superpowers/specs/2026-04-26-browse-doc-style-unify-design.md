# Browse Mode 文档渲染风格统一设计

## 目标

在 browse shell 内打开 markdown 文档时，消除 shell 外框与文档渲染区域之间的视觉割裂，使整体体验成为一个连贯的应用。

## 问题概述

当前 browse shell 经历了 Notion 风格的现代化改造，但内嵌的文档渲染页面（`/page/:bufnr?browsePath=...`）仍然保留独立预览模式的完整 UI 元素，导致三个核心割裂：

1. **文件名/header 重复** — shell topbar 已展示文件名和操作按钮，文档内又有一个风格迥异的 header（圆角毛玻璃 vs 方角简洁）
2. **控件风格冲突** — shell 使用 30x30 方角图标按钮，文档使用 border-radius:999px 药丸形 select
3. **双 TOC 系统** — shell 有一个 flat 列表 TOC（无层级、无折叠），文档自带完整的树形 TOC（被 `mkdp-browse-mode` 隐藏）

## 影响范围

本设计**仅改变 browse mode 下的表现**（即 `?browsePath=` 参数存在时）。独立预览模式（直接访问 `/page/:bufnr`）保持现有行为不变。

## 设计方案

### 1. 完全隐藏文档 header

**变更：** browse mode 下，文档页面隐藏 `#page-header` 和 `.mkdp-page-toolbar`，文档区域直接从 `.markdown-body` 开始。

**涉及文件：** `app/_static/page.css`

**具体改动：**
- 在 `.mkdp-browse-mode` 规则块中新增：
  ```css
  .mkdp-browse-mode #page-header,
  .mkdp-browse-mode .mkdp-page-toolbar {
    display: none !important;
  }
  ```
- `.mkdp-browse-mode .markdown-body` 的 border-radius 改为 `14px`（四角圆角），因为不再有 header 与之拼接
- 可选：browse mode 下去掉 `main` 的 padding 和渐变背景，让文档内容区域更贴合 shell iframe

### 2. 控件迁移至 shell topbar

**变更：** shell topbar 右侧新增三个图标按钮：颜色主题、Mermaid 主题、导出。全部使用现有 `.topbar-btn` 风格（30x30, border-radius:6px），通过 popover 下拉菜单展示选项。

**涉及文件：** `scripts/lib/standalone-preview-server.js`

#### 2.1 新增按钮

在 topbar-right 中，`toc-toggle-btn` 之前，添加三个按钮（用分隔线与原有按钮分组）：

| 按钮 | 图标 | ID | 行为 |
|------|------|----|------|
| 颜色主题 | 调色板 SVG | `color-theme-btn` | popover 列出"浅色/深色" |
| Mermaid 主题 | 图表 SVG | `mermaid-theme-btn` | popover 列出"现代/极简/暖色/森林" |
| 导出 HTML | 导出 SVG | `export-btn` | 直接触发导出（无 popover） |

布局顺序（左→右）：`[颜色] [Mermaid] [导出] | [目录] [主题] [下载]`

分隔线使用 `<span class="topbar-sep"></span>`，样式：`width:1px; height:18px; background:var(--border); margin:0 2px;`

#### 2.2 Popover 组件

新增一个轻量级 popover 样式：

```css
.topbar-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 120px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  padding: 4px;
  z-index: 50;
  display: none;
}
.topbar-popover.is-open { display: block; }
.topbar-popover-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
  text-align: left;
  border-radius: 5px;
  cursor: pointer;
}
.topbar-popover-item:hover { background: var(--accent-soft); }
.topbar-popover-item.is-active { color: var(--accent); font-weight: 500; }
```

点击按钮 toggle popover 开关，点击外部或选择选项后关闭。

#### 2.3 跨 iframe 通信协议

控件在 shell 中，但实际效果需要作用于 iframe 内的文档页面。通过 `postMessage` 实现双向通信：

**Shell → iframe（新增消息类型）：**

| type | payload | 说明 |
|------|---------|------|
| `mkdp:set-theme` | `{ theme: 'light' \| 'dark' }` | 设置颜色主题 |
| `mkdp:set-mermaid-theme` | `{ preset: string }` | 设置 Mermaid 主题预设 |
| `mkdp:export` | `{}` | 触发 HTML 导出 |

**iframe → Shell（新增消息类型）：**

| type | payload | 说明 |
|------|---------|------|
| `mkdp:state` | `{ theme, mermaidPreset, hasMermaid }` | 文档加载后上报当前状态 |

**涉及文件：** `app/pages/index.jsx`

iframe 端的 `handleParentMessage` 扩展：
- 收到 `mkdp:set-theme` → 调用 `this.setThemeMode(payload.theme)`
- 收到 `mkdp:set-mermaid-theme` → 调用 `this.setMermaidThemePreset(payload.preset)`
- 收到 `mkdp:export` → 触发 `document.getElementById('mkdp-export-slot')` 内按钮的 click，或直接调用 export 逻辑

文档加载完成后（`componentDidMount` 或内容更新后），向 parent 发送 `mkdp:state` 以同步当前主题状态和是否包含 Mermaid 图表。Shell 收到后更新 popover 中的活跃选项，并决定是否显示 Mermaid 按钮。

#### 2.4 Shell 主题同步

当前 shell 有自己的 theme toggle（sun 图标），文档也需要独立的颜色主题控制。两者行为：

- **shell theme 按钮**（sun 图标）：仅控制 shell 自身的 `html[data-theme]`
- **颜色主题按钮**（新增）：仅控制 iframe 内文档的 `[data-theme]`
- 两者独立，不互相联动（用户可能希望 shell 深色但文档浅色）

### 3. Shell TOC 升级为树形结构

**变更：** shell 右侧 TOC 面板从 flat 列表升级为树形结构，支持多层级缩进、折叠/展开、活跃跟踪。面板可收起。

**涉及文件：** `scripts/lib/standalone-preview-server.js`

#### 3.1 数据结构变更

当前 iframe 发送的 `mkdp:toc` 消息已包含 `level` 字段：

```js
{ type: 'mkdp:toc', headings: [{ id, text, level }] }
```

Shell 端需要新增 `buildTocTree()` 函数，将 flat headings 转换为嵌套树。算法与文档端 `index.jsx` 中已有的 `buildTocTree()` 相同（使用栈算法按 level 构建父子关系）。

#### 3.2 树形渲染

替换当前的 `renderTocList(container)` 为 `renderTocTree(container, nodes)`，递归渲染：

```
toc-tree (根列表)
└── toc-node (每个节点)
    ├── toc-node-row (行：折叠按钮 + 链接)
    │   ├── toc-node-toggle (有子节点时显示 +/−)
    │   └── toc-node-link (标题文本，可点击跳转)
    └── toc-node-children (子节点列表，折叠时 display:none)
```

#### 3.3 样式

复用 shell 已有的设计语言：

```css
.toc-tree { list-style: none; margin: 0; padding: 0; }
.toc-node { margin: 1px 0; }
.toc-node-row { display: flex; align-items: flex-start; gap: 2px; }
.toc-node-toggle {
  width: 18px; height: 18px; flex: 0 0 18px;
  border: 0; background: transparent; color: var(--muted);
  cursor: pointer; border-radius: 4px; font-size: 12px;
  display: flex; align-items: center; justify-content: center;
}
.toc-node-toggle:hover { background: var(--accent-soft); color: var(--text); }
.toc-node-link {
  flex: 1; min-width: 0;
  padding: 3px 6px; border-radius: 4px;
  font-size: 12px; color: var(--muted);
  text-decoration: none; cursor: pointer;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-left: 2px solid transparent;
}
.toc-node-link:hover { color: var(--text); background: var(--accent-soft); }
.toc-node.is-active > .toc-node-row > .toc-node-link {
  border-left-color: var(--accent); color: var(--accent); font-weight: 500;
}
.toc-node-children {
  margin-left: 9px; padding-left: 8px;
  border-left: 1px solid var(--border);
}
.toc-node.is-collapsed > .toc-node-children { display: none; }
```

#### 3.4 折叠/展开行为

- **默认展开规则：** h1、h2 级别默认展开，h3+ 默认折叠
- **折叠状态存储：** 使用 JS 对象 `tocExpandedMap`（id → boolean），不持久化（每次切换文件重置）
- **点击折叠按钮：** toggle 对应节点的展开状态，重新渲染 TOC
- **活跃节点自动展开：** 当 `mkdp:active-heading` 变更时，自动展开活跃节点的所有祖先节点

#### 3.5 面板收起功能

TOC 面板可以被完全收起/展开：

- **宽屏（≥1100px）：** `.toc-float` 面板右上角添加关闭按钮（✕），点击后隐藏面板。topbar 的 TOC 按钮始终显示，点击可重新打开面板
- **窄屏（<1100px）：** 保持现有的 drawer 行为（从右侧滑入），drawer 内同样使用树形 TOC
- **收起状态持久化：** 使用 `localStorage` key `mkdp-toc-collapsed`

#### 3.6 同步应用到 drawer

窄屏的 `toc-drawer` 也使用相同的树形渲染函数，共享 `tocExpandedMap` 状态。两个容器（float 和 drawer）调用同一个 `renderTocTree()` 函数。

## 实现影响的文件清单

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `app/_static/page.css` | 修改 | 新增 `.mkdp-browse-mode` 下隐藏 header/toolbar 的规则 |
| `app/pages/index.jsx` | 修改 | 扩展 `handleParentMessage` 处理新的消息类型；内容加载后发送 `mkdp:state` |
| `scripts/lib/standalone-preview-server.js` | 修改 | topbar 新增控件按钮 + popover；TOC 升级为树形结构；新增 postMessage 处理 |

## 不变的部分

- 独立预览模式（非 browse）的所有行为保持不变
- `markdown.css`、`highlight.css`、`katex.css` 不做修改
- `export.js` 的导出逻辑不变，仅增加通过 postMessage 触发的入口
- 文档端的 `postTocToParent()` 数据格式不变（已包含 level 字段）
- Shell sidebar、文件列表等与文档无关的部分不变
