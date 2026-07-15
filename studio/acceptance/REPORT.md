# Markdown Preview 验收报告

验收日期：2026-07-15

验收对象：`feature/markdown-studio` 生产构建

验收结论：**通过，可以进入合并与试用阶段**

## 本轮发现并修复

- 对齐顶层 meta CSP 与部署响应头，消除导出净化过程中的 CSP console error。
- 将主题同步到根元素 `color-scheme` 和 `theme-color`，使原生控件与浏览器 UI 正确适配深色模式。
- 补充 skip link、文件输入可访问名称、表单 `name`/`autocomplete`。
- 将移动工具栏触控目标提高到至少 40px。
- 补充 modal/Sheet 的 `overscroll-behavior` 和按钮触控反馈。
- 修复 681–1179px 平板宽度下文档列表和目录入口不可达。
- 在移动文档 Sheet 增加“删除当前文档”，覆盖取消和确认路径。
- 移动端补充主题切换入口，并验证刷新后持久化。
- 源文本自动保存失败时保留当前草稿和焦点；放弃未保存修改前增加二次确认。
- 预览脚本启动失败时隐藏永久卡住的 iframe 占位，改为明确的可恢复失败态。
- 导出超时错误统一增加“导出失败”语义，并保证操作按钮恢复可用。
- 允许经 URL policy 校验的 HTTP(S) 外链在无 `opener` 的独立页打开，保留 opaque iframe 隔离。
- 预览启动和快照请求增加 5 秒超时，避免 loading 或导出状态无限挂起。

## 独立黑盒结果

| 指标 | 结果 |
| --- | ---: |
| Python Playwright 场景 | 15 |
| 通过 | 15 |
| 失败 | 0 |
| 警告 | 0 |
| Console error | 0 |
| 未捕获异常 | 0 |

## 全量自动化结果

| 测试集 | 结果 |
| --- | --- |
| Vitest 单元测试 | 18/18 通过 |
| JavaScript Playwright E2E | 16/16 通过 |
| Python Playwright production 验收 | 15/15 通过 |
| Markdown Preview production build | 通过 |
| CLI package build | 通过 |
| Markdown Preview static server | 通过 |
| CLI package | 通过 |
| 旧 Browser 回归 | 通过 |
| 旧 Scratch route 回归 | 通过 |
| npm audit | 0 vulnerabilities |

## Web Interface Guidelines 静态审查

### `studio/index.html`

`studio/index.html:5` - viewport 未禁用缩放；color-scheme、theme-color 与 CSP 已配置，pass

### `studio/src/App.jsx`

`studio/src/App.jsx:178` - skip link 指向唯一 main landmark，键盘跳转已通过黑盒验证

`studio/src/App.jsx:226` - 隐藏文件输入具备可访问名称、`name` 与 `autocomplete`，pass

### `studio/src/components/PasteDialog.jsx`

`studio/src/components/PasteDialog.jsx:72` - textarea 具备 label、name、autocomplete、spellcheck 与 inline error，pass

### `studio/src/components/SourceDialog.jsx`

`studio/src/components/SourceDialog.jsx:62` - textarea 具备 label、name、autocomplete 与明确保存文案，pass

### `studio/src/styles.css`

`studio/src/styles.css:56` - button 使用 `touch-action: manipulation` 与明确 tap highlight，pass

`studio/src/styles.css:65` - 键盘 focus-visible 样式存在，pass

`studio/src/styles.css:614` - modal/Sheet 限制 overscroll，pass

`studio/src/styles.css:744` - rail 收起时平板导航入口保持可见，pass

## 视觉复核

- 桌面空状态：主 CTA 清楚，阅读区域与左右 rail 层级明确。
- 桌面阅读页：正文宽度、标题节奏、代码/表格/Mermaid 容器一致。
- 深色模式：正文、工具栏、rail、边界与 Mermaid 对比度可读。
- 桌面粘贴弹窗：单一主任务、错误就地显示、焦点清楚。
- 手机粘贴页：全屏输入空间充足，主操作固定在自然阅读顺序末端。
- 手机文档 Sheet：当前文档与危险操作分区清晰。
- 平板目录 Sheet：在 rail 收起后仍保留完整导航能力。

截图位于 `studio/acceptance/artifacts/`：

- `desktop-empty.png`
- `desktop-paste-validation.png`
- `desktop-rich-light.png`
- `desktop-rich-dark.png`
- `mobile-paste.png`
- `mobile-reading.png`
- `mobile-documents-sheet.png`
- `tablet-toc-sheet.png`

## 残余风险与非阻塞改进

- 删除确认使用浏览器原生 confirm，可靠但视觉上不完全品牌化；可在后续迭代替换为自定义确认 dialog。
- 极端复杂但未超过字节上限的 Markdown 仍可能短暂占用浏览器主线程。
- 当前自动化以 Chromium 为发布基线；扩大公网用户范围前建议增加 WebKit/Firefox 和至少一台真实 iPhone 的冒烟测试。
- 本地内容不加密；必须继续使用专用 origin，不能与其他应用共享 origin。
- 多标签页可检测其他页面的变化，但不实现并发编辑冲突合并；个人项目阶段不引入 IndexedDB 或同步引擎。
