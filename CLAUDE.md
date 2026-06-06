# markdown-preview.nvim — Claude 指引

## 发布 Release

本仓库有**两条独立的发布线**，先认准目标再动手：

| 发布线 | tag 形如 | 用途 | 权威 SOP |
|--------|---------|------|----------|
| **Toolbox CLI**（最常用） | `toolbox-v<x.y.z>` | 独立 `mkdp` CLI 全家桶（browse UI、scratch、TOC） | **`docs/toolbox-release-sop.md`** |
| 通用 GitHub Release | 其他 | 仓库本身的发布 | `docs/release-sop.md` |

**当被要求「发新 release / 发布到 GitHub Releases」时，默认是 Toolbox CLI 线** —— 严格按 `docs/toolbox-release-sop.md` 执行，不要凭记忆拼命令。

### Toolbox 发布要点（易错处，细节以 SOP 为准）

- **不要用 `yarn release:github`**（`scripts/mkdp-release-github.js`）来建 toolbox release：它默认 `browse-v*` tag + 英文 notes，**不适用** toolbox 线。按 SOP 直接用 `gh release create`。
- **版本号三处必须一致**：`package.json`、`packages/cli/package.json`、`scripts/install-markdown-preview-toolbox.sh` 的 `VERSION` 默认值。发版即同步 bump 这三处。
- **构建链顺序**：`yarn build-app` → `yarn build-cli-package` → 在 `packages/cli` 下 `npm pack`。`build-app` 会自动 `git add -A dist`（含目录改动）。
- **发布 tarball 是 gitignore 的**，从不提交进仓库——只作 release 资产。`git add -A` 不会误带它。
- **本地验证必做**：`node test/cli-package.test.js` + 临时目录 `npm install` 该 tarball 并跑 `mkdp --version` 核对版本；同时确认修复确实进了 tarball（grep 关键代码），而非只对了版本号。
- **建 release 用已存在的 tag**：先 `git tag -a` 并 push tag，再 `gh release create ... --verify-tag`，避免 `gh` 从默认分支自动建 tag。
- **发布后核对**：`gh release view <tag> --json tagName,targetCommitish,assets,url` —— `targetCommitish` 应为 `master`，资产名与版本一致；再 curl 资产 URL 确认可下载（HTTP 200）。
- **release notes 必须包含「安装 / 升级」一节**（一键 curl 命令），方便用户直接复制使用。模板见下。

#### Release notes 模板（每个 toolbox 版本都要照抄结构）

```md
## Markdown Preview Toolbox v<version>

### <修复 / 改进 / 功能> （视情况选择）

- 一句话主标题。后跟可选段落补充 why & how。
- 视情况列多条 bullet。

### 安装 / 升级

​```sh
curl -fsSL https://github.com/ZiYang-oyxy/markdown-preview.nvim/releases/download/toolbox-v<version>/install-markdown-preview-toolbox.sh | sh
​```

### 校验

- 列出本次发布前已跑过的回归命令（如 `node test/cli-package.test.js`、其他相关脚本）。
- 一句话说明 tarball 内确实带上了对应修复（避免「版本对了内容没对」）。
```

参考样板：[toolbox-v0.1.2](https://github.com/ZiYang-oyxy/markdown-preview.nvim/releases/tag/toolbox-v0.1.2)。新版本如果忘了写「安装 / 升级」一节，必须补一次 `gh release edit <tag> --notes-file ...` 修正。

### 已发布版本参考

- `toolbox-v0.1.0`：首个统一到 master 的 toolbox 包（browse fzf 搜索、scratch、固定右侧 TOC）。
- `toolbox-v0.1.1`：browse fzf 排序修复（对齐 fzf 权重 + 文件名命中绝对优先）。
- `toolbox-v0.1.2`：browse 文件名高亮错位修复（后端返回 `nameMatchPositions`，高亮文件名内匹配段而非散落的整路径位置）。
- `toolbox-v0.1.3`：dist 产物去 hash 化（`commons.js` / `main.js` / `webpack.js`），从根上消除 nvim 安装时 `untracked working tree files would be overwritten by checkout` 的撞车。
- `toolbox-v0.1.4`：离线导出图片交互统一到 `MkdpPreviewViewer`，与 nvim 实时预览完全一致（缩放 / 拖拽 / 毛玻璃 overlay / 键盘）。

## 测试

无统一 test runner，测试是独立的 node 脚本，直接 `node test/<name>.test.js` 运行。browse 相关核心：`test/browse-service.test.js`（含 fzf 排序回归用例）、`test/cli-package.test.js`、`test/browse-fzf-search.e2e.test.js`。

## `dist/` 必须提交，且产物文件名已去 hash

**结论先行：`dist/` 必须随仓库提交，不能加进 `.gitignore`。**

原因：本仓库是 **nvim 插件**，用户通过 plugin manager 直接 `git clone` 安装即用，不会在本地 `yarn install` + build。Next.js 生成的 web 产物必须随仓库分发，否则插件预览页会 404。这条已经探索过，不要再纠结于"把 dist ignore 掉更干净"——结论是不行。

### 历史撞车问题与去 hash 化

历史上反复出现这个安装报错：

```
error: The following untracked working tree files would be overwritten by checkout:
    dist/web/_next/static/chunks/commons.<oldhash>.js
    dist/web/_next/static/runtime/main-<oldhash>.js
Please move or remove them before you switch branches.
```

根因：Next.js 默认把 client 入口和 commons chunk 命名为 `[name]-[contenthash].js`，内容一变文件名就变。用户端只要因为任何原因（之前手动跑过 build、plugin manager 切换分支留痕等）残留了旧 hash 文件成为 untracked，再 pull 时就会因 git checkout 拒绝覆盖 untracked 而中止安装。

**解决：在 `app/next.config.js` 里通过 `webpack` 钩子把客户端 `output.filename` / `output.chunkFilename` 改回稳定名（`main.js` / `webpack.js` / `commons.js` / `[name].js`）。** 同名文件每次都是覆盖，不再产生 untracked 残留撞车。

维护这条配置时的注意事项：

- **不要再加回 `[contenthash]` 之类**——只要文件名跟内容绑定，撞车就会回来。浏览器缓存失效在本地 nvim 预览场景里基本不重要。
- `static/<buildId>/pages/...` 这一组目录名仍会随 build 变（Next 的 buildId 机制），但这不是撞车点：旧 buildId 目录由 `scripts/mkdp-build-app.js` 的 `ensureEmptyDir(distWebDir)` 整个清掉，`git add -A dist` 会正确生成 rename/delete，用户端 pull 时是普通的"删旧目录、加新目录"，不存在 untracked 撞同名的问题。
- 若将来升级 Next 或改 build 链，重新检查 `dist/web/_next/static/{chunks,runtime}/` 下文件名是否还稳定，跑一次 build 后用 `find dist/web/_next -type f | sort` 核对。

## 代码同步约定

`scripts/lib/browse-service.js` 与 `packages/cli/lib/browse-service.js` 必须逐字节一致（CLI 包是 scripts 版的副本）。改其一后用 `diff` 校验并同步另一份。同理 `scripts/lib/standalone-preview-server.js` 与 `packages/cli/lib/server.js` 的 browse shell 需保持同步（见 toolbox SOP 发布前检查）。

## 图片放大查看器 (MkdpPreviewViewer)

实时预览（nvim 用，走 `app/pages/preview.js`）、standalone 预览（browse / scratch / cli，走 `app/_static/standalone-runtime.js`）、离线导出 HTML（走 `app/_static/export.js`）三处的"点图片放大 + 工具栏（缩小/放大/1:1/适应/关闭）+ 毛玻璃 overlay + 拖拽 + 滚轮 + 键盘"交互 **共享同一份实现**：`app/_static/preview-viewer.js`，对外挂在 `window.MkdpPreviewViewer.bindPreviewInteractions(root)`。

- standalone-runtime.js 内的 `bindPreviewInteractions` 只是个 thin wrapper，调用 `window.MkdpPreviewViewer.bindPreviewInteractions`。
- 离线导出时，`export.js` 通过 `fetchAssetAsText('/_static/preview-viewer.js')` 把整个脚本内联进生成的 HTML，并在末尾追加 bootstrap `MkdpPreviewViewer.bindPreviewInteractions(document)`。所以离线 HTML 的图片交互与 nvim preview 完全一致。
- 视觉样式（`.mkdp-preview-viewer` overlay 的毛玻璃、工具栏、CSS variables）在 `app/_static/page.css`，已被 export.js 的 `shouldInlineStylesheet` 内联进导出 HTML。
- `app/pages/preview.js` 出于历史原因（webpack 打 ESM 模块）还保留着自己的一份相同逻辑。改 viewer 行为时**两边都要改**，并跑下文测试。

**禁止**在 export.js 里再造一份 `mkdp-static-lightbox` 之类的"备份 lightbox"——离线页统一靠 `MkdpPreviewViewer`。

### 自检

改动 viewer 后用 playwright 跑：起 `createStandalonePreviewSession`，触发 `#mkdp-export-btn`，捕获生成的 HTML 字符串，确认：

- 包含 `MkdpPreviewViewer`
- 不包含 `mkdp-static-lightbox` / `:target`
- 包含 `.mkdp-preview-viewer` 与 `backdrop-filter`

再用 http server 起这份 HTML，模拟点击 `.markdown-body img` 或 `.markdown-body .mermaid svg`，确认 `#mkdp-preview-viewer` overlay 加上 `.is-open`，工具栏 5 个按钮齐全。
