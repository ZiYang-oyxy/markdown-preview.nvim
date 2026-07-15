# Markdown Preview 验收方案

本目录提供一套独立于 Vitest 和项目内 JavaScript E2E 的黑盒验收。它使用原生 Python Playwright，只通过公开 UI 和浏览器 API 操作 production build，用来验证真实用户路径、响应式布局、可访问性和浏览器运行质量。

## 测试分层

| 层级 | 工具 | 主要职责 |
| --- | --- | --- |
| 单元测试 | Vitest | 存储事务、容量限制、协议 schema、URL policy、导出净化 |
| 产品 E2E | Playwright Test | 核心工作流、安全 payload、移动 Sheet、快速渲染竞态 |
| 独立黑盒验收 | Python Playwright | 桌面/手机/平板真实交互、下载、文件导入、焦点、控制台、截图 |
| CLI/服务测试 | Node test | 固定端口、token、Host、CSP、路径穿越、发布包 |
| 视觉复核 | 截图人工检查 | 层级、留白、密度、深色模式、弹窗、Sheet 和触控体验 |

任一自动化用例失败均阻止发布。视觉复核中的功能缺口、不可达操作或明显布局破损同样阻止发布；纯审美建议记录为非阻塞改进。

## 黑盒覆盖矩阵

1. 桌面空状态与主操作。
2. 粘贴弹窗的初始焦点、空输入错误和 Escape。
3. Markdown、表格、代码高亮、KaTeX、Mermaid。
4. raw HTML、事件属性、危险 URL、远程图片安全过滤。
5. 目录跳转、深色主题和刷新恢复。
6. 多文档不覆盖、切换和仅编辑当前文档。
7. 下载 HTML 的 CSP、无脚本、无事件属性、无远程资源。
8. UTF-8 文件导入和非法编码拒绝。
9. 删除取消与确认。
10. 单文档 1 MiB 硬限制。
11. 可访问名称、表单标签、重复 ID、main landmark、skip link。
12. 手机全屏粘贴、无横向溢出、文档/目录 Sheet、源码页、移动删除。
13. 手机可见按钮的最小 40px 触控尺寸。
14. 900px 平板宽度下的文档列表和目录入口。
15. console error 与未捕获异常必须为零。

JavaScript E2E 另外覆盖移动端主题切换持久化、HTTPS 外链无 `opener` 弹出、源文本保存失败后保留草稿与确认放弃、预览启动失败恢复界面，以及导出超时恢复。

50 份文档、4 MiB 总量、Quota 回滚和损坏数据恢复由确定性更高的 Vitest 单元测试覆盖，避免在 UI 层重复制造大量慢用例。

## 运行方法

先构建 production artifact：

```bash
npm --prefix studio run build
```

然后使用 `webapp-testing` skill 提供的 server helper：

```bash
python [REDACTED_LOCAL_VALUE]/.agents/skills/webapp-testing/scripts/with_server.py \
  --server "npm --prefix studio run preview -- --host 127.0.0.1 --port 4175 --strictPort" \
  --port 4175 \
  --timeout 30 \
  -- python -u studio/acceptance/acceptance.py
```

脚本退出码非零代表验收失败。结果和截图生成在 `studio/acceptance/artifacts/`，该目录不进入 Git。

## 完整发布前命令

```bash
npm --prefix studio test
npm --prefix studio run build
npm --prefix studio run test:e2e
node test/studio-static-server.test.js
node test/cli-package.test.js
node test/browse-service.test.js
node test/scratch-route.test.js
npm --prefix studio audit --audit-level=high
```

## 测试边界

- 黑盒验收遵循 skill 要求固定使用 headless Chromium。
- WebKit、Firefox 和真实 iOS Safari 属于发布到大范围公网前的兼容性扩展矩阵，不在当前个人项目的阻塞范围内。
- sandbox 能限制权限，不能完全消除病态 Markdown 造成的 CPU/内存压力；输入和 Mermaid 已有硬限制，但仍需保留这一残余风险。
- `localStorage` 测试基于专用 origin 前提；共享 origin 子目录部署不属于受支持的安全部署方式。
- 多标签页同时编辑不提供冲突解析；个人项目阶段优先保持本地存储模型简单可维护。
