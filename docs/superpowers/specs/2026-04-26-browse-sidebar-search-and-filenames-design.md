# Browse 侧栏搜索与长文件名优化设计

## 目标

- 将 browse 左侧栏搜索从简单子串匹配升级为类似 fzf 的模糊搜索。
- 让长文件名在固定宽度侧栏中更容易读完整，同时不破坏侧栏布局。
- 保持当前目录浏览、点击打开、目录进入、阻止项禁用等现有行为不变。

## 现状

- browse shell 由 `scripts/lib/standalone-preview-server.js` 的 `buildBrowseShellHtml()` 生成。
- 当前搜索逻辑位于内联脚本中，只做 `entry.name.toLowerCase().indexOf(q) !== -1`。
- 文件名样式是单行 `white-space: nowrap` 加 `text-overflow: ellipsis`，长文件名只能看到开头和省略号。

## 方案

### 1. Fuzzy 搜索

- 在 browse shell 内联脚本中新增纯函数：
  - `fuzzyMatch(needle, haystack)`：按顺序匹配字符，返回是否命中、命中下标、分数。
  - `filterEntries(entries, query)`：空查询返回原列表；非空查询按 fuzzy 分数排序。
- 匹配策略：
  - 查询字符必须按顺序出现在文件名中。
  - 连续匹配加分。
  - 起始位置越靠前加分。
  - 文件名越短略优先。
  - 同分时保持原始列表顺序，减少跳动。
- 搜索范围保持为当前目录的 `allEntries`，不做全仓库递归搜索。

### 2. 匹配高亮

- `renderFileList()` 接收可选的命中下标数据。
- 文件名使用 DOM 节点构造，不用拼接 HTML。
- 命中字符包一层 `.file-name-match`，使用当前 accent 色做轻量高亮。
- 非搜索状态仍直接显示纯文本。

### 3. 长文件名显示

- `.file-name` 从单行省略改为最多两行显示。
- 使用 `overflow-wrap: anywhere` 处理没有分隔符的超长单词。
- 保留 `title` 属性，悬停可看到完整文件名。
- 侧栏宽度、行间距、meta 显示保持稳定，不让文件项撑宽侧栏。

## 非目标

- 不引入第三方搜索库。
- 不做跨目录递归搜索。
- 不改服务端文件列表 API。
- 不重做侧栏整体视觉风格。

## 测试

- 新增一个轻量 Node 测试，直接从 `buildBrowseShellHtml()` 生成的 HTML 中抽取内联脚本执行纯函数。
- 覆盖：
  - 非连续字符 fuzzy 命中。
  - 子串/连续匹配优先级高于松散匹配。
  - 空查询保持原顺序。
  - 匹配下标可用于高亮。
- 保留并运行现有 `node test/browse-service.test.js`，确认服务端 browse 行为未被影响。

## 风险

- 内联脚本没有模块边界，测试需要从 HTML 中抽取脚本；为降低脆弱性，新增纯函数保持无 DOM 依赖。
- fuzzy 排序主观性较强；本次采用保守评分，优先解决“非连续字符搜不到”的核心问题。
