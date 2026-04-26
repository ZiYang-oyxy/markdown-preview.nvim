# Markdown Preview Toolbox Release SOP

本 SOP 用于发布 `toolbox-v*` GitHub Release，目标是确保独立 `mkdp` CLI tarball 中的 browse UI、预览静态资源、安装脚本和 release 资产版本一致。

## 适用范围

- GitHub Release tag：`toolbox-v<version>`
- Release 标题：`Markdown Preview Toolbox v<version>`
- 资产：
  - `ziyang-oyxy-markdown-preview-toolbox-<version>.tgz`
  - `install-markdown-preview-toolbox.sh`

## 发布前检查

发布前必须确认这些点：

- `package.json`、`packages/cli/package.json`、`scripts/install-markdown-preview-toolbox.sh` 的版本一致。
- CLI 包内 `packages/cli/lib/server.js` 已同步当前 browse shell，不得只更新 `scripts/lib/standalone-preview-server.js`。
- CLI 包内 `packages/cli/lib/browse-service.js` 已同步当前 browse-service 行为。
- `app/pages/index.jsx` 和 `app/_static/page.css` 已包含当前预览页样式和交互。
- `node test/cli-package.test.js` 必须覆盖 browse shell 中的新版控件标记。

## 标准验证命令

```bash
node test/cli-package.test.js
yarn build-app
yarn build-cli-package
cd packages/cli
npm pack --dry-run
npm pack
TMP_PREFIX="$(mktemp -d /tmp/mkdp-toolbox-test-XXXXXX)"
npm install --prefix "$TMP_PREFIX" ./ziyang-oyxy-markdown-preview-toolbox-<version>.tgz
"$TMP_PREFIX/node_modules/.bin/mkdp" --version
rm -rf "$TMP_PREFIX"
```

## Browse UI 回归检查

`node test/cli-package.test.js` 中必须至少验证 `mkdp browse` 外层 shell 包含以下稳定标记：

- `class="sidebar-search"`
- `id="collapse-btn"`
- `id="content-topbar"`
- `id="theme-btn"`
- `id="export-btn"`

这些标记用于防止只发布旧 browse shell 的版本。

## 覆盖已删除 Release

如果 GitHub 上的 release 和 tag 都已删除，可以覆盖同名版本：

```bash
git tag -fa toolbox-v<version> -m "Release toolbox-v<version>"
git push origin feature/markdown-preview-toolbox-cli
git push origin +toolbox-v<version>
```

创建 release 时使用已存在的 tag，不要让 `gh release create` 自动从默认分支创建 tag：

```bash
gh release create toolbox-v<version> \
  packages/cli/ziyang-oyxy-markdown-preview-toolbox-<version>.tgz \
  scripts/install-markdown-preview-toolbox.sh \
  --repo ZiYang-oyxy/markdown-preview.nvim \
  --verify-tag \
  --title "Markdown Preview Toolbox v<version>" \
  --notes-file <release-notes.md>
```

创建后必须核对：

```bash
gh release view toolbox-v<version> \
  --repo ZiYang-oyxy/markdown-preview.nvim \
  --json tagName,name,targetCommitish,assets,url
```

`targetCommitish` 应为 `feature/markdown-preview-toolbox-cli`，资产名必须和版本号一致。
