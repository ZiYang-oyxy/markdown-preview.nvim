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
- **构建链顺序**：`yarn build-app` → `yarn build-cli-package` → 在 `packages/cli` 下 `npm pack`。注意 `build-app` 会自动 `git add -A dist`（dist 的 Next.js hash 抖动会进暂存区，正常）。
- **发布 tarball 是 gitignore 的**，从不提交进仓库——只作 release 资产。`git add -A` 不会误带它。
- **本地验证必做**：`node test/cli-package.test.js` + 临时目录 `npm install` 该 tarball 并跑 `mkdp --version` 核对版本；同时确认修复确实进了 tarball（grep 关键代码），而非只对了版本号。
- **建 release 用已存在的 tag**：先 `git tag -a` 并 push tag，再 `gh release create ... --verify-tag`，避免 `gh` 从默认分支自动建 tag。
- **发布后核对**：`gh release view <tag> --json tagName,targetCommitish,assets,url` —— `targetCommitish` 应为 `master`，资产名与版本一致；再 curl 资产 URL 确认可下载（HTTP 200）。

### 已发布版本参考

- `toolbox-v0.1.0`：首个统一到 master 的 toolbox 包（browse fzf 搜索、scratch、固定右侧 TOC）。
- `toolbox-v0.1.1`：browse fzf 排序修复（对齐 fzf 权重 + 文件名命中绝对优先）。
- `toolbox-v0.1.2`：browse 文件名高亮错位修复（后端返回 `nameMatchPositions`，高亮文件名内匹配段而非散落的整路径位置）。

## 测试

无统一 test runner，测试是独立的 node 脚本，直接 `node test/<name>.test.js` 运行。browse 相关核心：`test/browse-service.test.js`（含 fzf 排序回归用例）、`test/cli-package.test.js`、`test/browse-fzf-search.e2e.test.js`。

## 代码同步约定

`scripts/lib/browse-service.js` 与 `packages/cli/lib/browse-service.js` 必须逐字节一致（CLI 包是 scripts 版的副本）。改其一后用 `diff` 校验并同步另一份。同理 `scripts/lib/standalone-preview-server.js` 与 `packages/cli/lib/server.js` 的 browse shell 需保持同步（见 toolbox SOP 发布前检查）。
