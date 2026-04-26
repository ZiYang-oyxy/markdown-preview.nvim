# markdown-preview

[English](./README.md) | [简体中文](./README_zh.md)

`markdown-preview` 是一个 Markdown 预览与导出工具箱。

它复用同一套本地运行时，并提供多种入口：

- CLI 工具：本地预览、独立 HTML 导出、目录浏览、Playwright 校验
- 浏览器预览页：实时渲染、目录导航、主题切换、页面内导出
- 可选的 Vim / Neovim 集成：编辑器只是工具箱的一个接入层，不再是产品中心

![Markdown 预览演示](https://user-images.githubusercontent.com/5492542/47603494-28e90000-da1f-11e8-9079-30646e551e7a.gif)

## 功能概览

- 在浏览器中实时预览 Markdown 内容
- 导出带内联资源的独立 HTML 文件
- 为 Markdown 工作区提供目录浏览模式
- 使用 Playwright 做预览页回归校验
- 可选的 Vim / Neovim 命令集成
- 支持 KaTeX、PlantUML、Mermaid、Chart.js、flowchart.js、Graphviz / dot、js-sequence-diagrams、任务列表、emoji、脚注、定义列表、引用、目录、本地图片等渲染能力

## 运行时结构

当前仓库的核心不是单一插件，而是一套共享运行时：

- CLI 命令会启动本地运行时
- Vim / Neovim 集成也会复用同一套运行时
- 运行时通过 HTTP + Socket.IO 驱动浏览器预览页
- 浏览器预览页负责实时渲染和独立 HTML 导出

运行时静态资源由 `app/runtime-asset-manifest.json` 解析，目前指向 `dist/web` 和 `dist/static`。

## 安装工具箱

### 独立 npm 包

如果你只需要 Markdown 工具箱命令，不想克隆整个仓库，可以安装预构建 CLI 包：

```bash
npm install -g @ziyang-oyxy/markdown-preview-toolbox
```

安装后会提供 `mkdp` 命令：

```bash
mkdp preview README.md
mkdp browse .
mkdp export README.md -o README.html
```

`preview` 和 `browse` 使用包内自带的预构建网页资源。`export` 还需要目标机器安装 Playwright：

```bash
npm install -g playwright
npx playwright install chromium
```

### 仓库源码安装

先克隆仓库并安装根目录依赖：

```bash
git clone https://github.com/ZiYang-oyxy/markdown-preview.git
cd markdown-preview
yarn install
```

如果你要使用 `preview-test` 或独立 HTML 导出这类依赖 Playwright 的能力，还需要安装 Chromium：

```bash
npx playwright install chromium
```

这就是工具箱本身的默认安装方式。

## 使用工具箱

### 使用已发布的 `mkdp` 命令

安装 `@ziyang-oyxy/markdown-preview-toolbox` 后，可以在任意目录运行独立 CLI：

```bash
mkdp preview /path/to/file.md
mkdp browse /path/to/workspace
mkdp export /path/to/file.md -o /tmp/file.html
```

`mkdp preview` 和 `mkdp browse` 会保持本地服务运行，按 `Ctrl+C` 停止。

### 打开本地预览页

```bash
yarn preview-open -- test/demo.md
```

这会启动本地预览运行时，打开浏览器中的 `/page/1`，并保持服务运行直到你手动停止。

### 导出独立 HTML

```bash
yarn export-html -- test/demo.md -o ./demo.preview.html
```

导出器会启动无头 Chromium，等待预览渲染完成，再写出一个资源已内联的独立 HTML 文件。

### 浏览工作区

```bash
yarn browse -- .
```

目录浏览模式会显示本地文件树，并用同一套预览运行时打开 Markdown 文件。非 Markdown 文件会回退到文本预览或下载模式。

### 用 Playwright 校验预览页

```bash
yarn preview-test -- --fixture all
```

这会运行浏览器级预览校验，并在失败时写出调试产物。

### CLI 共享配置

`preview-open`、`export-html` 和 `browse` 都支持读取 JSON 配置文件：

```json
{
  "theme": "dark",
  "pageTitle": "「${name}」",
  "markdownCss": "/absolute/path/to/markdown.css",
  "highlightCss": "/absolute/path/to/highlight.css",
  "imagesPath": "/absolute/path/to/images",
  "previewOptions": {
    "maid": {
      "themePreset": "warm"
    },
    "disable_filename": 0,
    "toc": {
      "listType": "ul"
    }
  }
}
```

示例：

```bash
yarn export-html -- test/demo.md --config ./mkdp.config.json
```

## 构建并发布独立包

发布前先构建网页运行时资源，并复制到 npm 包目录：

```bash
yarn install --frozen-lockfile
yarn build-app
yarn build-cli-package
```

本地检查包内容：

```bash
cd packages/cli
npm pack --dry-run
```

包内必须包含 `bin/`、`lib/`、`assets/runtime-asset-manifest.json`、`assets/web/index.html` 和 `assets/static/`。

发布 scoped public 包：

```bash
npm publish --access public
```

发布前可以先做本地安装测试：

```bash
cd packages/cli
npm pack
TMP_PREFIX="$(mktemp -d /tmp/mkdp-toolbox-test-XXXXXX)"
npm install --prefix "$TMP_PREFIX" ./ziyang-oyxy-markdown-preview-toolbox-0.0.10.tgz
"$TMP_PREFIX/node_modules/.bin/mkdp" --version
```

## 浏览器预览页能力

当前浏览器预览页不只是“把 Markdown 渲染出来”，还包含这些交互能力：

- 页面工具栏中的亮色 / 暗色主题切换
- Mermaid 主题预设：`modern`、`minimal`、`warm`、`forest`
- 响应式多级目录抽屉
- 图片和 SVG 的点击放大预览
- 可选的文件名页头隐藏
- 可选的内容可编辑预览区域
- 页面内导出按钮，以及 `Ctrl/Cmd+Shift+E` 快捷键

可以参考 [`test/demo.md`](test/demo.md) 查看当前渲染栈的综合示例。

## Vim / Neovim 集成

编辑器集成现在只是工具箱运行时的一个消费者，而不是产品主叙事。

### 作为插件集成安装

如果你想在 Vim 或 Neovim 中使用 `markdown-preview`，先用插件管理器安装仓库，然后在运行时方案里二选一。

#### 方案 A：下载预构建运行时

使用内置安装器，把运行时包下载到 `app/bin`：

```lua
{
  "ZiYang-oyxy/markdown-preview",
  ft = { "markdown" },
  cmd = {
    "MarkdownPreview",
    "MarkdownPreviewStop",
    "MarkdownPreviewToggle",
    "MarkdownPreviewExport",
    "MarkdownPreviewExportFile",
  },
  build = function()
    vim.fn["mkdp#util#install"]()
  end,
}
```

对应的 `vim-plug` 示例：

```vim
Plug 'ZiYang-oyxy/markdown-preview', {
      \ 'do': { -> mkdp#util#install() },
      \ 'for': ['markdown', 'vim-plug']
      \ }
```

#### 方案 B：插件内使用 Node 运行时

安装 `app/` 下的运行时依赖：

```lua
{
  "ZiYang-oyxy/markdown-preview",
  ft = { "markdown" },
  cmd = {
    "MarkdownPreview",
    "MarkdownPreviewStop",
    "MarkdownPreviewToggle",
    "MarkdownPreviewExport",
    "MarkdownPreviewExportFile",
  },
  build = "cd app && npx --yes yarn install",
}
```

对应的 `vim-plug` 示例：

```vim
Plug 'ZiYang-oyxy/markdown-preview', {
      \ 'do': 'cd app && npx --yes yarn install',
      \ 'for': ['markdown', 'vim-plug']
      \ }
```

### 插件命令

除非启用 `g:mkdp_command_for_global`，否则这些命令默认是 buffer-local：

| 命令 | 作用 |
| --- | --- |
| `:MarkdownPreview` | 如有需要先启动预览服务，再为当前 buffer 打开浏览器预览页 |
| `:MarkdownPreviewStop` | 停止预览服务并关闭当前预览页 |
| `:MarkdownPreviewToggle` | 为当前 buffer 切换预览状态 |
| `:MarkdownPreviewExport` | 让当前预览页生成独立 HTML，并触发浏览器下载 |
| `:MarkdownPreviewExportFile [output_path]` | 让当前预览页生成独立 HTML，并写入本地文件 |

可用映射：

- `<Plug>MarkdownPreview`
- `<Plug>MarkdownPreviewStop`
- `<Plug>MarkdownPreviewToggle`
- `<Plug>MarkdownPreviewExport`
- `<Plug>MarkdownPreviewExportFile`

如果 `<leader>me` 还未占用，插件还会自动提供 `MarkdownPreviewExport` 的默认映射。

### 插件配置

全局变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `g:mkdp_auto_start` | `0` | 进入匹配 buffer 时自动打开预览 |
| `g:mkdp_auto_close` | `1` | buffer 隐藏时自动关闭预览 |
| `g:mkdp_refresh_slow` | `0` | 设为 `1` 时，仅在 `CursorHold`、`BufWrite`、`InsertLeave` 等时机刷新 |
| `g:mkdp_command_for_global` | `0` | 为所有 buffer 注册命令，而不是只对配置 filetype 生效 |
| `g:mkdp_open_to_the_world` | `0` | 将预览服务绑定到 `0.0.0.0`，而不是 `127.0.0.1` |
| `g:mkdp_open_ip` | `''` | 覆盖预览 URL 的 host，适合远程编辑场景 |
| `g:mkdp_browser` | `''` | 指定浏览器应用或命令 |
| `g:mkdp_echo_preview_url` | `0` | 打开预览时在命令行回显 URL |
| `g:mkdp_browserfunc` | `''` | 自定义 Vim 函数名，接收预览 URL |
| `g:mkdp_markdown_css` | `''` | 自定义 `markdown.css` 的绝对路径 |
| `g:mkdp_highlight_css` | `''` | 自定义 `highlight.css` 的绝对路径 |
| `g:mkdp_port` | `''` | 固定预览端口；为空时自动选择 |
| `g:mkdp_page_title` | `'「${name}」'` | 预览页标题模板 |
| `g:mkdp_images_path` | `''` | 本地图片解析的基础目录 |
| `g:mkdp_filetypes` | `['markdown']` | 注册插件命令的 filetype 列表 |
| `g:mkdp_theme` | unset | 可选预览主题，支持 `'light'` 或 `'dark'` |
| `g:mkdp_combine_preview` | `0` | 多个 Markdown buffer 复用同一个预览页 |
| `g:mkdp_combine_preview_auto_refresh` | `1` | 开启复用预览页时，进入 buffer 自动切换预览内容 |
| `g:mkdp_preview_options` | 见下文 | 传给预览页的渲染与交互选项 |

默认 `g:mkdp_preview_options`：

```vim
let g:mkdp_preview_options = {
      \ 'mkit': {},
      \ 'katex': {},
      \ 'uml': {},
      \ 'maid': {},
      \ 'disable_sync_scroll': 0,
      \ 'sync_scroll_type': 'middle',
      \ 'hide_yaml_meta': 1,
      \ 'sequence_diagrams': {},
      \ 'flowchart_diagrams': {},
      \ 'content_editable': v:false,
      \ 'disable_filename': 0,
      \ 'toc': {}
      \ }
```

示例配置：

```lua
vim.g.mkdp_auto_start = 0
vim.g.mkdp_echo_preview_url = 1
vim.g.mkdp_theme = "dark"
vim.g.mkdp_filetypes = { "markdown", "mdx" }
vim.g.mkdp_preview_options = {
  disable_filename = 0,
  content_editable = false,
  sync_scroll_type = "relative",
  toc = {
    listType = "ul",
  },
  maid = {
    themePreset = "forest",
  },
}
```

自定义浏览器回调示例：

```vim
function! OpenMarkdownPreview(url)
  execute 'silent !firefox --new-window ' . shellescape(a:url)
endfunction
let g:mkdp_browserfunc = 'OpenMarkdownPreview'
```

如果启用了 `g:mkdp_combine_preview`，建议同时设置 `g:mkdp_auto_close = 0`，避免切换 buffer 时把共享预览页关闭。

## 渲染器与格式支持

运行时基于 `markdown-it`，并扩展了以下能力：

- `highlight.js` 代码高亮
- 任务列表
- emoji
- 脚注
- 定义列表
- 标题锚点
- 自动目录
- YAML front matter 隐藏
- 引用
- 本地图片重写
- `markdown-it-imsize` 图片尺寸语法
- 同步滚动所需的源码行标记
- KaTeX 行内与块级数学公式
- fenced `plantuml` 和 `@startuml ... @enduml`
- fenced `mermaid` 与关键字识别的 Mermaid 代码块
- fenced `chart` JSON
- fenced `flowchart`
- fenced `dot` / `graphviz`
- fenced `sequence-diagrams`

## 开发

仓库结构：

- `plugin/` 与 `autoload/`：Vimscript 命令、默认配置、autocmd、RPC 桥接、health check
- `src/`：Node attach / runtime loader 的 TypeScript 源码
- `app/`：预览服务、Next 预览页、runtime asset manifest、安装辅助脚本
- `dist/`：运行时使用的导出 Web 资源
- `scripts/`：构建、浏览、导出、预览打开、预览测试等辅助脚本
- `test/`：Node 回归测试与 Markdown fixture

常用命令：

```bash
yarn build-lib
```

```bash
yarn build-app
```

```bash
node test/runtime-asset-layout.test.js
```

```bash
node test/browse-service.test.js
```

```bash
yarn preview-test -- --fixture demo
```

当前没有统一的 `yarn test` 入口，需要按具体脚本分别执行。

## 排障

### CLI 工具箱启动异常

- 先在仓库根目录执行 `yarn install`
- 如果涉及 Playwright，再执行 `npx playwright install chromium`
- 用各脚本的 `--help` 确认参数：
  - `node scripts/mkdp-open-preview.js --help`
  - `node scripts/mkdp-export-html.js --help`
  - `node scripts/mkdp-browse.js --help`
  - `node scripts/mkdp-test-preview.js --help`

### `:MarkdownPreview` 没有打开预览

- 在 Neovim 中运行 `:checkhealth mkdp`
- 确认你已经完成一个插件运行时安装路径：
  - `call mkdp#util#install()` 已把预构建运行时下载到 `app/bin`
  - 或者 `cd app && npx --yes yarn install` 已安装 Node 运行时依赖
- 如果默认 opener 不正确，设置 `g:mkdp_browser` 或 `g:mkdp_browserfunc`

### `:MarkdownPreviewExportFile` 失败

导出到文件需要当前存在活动预览客户端。先运行 `:MarkdownPreview` 打开预览页，再执行 `:MarkdownPreviewExportFile`。

### 远程或 WSL 场景

当编辑器和浏览器不在同一台机器上时，使用 `g:mkdp_open_ip` 或自定义 `g:mkdp_browserfunc`。

## License

MIT
