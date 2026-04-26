# Browse UI Redesign — 设计规格

## 概述

将 browse 模式的 web 界面从当前"功能缝合"的状态重新设计为统一的 **Notion/语雀风格 markdown 文件浏览器**。核心目标：文档优先、宽敞排版、侧边目录导航、内联 SVG 图标系统。

## 设计决策记录

| 决策项 | 选择 | 备选方案 |
|--------|------|----------|
| 视觉风格 | Notion/语雀 文档风格 | VS Code / macOS Finder / GitHub |
| 目录结构 | 双栏分离（左文件栏 + 右浮动 TOC） | 合并侧栏 / Tab 切换 |
| 非 MD 文件 | 保持现有 fallback 逻辑，优化视觉样式 | 代码高亮+下载 / 纯 MD 专注 |
| 图标方案 | 内联 SVG（零依赖，支持主题色） | 图标字体库 / Emoji |
| 布局方案 | 方案 C：宽侧栏卡片列表 | 经典三栏 / 双面板+图标导航 |
| 侧栏折叠 | 支持，折叠为 48px 图标窄条 | 不可折叠 |
| 文件过滤 | 只显示目录、Markdown、可显示文本文件；隐藏二进制文件 | 显示所有文件 |

---

## 1. 整体布局

```
┌──────────────────────────────────────────────────────────┐
│  文件侧栏 (280px / 可折叠至 48px)  │      内容区        │
│  ┌─────────────────────────────┐    │  ┌──────────────┐  │
│  │ [搜索框]                    │    │  │ 面包屑顶栏   │  │
│  │ ← home / docs              │    │  │ + 操作按钮   │  │
│  │ ──────────────              │    │  ├──────────────┤  │
│  │ 📁 api             3 items │    │  │              │  │
│  │ 📁 guides          5 items │    │  │  文档内容    │ TOC│
│  │ 📄 README.md  ← selected   │    │  │ (720px max)  │(浮│
│  │ 📄 CHANGELOG.md            │    │  │              │动) │
│  │ 📄 config.yaml             │    │  │              │  │
│  └─────────────────────────────┘    │  └──────────────┘  │
└──────────────────────────────────────────────────────────┘
```

- **两大区域**：左侧文件侧栏 + 右侧内容区
- **文件侧栏宽度**：展开 280px，折叠 48px
- **内容区**：文档居中渲染 `max-width: 720px`，右侧浮动 TOC
- **响应式**：窗口 < 1100px 时 TOC 隐藏，改为顶栏按钮触发右侧抽屉

---

## 2. 文件侧栏

### 2.1 展开态 (280px)

从上到下依次为：

1. **顶栏**：标题 "Files" + 折叠按钮 (`<` 箭头)
2. **搜索框**：输入即时过滤当前目录文件，圆角带搜索图标
3. **面包屑**：`← home / docs`，点击上级目录返回，左侧 `←` = 返回上一级
4. **分隔线**
5. **文件卡片列表**：每条包含图标 + 文件名 + 元信息（大小 / 子项数）

### 2.2 折叠态 (48px)

- 只显示展开按钮 (`>`) + 返回上级按钮 + 文件图标缩略图（竖排）
- 每个图标 hover 显示 tooltip（文件名），点击直接打开该文件
- 折叠/展开带 `transition: width 200ms ease` 动画
- 状态持久化到 `localStorage`

### 2.3 文件过滤规则

侧栏**只显示**以下类型条目：

- **目录** — 始终显示（用于导航）
- **Markdown 文件** — `.md` / `.markdown` / `.mdown` / `.mkd` / `.mkdn` / `.mdx`
- **可显示文本文件** — 由 `readBrowseFile()` 返回 `kind: 'fallback', fallback: 'text'` 的文件

**隐藏**以下类型：

- 二进制文件（`readBrowseFile()` 返回 `fallback: 'download'`）
- 已被 `browse-service.js` 忽略的目录（`.git`、`node_modules` 等）

实现方式：在 `listBrowseDirectory()` 中对非目录条目增加 `readBrowseFile()` 预检查，或在客户端根据文件扩展名过滤。推荐服务端过滤以减少传输量。

### 2.4 交互行为

| 操作 | 行为 |
|------|------|
| 点击文件夹 | 重载侧栏为该目录内容，更新面包屑和 URL hash |
| 点击 Markdown 文件 | 右侧内容区渲染预览，侧栏高亮选中态 |
| 点击文本文件 | 右侧内容区显示代码高亮视图 |
| 点击 Blocked 条目 | 无响应（disabled 态，tooltip 提示 "outside root"） |
| 搜索框输入 | 即时过滤当前目录文件名（客户端过滤） |
| 面包屑点击 | 导航到对应上级目录 |

---

## 3. 内容区

### 3.1 顶栏

- **左侧**：文件图标 + 面包屑路径 + 文件大小
- **右侧**：操作按钮组
  - `Theme` — 切换亮/暗主题
  - `Raw` — 下载原始文件

### 3.2 Markdown 渲染

- 内容居中：`max-width: 720px; margin: 0 auto`
- 排版：字号 15px，行高 1.8，标题加粗，层次分明
- 代码块：圆角卡片（`border-radius: 10px`），带 copy 按钮
- 表格：圆角边框容器，表头带背景色
- Heading anchor：hover 标题显示链接图标
- 渲染引擎：保持现有 `markdown-it` + 全部插件（katex、mermaid、highlight.js 等）

### 3.3 浮动 TOC

- **宽屏 (≥ 1100px)**：`position: sticky` 浮动在内容区右侧
- **窄屏 (< 1100px)**：隐藏，改为顶栏 `TOC` 按钮触发右侧滑出抽屉（backdrop overlay）
- **Active tracking**：`IntersectionObserver` 追踪当前可见 heading，蓝色左侧线标记
- **层级缩进**：h2 一级，h3 缩进显示为子项
- 标题 "On this page"

### 3.4 文本文件 Fallback

- 顶栏显示文件名 + 大小 + "text" 标签
- 内容以代码高亮块显示（`<pre>` + 语法高亮，继承现有 highlight.js）
- 圆角卡片容器，与 markdown 中代码块风格一致

---

## 4. 图标系统

所有图标为内联 SVG，20x20 尺寸，支持亮/暗主题色适配。

| 类型 | 颜色 | 描述 |
|------|------|------|
| Folder | amber `#e8a948` | 文件夹形状，半透明填充 + 描边 |
| Markdown | blue `#3b82f6` | 文档形状 + 对勾/横线装饰，表示可渲染文档 |
| Text File | theme `currentColor` | 文档形状，低透明度描边，通用文本文件 |
| Blocked | red `#ef4444` badge | 文档形状 + 红色圆形禁止标记覆盖 |
| Search | theme `currentColor` | 放大镜，用于搜索框 |
| Chevron | theme `currentColor` | 方向箭头，用于面包屑和文件夹进入指示 |
| Theme toggle | theme `currentColor` | 太阳图标，用于主题切换按钮 |
| Download | theme `currentColor` | 向下箭头 + 底线，用于 Raw 下载按钮 |
| TOC | theme `currentColor` | 三段递减横线，用于 TOC 按钮 |
| Collapse/Expand | theme `currentColor` | 左/右箭头，用于侧栏折叠按钮 |

---

## 5. 主题系统

继承现有的 CSS 自定义属性方案，支持 `prefers-color-scheme` 自动切换 + 手动切换。

```
--bg         页面背景
--surface    侧栏/卡片背景
--border     边框
--text       主文本
--muted      次要文本
--accent     强调色 (#3b82f6)
--accent-soft 强调色低透明度
```

---

## 6. 技术实现要点

### 6.1 不改变的部分

- 服务端 `browse-service.js` 的核心文件系统逻辑
- Socket.IO 连接方式和 `refresh_content` 协议
- React 预览页面 `app/pages/index.jsx` 的 markdown 渲染引擎和插件体系
- CLI 入口 `mkdp-browse.js` 和 session 工厂

### 6.2 需要修改的部分

- **`standalone-preview-server.js` 中的 `buildBrowseShellHtml()`**：完全重写，输出新的侧栏+内容区布局 HTML/CSS/JS
- **`browse-service.js` 的 `listBrowseDirectory()`**：增加文件类型过滤，排除二进制文件（`fallback: 'download'` 类型）
- **`app/pages/index.jsx`**：移除 browse 模式下的内嵌 TOC 面板（TOC 改由 browse shell 的浮动 TOC 实现），或保留 iframe 内 TOC 但在 browse 模式下隐藏
- **CSS 自定义属性**：统一 browse shell 和 iframe 内预览页的主题变量

### 6.3 iframe 策略

当前 markdown 预览通过 iframe 加载 React 页面（`/page/1?browsePath=...`）。设计上有两种路径：

**保持 iframe（推荐）**：
- browse shell 负责侧栏 + 顶栏 + 浮动 TOC
- iframe 只负责 markdown body 渲染（隐藏 iframe 内自带的 TOC 和 header）
- 优点：不动 React 渲染代码，改动范围最小
- 缺点：TOC 需要通过 `postMessage` 从 iframe 内传出 heading 数据

**移除 iframe**：
- 将 markdown 渲染逻辑内联到 browse shell 中
- 优点：无 iframe 通信开销，TOC 直接读取 DOM
- 缺点：需要在 browse shell 中复制或引用整个 markdown-it 渲染管线

推荐保持 iframe 方案，通过 `postMessage` 桥接 heading 数据。

### 6.4 TOC 数据桥接（iframe → browse shell）

iframe 内的 React 页面在渲染完 markdown 后，通过 `window.parent.postMessage()` 将 heading 列表发送给 browse shell：

```js
// iframe 内（index.jsx 渲染完成后）
window.parent.postMessage({
  type: 'mkdp:toc',
  headings: [
    { id: 'quick-start', text: 'Quick Start', level: 2 },
    { id: 'configuration', text: 'Configuration', level: 2 },
    // ...
  ]
}, '*');

// iframe 内（滚动时）
window.parent.postMessage({
  type: 'mkdp:active-heading',
  id: 'configuration'
}, '*');
```

browse shell 监听这些消息，渲染/更新浮动 TOC。

### 6.5 侧栏搜索

客户端即时过滤：在已加载的文件列表中按文件名子串匹配，无需请求服务端。

---

## 7. 响应式断点

| 断点 | 行为 |
|------|------|
| ≥ 1100px | 侧栏展开 + 内容区 + 浮动 TOC |
| 960–1100px | 侧栏展开 + 内容区，TOC 隐藏（按钮触发抽屉） |
| < 960px | 侧栏折叠为窄条 + 内容区全宽，TOC 按钮触发抽屉 |

---

## 8. 范围外（不做）

- 文件编辑功能
- 多文件标签页
- 文件搜索全文检索（只做文件名过滤）
- 自定义图标映射配置
- 拖拽排序或重命名
