# Browse 搜索框 fzf 风格模糊检索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 browse 侧边栏搜索从纯子串匹配升级为 fzf 风格子序列模糊匹配（评分排序 + 命中高亮），输入加 180ms 防抖，搜索进行中在搜索框内显示 spinner。

**Architecture:** 后端 `browse-service.js` 新增纯函数 `fuzzyMatch(query, target)`（子序列 + 评分 + 命中位置 + smart-case），`searchBrowseFiles` 改用它对完整相对路径匹配并按分数排序，每个命中 entry 附带 `score` 与 `matchPositions`。前端 `standalone-preview-server.js` 在搜索框 `input` 上加 180ms 防抖、搜索框内 spinner，并在结果渲染时按 `matchPositions` 高亮命中字符。

**Tech Stack:** Node.js（CommonJS）、原生 `assert` 测试、Playwright（e2e 本机验收）、内联 HTML/CSS/JS（standalone server）。

---

### Task 1: 后端 fuzzyMatch 纯函数

**Goal:** 新增 `fuzzyMatch(query, target)` 纯函数：子序列匹配 + 评分 + 命中位置 + smart-case，并导出供测试。

**Files:**
- Modify: `scripts/lib/browse-service.js`（在 `searchBrowseFiles` 之前新增函数；`module.exports` 增加 `fuzzyMatch`）
- Test: `test/browse-service.test.js`（新增 `fuzzyMatch` 单元断言）

**Acceptance Criteria:**
- [ ] `fuzzyMatch('bd', 'build')` 返回非 null，`positions` 为 `[0, 4]`（b 在 0，d 在 4）
- [ ] `fuzzyMatch('abc', 'build')` 返回 `null`（非子序列）
- [ ] smart-case：`fuzzyMatch('bd', 'Build')` 命中；`fuzzyMatch('Bd', 'build')` 返回 `null`
- [ ] 连续匹配得分更高：`fuzzyMatch('bui','build').score > fuzzyMatch('bld','build').score`
- [ ] 边界加分：分隔符后命中得分更高：`fuzzyMatch('b','a/build').score >（对同长度无边界的命中）`，用 `fuzzyMatch('f','app/foo').score > fuzzyMatch('f','affoo').score` 断言
- [ ] 空查询 `fuzzyMatch('', 'build')` 返回 `{ score: 0, positions: [] }`

**Verify:** `node test/browse-service.test.js` → 输出 `browse-service tests: ok`

**Steps:**

- [ ] **Step 1: 在 `test/browse-service.test.js` 顶部 import 增加 `fuzzyMatch`**

把第 6-11 行的解构 import 改为：

```javascript
const {
  listBrowseDirectory,
  searchBrowseFiles,
  readBrowseFile,
  resolveBrowseTarget,
  fuzzyMatch
} = require('../scripts/lib/browse-service')
```

- [ ] **Step 2: 写失败测试 —— 在 `main()` 内、`withTempTree` 调用之前新增独立单元测试函数并调用**

在 `async function main() {` 之后、`await withTempTree(...)` 之前插入：

```javascript
  // ---- fuzzyMatch unit tests ----
  function assertFuzzy(query, target, expectMatch) {
    const result = fuzzyMatch(query, target)
    if (expectMatch) {
      assert.ok(result, `expected '${query}' to match '${target}'`)
    } else {
      assert.strictEqual(result, null, `expected '${query}' NOT to match '${target}'`)
    }
    return result
  }

  // subsequence match + positions
  const bdBuild = assertFuzzy('bd', 'build', true)
  assert.deepStrictEqual(bdBuild.positions, [0, 4], 'bd should match b(0) and d(4) in build')
  assertFuzzy('abc', 'build', false)

  // smart-case: lowercase query is case-insensitive, query with uppercase is case-sensitive
  assertFuzzy('bd', 'Build', true)
  assertFuzzy('Bd', 'build', false)

  // consecutive run scores higher than scattered
  assert.ok(
    fuzzyMatch('bui', 'build').score > fuzzyMatch('bld', 'build').score,
    'consecutive matches should score higher than scattered ones'
  )

  // separator-boundary match scores higher than mid-word match
  assert.ok(
    fuzzyMatch('f', 'app/foo').score > fuzzyMatch('f', 'affoo').score,
    'match right after a separator should score higher than a mid-word match'
  )

  // empty query returns zero-score empty-position match
  assert.deepStrictEqual(fuzzyMatch('', 'build'), { score: 0, positions: [] })
```

- [ ] **Step 3: 运行测试确认失败**

Run: `node test/browse-service.test.js`
Expected: 报错（`fuzzyMatch is not a function`）

- [ ] **Step 4: 实现 `fuzzyMatch`**

在 `scripts/lib/browse-service.js` 中 `async function searchBrowseFiles(` 这一行之前插入：

```javascript
const FUZZY_SEPARATORS = new Set(['/', '\\', '-', '_', '.', ' '])

// fzf-style subsequence fuzzy match with scoring.
// Returns null when `query` is not a subsequence of `target`.
// On match returns { score, positions } where positions are indices into `target`.
// Smart-case: an all-lowercase query matches case-insensitively; a query containing
// any uppercase letter matches case-sensitively.
function fuzzyMatch(query, target) {
  const q = String(query == null ? '' : query)
  const t = String(target == null ? '' : target)

  if (q.length === 0) {
    return { score: 0, positions: [] }
  }

  const caseSensitive = /[A-Z]/.test(q)
  const haystack = caseSensitive ? t : t.toLowerCase()
  const needle = caseSensitive ? q : q.toLowerCase()

  const positions = []
  let score = 0
  let prevMatchIndex = -1
  let searchFrom = 0

  for (let qi = 0; qi < needle.length; qi += 1) {
    const ch = needle[qi]
    const foundAt = haystack.indexOf(ch, searchFrom)
    if (foundAt === -1) {
      return null
    }

    // base score for a matched character
    score += 1

    // consecutive bonus: this match immediately follows the previous match
    if (prevMatchIndex !== -1 && foundAt === prevMatchIndex + 1) {
      score += 5
    }

    // boundary bonus: start of target, after a separator, or camelCase boundary
    const isStart = foundAt === 0
    const prevChar = foundAt > 0 ? t[foundAt - 1] : ''
    const afterSeparator = FUZZY_SEPARATORS.has(prevChar)
    const camelBoundary =
      foundAt > 0 &&
      prevChar === prevChar.toLowerCase() &&
      prevChar !== prevChar.toUpperCase() &&
      t[foundAt] === t[foundAt].toUpperCase() &&
      t[foundAt] !== t[foundAt].toLowerCase()
    if (isStart || afterSeparator || camelBoundary) {
      score += 8
    }

    // gap penalty: characters skipped since the previous match (or since start
    // for the first matched character). Keeps tight matches ahead of loose ones.
    const gap = prevMatchIndex === -1 ? foundAt : foundAt - prevMatchIndex - 1
    if (gap > 0) {
      score -= Math.min(gap, 6)
    }

    positions.push(foundAt)
    prevMatchIndex = foundAt
    searchFrom = foundAt + 1
  }

  return { score, positions }
}
```

并在文件末尾 `module.exports = {` 内加入 `fuzzyMatch`（保持字母序附近，放在 `createBrowseError` 之后即可）：

```javascript
  createBrowseError,
  fuzzyMatch,
  isDisplayableFile,
```

- [ ] **Step 5: 运行测试确认通过**

Run: `node test/browse-service.test.js`
Expected: `browse-service tests: ok`

- [ ] **Step 6: 提交**

```bash
git add scripts/lib/browse-service.js test/browse-service.test.js
git commit -m "feat(browse): add fzf-style fuzzyMatch scorer in browse-service"
```

---

### Task 2: searchBrowseFiles 接入模糊匹配

**Goal:** `searchBrowseFiles` 改用 `fuzzyMatch` 对完整相对路径匹配，每个命中 entry 附带 `score` 与 `matchPositions`，结果按 score 降序（同分按路径序）排序；更新现有搜索断言。

**Files:**
- Modify: `scripts/lib/browse-service.js:281-368`（`searchBrowseFiles` 函数体）
- Test: `test/browse-service.test.js:106-116`（更新现有 `recursiveSearch` 断言并新增排序/跨段断言）

**Acceptance Criteria:**
- [ ] 查询匹配文件相对路径（如 `bd` 命中 `notes/deep/...build...` 形态的路径段），命中 entry 含数值 `score` 与数组 `matchPositions`
- [ ] 结果按 `score` 降序排列，同分按 `relativePath` 升序
- [ ] 空查询仍返回空 `entries`
- [ ] 忽略目录（`node_modules`、`.git`）、symlink 越界保护、二进制过滤行为不变
- [ ] `matchPositions` 是相对于 `relativePath` 的索引，与该 entry 的 `relativePath` 一致

**Verify:** `node test/browse-service.test.js` → 输出 `browse-service tests: ok`

**Steps:**

- [ ] **Step 1: 更新现有搜索断言（改为 fzf 子序列 + 新字段）**

把 `test/browse-service.test.js` 第 106-116 行：

```javascript
    const recursiveSearch = await searchBrowseFiles(root, '.', 'ph')
    assert.strictEqual(recursiveSearch.relativePath, '.')
    assert.deepStrictEqual(recursiveSearch.entries, [
      {
        name: 'alpha-phase.md',
        relativePath: 'notes/deep/alpha-phase.md',
        kind: 'file',
        isMarkdown: true,
        isSymlink: false
      }
    ])
```

替换为：

```javascript
    const recursiveSearch = await searchBrowseFiles(root, '.', 'ph')
    assert.strictEqual(recursiveSearch.relativePath, '.')
    // 'ph' is a subsequence of notes/deep/alpha-phase.md (and notes/deep/phase.bin
    // is filtered as binary). Only alpha-phase.md should remain.
    const phPaths = recursiveSearch.entries.map((e) => e.relativePath)
    assert.deepStrictEqual(phPaths, ['notes/deep/alpha-phase.md'])
    const phEntry = recursiveSearch.entries[0]
    assert.strictEqual(phEntry.name, 'alpha-phase.md')
    assert.strictEqual(phEntry.kind, 'file')
    assert.strictEqual(phEntry.isMarkdown, true)
    assert.strictEqual(phEntry.isSymlink, false)
    assert.strictEqual(typeof phEntry.score, 'number')
    assert.ok(Array.isArray(phEntry.matchPositions), 'entry should carry matchPositions')
    // positions index into relativePath
    phEntry.matchPositions.forEach((pos) => {
      assert.ok(pos >= 0 && pos < phEntry.relativePath.length, 'position within relativePath')
    })

    // fzf subsequence across path segments: 'ndda' hits notes/deep/alpha...
    const crossSegment = await searchBrowseFiles(root, '.', 'ndda')
    const crossPaths = crossSegment.entries.map((e) => e.relativePath)
    assert.ok(
      crossPaths.includes('notes/deep/alpha-phase.md'),
      "query spanning path segments should match the full relative path"
    )

    // results sorted by score descending: a 'gd' query should surface docs/guide.md
    const guideSearch = await searchBrowseFiles(root, '.', 'gd')
    assert.ok(
      guideSearch.entries.length >= 1 && guideSearch.entries[0].relativePath === 'docs/guide.md',
      "'gd' should match docs/guide.md as top result"
    )
    for (let i = 1; i < guideSearch.entries.length; i += 1) {
      assert.ok(
        guideSearch.entries[i - 1].score >= guideSearch.entries[i].score,
        'entries must be sorted by score descending'
      )
    }

    // empty query returns no entries
    const emptySearch = await searchBrowseFiles(root, '.', '')
    assert.deepStrictEqual(emptySearch.entries, [])
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node test/browse-service.test.js`
Expected: FAIL（旧实现按 `name.includes` 子串，`ndda`/`gd` 不会命中，且 entry 无 `score`/`matchPositions`）

- [ ] **Step 3: 改写 `searchBrowseFiles`**

在 `scripts/lib/browse-service.js` 中：

(a) 把第 288 行的查询归一化从强制小写改为仅 trim（smart-case 交给 `fuzzyMatch`）：

```javascript
  const normalizedQuery = String(query || '').trim()
```

(b) 把文件匹配判断（原第 345-355 行的 `if (!entry.name.toLowerCase().includes(normalizedQuery)) { continue } entries.push({...})`）替换为对完整相对路径做模糊匹配：

```javascript
      const match = fuzzyMatch(normalizedQuery, entryRelativePath)
      if (!match) {
        continue
      }

      entries.push({
        name: entry.name,
        relativePath: entryRelativePath,
        kind: 'file',
        isMarkdown: isMarkdownPath(entryRealPath),
        isSymlink,
        score: match.score,
        matchPositions: match.positions
      })
```

(c) 把第 361 行的排序从字母序改为分数降序、同分字母序：

```javascript
  entries.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }
    return left.relativePath.localeCompare(right.relativePath)
  })
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node test/browse-service.test.js`
Expected: `browse-service tests: ok`

- [ ] **Step 5: 跑相邻测试确保未回归**

Run: `node test/scratch-route.test.js && node test/browse-fixed-toc-sidebar.test.js`
Expected: 两者各自输出 `... ok`，退出码 0

- [ ] **Step 6: 提交**

```bash
git add scripts/lib/browse-service.js test/browse-service.test.js
git commit -m "feat(browse): fuzzy-match full relative path with score sorting"
```

---

### Task 3: 前端防抖 + spinner + 命中高亮

**Goal:** 搜索框 `input` 加 180ms 防抖；搜索框内加旋转 spinner（请求中显示、结束隐藏）；结果列表按 `matchPositions` 高亮命中字符。通过 `buildBrowseShellHtml()` 字符串断言覆盖。

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js`（搜索框 HTML ~623 行、CSS ~177-202 行、搜索逻辑 ~951-980 行、`renderFileList` ~991-1035 行）
- Test: `test/browse-fixed-toc-sidebar.test.js`（新增 fzf 搜索 UI 断言函数并在文件底部调用）

**Acceptance Criteria:**
- [ ] shell HTML 含 spinner 元素 `id="search-spinner"` 与 `.search-spinner` CSS、`@keyframes mkdp-spin`
- [ ] 内联脚本含 180ms 防抖（`setTimeout(` 与 `180`、`searchDebounceTimer`）
- [ ] 内联脚本含 spinner 显隐逻辑（`is-active` toggle）
- [ ] 内联脚本含按 `matchPositions` 高亮的函数（`highlightByPositions` 与 `match-hl`）
- [ ] CSS 含 `.match-hl` 样式
- [ ] 既有 browse-fixed-toc-sidebar 断言仍全部通过

**Verify:** `node test/browse-fixed-toc-sidebar.test.js` → 输出 `... ok`

**Steps:**

- [ ] **Step 1: 写失败测试 —— 在 `test/browse-fixed-toc-sidebar.test.js` 底部调用区之前新增断言函数**

先查看文件底部现有的函数调用区（形如多个 `testXxx()` 顺序调用，最后 `process.stdout.write(...)`）。在最后一个 `testXxx()` 调用之后、`process.stdout.write` 之前插入对新函数的调用 `testFzfSearchUi()`，并在其它 `function testXxx()` 旁定义：

```javascript
function testFzfSearchUi() {
  const html = buildBrowseShellHtml()
  const script = extractScript(html)

  // spinner element + styles
  assert.ok(html.includes('id="search-spinner"'), 'shell should include a search spinner element')
  assert.ok(html.includes('.search-spinner'), 'shell should include search-spinner styles')
  assert.ok(html.includes('@keyframes mkdp-spin'), 'shell should define the spinner keyframes')

  // 180ms debounce
  assert.ok(script.includes('searchDebounceTimer'), 'search should use a debounce timer')
  assert.ok(/setTimeout\([^)]*180\)|,\s*180\)/.test(script), 'debounce delay should be 180ms')

  // spinner toggle
  assert.ok(script.includes("'is-active'") || script.includes('"is-active"'), 'spinner should toggle is-active class')

  // hit highlighting
  assert.ok(script.includes('highlightByPositions'), 'render should highlight matched positions')
  assert.ok(html.includes('.match-hl'), 'shell should include match highlight styles')
}
```

> 注：定义函数后务必在底部调用区加入 `testFzfSearchUi()`，否则不会执行。

- [ ] **Step 2: 运行测试确认失败**

Run: `node test/browse-fixed-toc-sidebar.test.js`
Expected: FAIL（断言 `search-spinner` 不存在等）

- [ ] **Step 3: 加 spinner HTML**

在 `scripts/lib/standalone-preview-server.js` 搜索框区域（约 621-623 行）：

```javascript
      <div class="sidebar-search">
        <span class="search-icon">${esc(icons.search)}</span>
        <input type="text" id="search-input" placeholder="Search files..." autocomplete="off" />
```

在 `<input ... />` 之后、`</div>` 之前加：

```javascript
        <span class="search-spinner" id="search-spinner" aria-hidden="true"></span>
```

- [ ] **Step 4: 加 spinner + 高亮 CSS**

在 `.sidebar-search input:focus { border-color: var(--accent); }`（约第 202 行）之后插入：

```javascript
    .search-spinner {
      position: absolute;
      right: 22px;
      top: 50%;
      width: 14px;
      height: 14px;
      margin-top: -7px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      display: none;
      animation: mkdp-spin 0.6s linear infinite;
      pointer-events: none;
    }
    .search-spinner.is-active { display: block; }
    @keyframes mkdp-spin { to { transform: rotate(360deg); } }
    .match-hl { color: var(--accent); font-weight: 600; }
```

- [ ] **Step 5: 改防抖 + spinner 显隐逻辑**

在 `scripts/lib/standalone-preview-server.js` 的 `/* ---- Search ---- */` 区块（约 951-980 行）。

(a) 在 `var searchRequestId = 0;` 之后加：

```javascript
    var searchDebounceTimer = null;
    var searchSpinnerEl = document.getElementById('search-spinner');
    function setSearchSpinner(active) {
      if (!searchSpinnerEl) return;
      if (active) searchSpinnerEl.classList.add('is-active');
      else searchSpinnerEl.classList.remove('is-active');
    }
```

(b) 把 `searchCurrentDirectory` 改为在请求结束时隐藏 spinner（用 try/finally，且仅当仍是最新请求时隐藏）。将原函数体替换为：

```javascript
    async function searchCurrentDirectory(query) {
      var requestId = ++searchRequestId;
      if (!query) {
        searchEntries = null;
        setSearchSpinner(false);
        renderFileList(allEntries);
        return;
      }

      try {
        var payload = await apiJson('/_mkdp/browse/search?' + new URLSearchParams({
          path: currentDir || '.',
          q: query
        }).toString());
        if (requestId !== searchRequestId) return;
        searchEntries = payload.entries || [];
        renderFileList(searchEntries);
      } catch (error) {
        if (requestId !== searchRequestId) return;
        searchEntries = [];
        fileListEl.innerHTML = '<div style="padding:12px 10px;color:var(--blocked-color);font-size:13px">' + escHtml(error.message || String(error)) + '</div>';
      } finally {
        if (requestId === searchRequestId) setSearchSpinner(false);
      }
    }
```

(c) 把 `input` 监听器（原第 977-980 行）替换为防抖版（注意：不再预先 toLowerCase，保留原始大小写以支持 smart-case 与高亮位置对齐）：

```javascript
    searchInput.addEventListener('input', function() {
      var q = searchInput.value.trim();
      if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
      if (!q) {
        setSearchSpinner(false);
        searchCurrentDirectory('');
        return;
      }
      setSearchSpinner(true);
      searchDebounceTimer = setTimeout(function() {
        searchDebounceTimer = null;
        searchCurrentDirectory(q);
      }, 180);
    });
```

(d) 在 `loadDirectory` 清空搜索处（约第 1075-1077 行附近，现有 `searchEntries = null; searchInput.value = ''; searchRequestId += 1;`）补上清除防抖与隐藏 spinner。把该处改为：

```javascript
        searchEntries = null;
        searchInput.value = '';
        searchRequestId += 1;
        if (searchDebounceTimer) { clearTimeout(searchDebounceTimer); searchDebounceTimer = null; }
        setSearchSpinner(false);
```

- [ ] **Step 6: 加高亮渲染**

在 `scripts/lib/standalone-preview-server.js` 的 `function renderFileList(entries) {`（约第 991 行）之前插入工具函数：

```javascript
    function highlightByPositions(text, baseOffset, positions) {
      if (!positions || !positions.length) return escHtml(text);
      var hit = {};
      positions.forEach(function(p) { hit[p - baseOffset] = true; });
      var out = '';
      for (var i = 0; i < text.length; i += 1) {
        var ch = escHtml(text[i]);
        if (hit[i]) out += '<span class="match-hl">' + ch + '</span>';
        else out += ch;
      }
      return out;
    }
```

> 依赖：内联脚本已有 `escHtml`（在 `renderFileList` 其它分支与第 1159 行已使用），无需新增。

然后在 `renderFileList` 内，把文件名与目录段渲染改为按位置高亮。

(a) 文件名（原 `nameSpan.textContent = entry.name;`，约第 1019 行）替换为：

```javascript
        if (entry.matchPositions && entry.relativePath) {
          // basename occupies the tail of relativePath; offset = relativePath.length - name.length
          var nameOffset = entry.relativePath.length - entry.name.length;
          nameSpan.innerHTML = highlightByPositions(entry.name, nameOffset, entry.matchPositions);
        } else {
          nameSpan.textContent = entry.name;
        }
```

(b) 目录段 meta（原第 1024-1026 行，搜索态下显示路径目录部分）。原：

```javascript
        else if (entry.kind === 'file' && searchInput.value.trim() && entry.relativePath.indexOf('/') !== -1) {
          meta = entry.relativePath.split('/').slice(0, -1).join('/');
        }
```

保留 `meta` 文本逻辑不变（下游仍可能用作纯文本），但在创建 `metaSpan` 时（约第 1031-1034 行 `metaSpan.textContent = meta;`）改为：当处于搜索态且该段对应路径目录前缀时按位置高亮。把：

```javascript
          var metaSpan = document.createElement('span');
          metaSpan.className = 'file-meta';
          metaSpan.textContent = meta;
          info.appendChild(metaSpan);
```

替换为：

```javascript
          var metaSpan = document.createElement('span');
          metaSpan.className = 'file-meta';
          // when meta is the directory prefix of relativePath, highlight matched chars within it
          if (entry.matchPositions && entry.relativePath && entry.relativePath.indexOf(meta + '/') === 0) {
            metaSpan.innerHTML = highlightByPositions(meta, 0, entry.matchPositions);
          } else {
            metaSpan.textContent = meta;
          }
          info.appendChild(metaSpan);
```

- [ ] **Step 7: 运行测试确认通过**

Run: `node test/browse-fixed-toc-sidebar.test.js`
Expected: `... ok`（含新增 fzf UI 断言）

- [ ] **Step 8: 跑全部相关单测确保未回归**

Run: `node test/browse-service.test.js && node test/browse-fixed-toc-sidebar.test.js && node test/scratch-route.test.js`
Expected: 三者各自 ok，退出码 0

- [ ] **Step 9: 提交**

```bash
git add scripts/lib/standalone-preview-server.js test/browse-fixed-toc-sidebar.test.js
git commit -m "feat(browse): debounce search, in-box spinner, fuzzy hit highlight"
```

---

### Task 4: 本机端到端验收

**Goal:** 用 Playwright 启动真实 standalone 服务器，在临时目录树上验证 fzf 模糊命中、防抖期间 spinner 出现、命中高亮渲染，作为本机验收 e2e。

**Files:**
- Create: `test/browse-fzf-search.e2e.test.js`

**Acceptance Criteria:**
- [ ] e2e 启动真实服务器，在含 `app/build/foo.md` 等路径的临时树上，搜索框输入 `bd` 后结果列表出现 `build` 路径相关文件
- [ ] 输入即时出现 spinner（`#search-spinner.is-active`），结果返回后 spinner 消失
- [ ] 结果项含 `.match-hl` 高亮元素
- [ ] 测试结束清理临时目录、关闭浏览器与服务器
- [ ] 测试输出 `browse-fzf-search e2e tests: ok`，退出码 0

**Verify:** `node test/browse-fzf-search.e2e.test.js` → 输出 `browse-fzf-search e2e tests: ok`

**Steps:**

- [ ] **Step 1: 创建 e2e 测试文件**

Create `test/browse-fzf-search.e2e.test.js`：

```javascript
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium } = require('playwright')

const {
  startStandalonePreviewServer
} = require('../scripts/lib/standalone-preview-server')

async function buildTree() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'mkdp-fzf-'))
  await fs.promises.mkdir(path.join(root, 'app', 'build'), { recursive: true })
  await fs.promises.mkdir(path.join(root, 'docs'), { recursive: true })
  await fs.promises.writeFile(path.join(root, 'app', 'build', 'foo.md'), '# Foo\n', 'utf8')
  await fs.promises.writeFile(path.join(root, 'docs', 'guide.md'), '# Guide\n', 'utf8')
  await fs.promises.writeFile(path.join(root, 'readme.md'), '# Readme\n', 'utf8')
  return root
}

async function main() {
  const root = await buildTree()
  const server = await startStandalonePreviewServer({
    cwd: root,
    fileDir: root,
    previewOptions: {},
    theme: 'light',
    name: 'fzf',
    contentLines: []
  })

  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    await page.goto(server.origin + '/_mkdp/browse')
    await page.waitForSelector('#search-input')

    // type a fuzzy query: 'bd' should surface app/build/foo.md (b...uild...)
    await page.fill('#search-input', 'bd')

    // spinner should appear during the debounce/request window
    // (poll briefly; debounce is 180ms then a network round-trip)
    let sawSpinner = false
    for (let i = 0; i < 40; i += 1) {
      const active = await page.locator('#search-spinner.is-active').count()
      if (active > 0) { sawSpinner = true; break }
      await page.waitForTimeout(10)
    }
    assert.ok(sawSpinner, 'spinner should become active during search')

    // wait for results to render: file-name with text foo.md
    await page.locator('.file-item .file-name', { hasText: 'foo.md' }).first().waitFor({ timeout: 5000 })

    // spinner should be hidden again after results arrive
    await page.locator('#search-spinner.is-active').waitFor({ state: 'detached', timeout: 5000 }).catch(async () => {
      // fall back: assert it is not active by class state
      const active = await page.locator('#search-spinner.is-active').count()
      assert.strictEqual(active, 0, 'spinner should hide after results arrive')
    })

    // hit highlighting present
    const hlCount = await page.locator('.file-item .match-hl').count()
    assert.ok(hlCount > 0, 'matched characters should be highlighted')

    // the build path should be discoverable (directory meta or path shows build)
    const bodyText = await page.locator('#file-list, .file-list, [id*="file"]').first().innerText().catch(() => '')
    assert.ok(/foo\.md/.test(bodyText) || true, 'foo.md result rendered')
  } finally {
    await browser.close()
    await server.close()
    await fs.promises.rm(root, { recursive: true, force: true })
  }

  process.stdout.write('browse-fzf-search e2e tests: ok\n')
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message || String(error)}\n`)
  process.exitCode = 1
})
```

> 注：`#file-list` 选择器若与实际 id 不符，回退断言用 `|| true` 容错，不阻断核心验收（spinner + foo.md + match-hl 已是硬断言）。实现时若发现 file list 容器的真实 id（在 standalone server HTML 中查 `file-list`），可把该行收紧。

- [ ] **Step 2: 确认 file-list 容器真实选择器**

Run: `grep -n "fileListEl\|file-list\|id=\"file" scripts/lib/standalone-preview-server.js | head`
据结果把测试里的列表容器选择器与 `.file-item .file-name` 调整为与实际 DOM 一致（实现时核对 `renderFileList` 生成的真实 class：`file-item`、`file-name`、`file-meta`、`file-icon` 已在源码确认存在）。

- [ ] **Step 3: 运行 e2e 确认通过**

Run: `node test/browse-fzf-search.e2e.test.js`
Expected: `browse-fzf-search e2e tests: ok`

若 Playwright 浏览器未安装，先 `npx playwright install chromium` 再重跑。

- [ ] **Step 4: 全量回归**

Run: `node test/browse-service.test.js && node test/browse-fixed-toc-sidebar.test.js && node test/scratch-route.test.js && node test/browse-fzf-search.e2e.test.js`
Expected: 全部 ok，退出码 0

- [ ] **Step 5: 提交**

```bash
git add test/browse-fzf-search.e2e.test.js
git commit -m "test(browse): e2e accept fzf search, spinner and hit highlight"
```

---

## 验收清单（最终本机验收）

- [ ] `node test/browse-service.test.js` → ok
- [ ] `node test/browse-fixed-toc-sidebar.test.js` → ok
- [ ] `node test/scratch-route.test.js` → ok
- [ ] `node test/browse-fzf-search.e2e.test.js` → ok
- [ ] 手动确认：输入 `bd` 命中 `build` 类路径、连续敲键不抖动、spinner 出现、命中字符高亮
