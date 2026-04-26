# Browse UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reimplement the browse mode web interface as a Notion/Yuque-style markdown file browser with collapsible sidebar, inline SVG icons, floating TOC, and responsive layout.

**Architecture:** The browse shell HTML is generated server-side by `buildBrowseShellHtml()` in `standalone-preview-server.js`. Markdown rendering stays in the iframe (`/page/1?browsePath=...`). The iframe sends TOC heading data to the parent via `postMessage`, and the parent shell renders a floating TOC. File listing is filtered server-side in `browse-service.js` to exclude binary files.

**Tech Stack:** Vanilla HTML/CSS/JS (browse shell), React (iframe preview page), Node.js (server), Socket.IO, inline SVG icons.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `scripts/lib/browse-service.js` | Modify | Add `isDisplayableFile()` helper and filter binary files from `listBrowseDirectory()` |
| `test/browse-service.test.js` | Modify | Add tests for binary file filtering |
| `scripts/lib/standalone-preview-server.js` | Modify | Completely rewrite `buildBrowseShellHtml()` with new UI |
| `app/pages/index.jsx` | Modify | Add `postMessage` bridge for TOC data + hide built-in TOC in browse mode |
| `app/_static/page.css` | Modify | Add browse-mode class to hide TOC panel when inside iframe |

---

### Task 1: Filter binary files from directory listing

**Files:**
- Modify: `scripts/lib/browse-service.js:4-11,139-141,180-256`
- Modify: `test/browse-service.test.js`

- [ ] **Step 1: Write failing test for binary file exclusion**

Add a test case to `test/browse-service.test.js` that verifies binary files are excluded from directory listings. Insert this after the existing `binaryFallback` assertion (after line 85):

```js
    // Binary files should be excluded from directory listing
    const notesListingFiltered = await listBrowseDirectory(root, 'notes')
    const binaryEntry = notesListingFiltered.entries.find((entry) => entry.name === 'binary.bin')
    assert.strictEqual(binaryEntry, undefined, 'binary.bin should be filtered from directory listing')

    // Text files should still appear
    const textEntry = notesListingFiltered.entries.find((entry) => entry.name === 'plain.txt')
    assert.ok(textEntry, 'plain.txt should still appear in directory listing')
    assert.strictEqual(textEntry.kind, 'file')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node test/browse-service.test.js`
Expected: FAIL — `binary.bin` is still present in the listing.

- [ ] **Step 3: Add `isDisplayableFile()` and integrate into `listBrowseDirectory()`**

In `scripts/lib/browse-service.js`, add a new helper function after `isMarkdownPath()` (after line 141):

```js
function isDisplayableFile(filePath) {
  if (isMarkdownPath(filePath)) {
    return true
  }
  const extension = path.extname(filePath).toLowerCase()
  return TEXT_FALLBACK_EXTENSIONS.has(extension)
}
```

Then in `listBrowseDirectory()`, add a filter after the directory check for regular files. Replace the block at lines 227-234:

```js
    const kind = entryStat.isDirectory() ? 'directory' : 'file'

    if (kind === 'file' && !isDisplayableFile(entryRealPath)) {
      continue
    }

    visibleEntries.push({
      name: entry.name,
      relativePath: entryRelativePath,
      kind,
      isMarkdown: kind === 'file' && isMarkdownPath(entryRealPath),
      isSymlink
    })
```

Also export `isDisplayableFile` in the `module.exports` block at the bottom of the file:

```js
module.exports = {
  DEFAULT_IGNORED_DIR_BASENAMES,
  DEFAULT_IGNORED_RELATIVE_DIRS,
  createBrowseError,
  isDisplayableFile,
  isIgnoredBrowseDirectory,
  isMarkdownPath,
  listBrowseDirectory,
  normalizeRelativeRequestPath,
  readBrowseFile,
  resolveBrowseTarget
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node test/browse-service.test.js`
Expected: `browse-service tests: ok`

- [ ] **Step 5: Handle extensionless text files**

The current `isDisplayableFile()` only checks by extension. Extensionless files that are actually text (like `Makefile`, `Dockerfile`, `LICENSE`) would be hidden. Add a well-known basename set for common extensionless text files. Insert right before `isDisplayableFile`:

```js
const DISPLAYABLE_BASENAMES = new Set([
  'Makefile',
  'Dockerfile',
  'LICENSE',
  'LICENCE',
  'Rakefile',
  'Gemfile',
  'Vagrantfile',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
  '.eslintrc',
  '.prettierrc',
  '.npmrc',
  '.env.example'
])
```

Update `isDisplayableFile`:

```js
function isDisplayableFile(filePath) {
  if (isMarkdownPath(filePath)) {
    return true
  }
  const extension = path.extname(filePath).toLowerCase()
  if (TEXT_FALLBACK_EXTENSIONS.has(extension)) {
    return true
  }
  return DISPLAYABLE_BASENAMES.has(path.basename(filePath))
}
```

- [ ] **Step 6: Add test for extensionless displayable files**

Add to the test, before the symlink section. First create the fixture (add after line 23 in the `withTempTree` setup):

```js
    await fs.promises.writeFile(path.join(tempRoot, 'notes', 'Makefile'), 'all:\n\techo hello\n', 'utf8')
```

Then add the assertion (after the binary exclusion test):

```js
    const makefileEntry = notesListingFiltered.entries.find((entry) => entry.name === 'Makefile')
    assert.ok(makefileEntry, 'Makefile should appear in directory listing')
```

- [ ] **Step 7: Run tests**

Run: `node test/browse-service.test.js`
Expected: `browse-service tests: ok`

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/browse-service.js test/browse-service.test.js
git commit -m "feat(browse): filter binary files from directory listing

Only show directories, markdown files, and displayable text files
in the browse sidebar. Binary files that cannot be previewed are
excluded from the listing."
```

---

### Task 2: Add postMessage TOC bridge in iframe preview

**Files:**
- Modify: `app/pages/index.jsx:326-382,432-463,572-578,884-931`
- Modify: `app/_static/page.css:372-414,533-650`

- [ ] **Step 1: Add postMessage dispatch after TOC update in `index.jsx`**

In `app/pages/index.jsx`, find the `updateTocItems()` method. After the `this.setState(...)` callback that calls `this.setupHeadingObserver()` (line 380), add postMessage dispatch. Replace the setState callback:

```js
    this.tocCache = nextCache
    this.setState((state) => {
      const tocTree = buildTocTree(tocItems)
      const expandedTocMap = this.getExpandedTocMap(tocItems, state.expandedTocMap)
      const activeTocId = tocItems.some((item) => item.id === state.activeTocId)
        ? state.activeTocId
        : (tocItems[0] && tocItems[0].id) || ''

      return {
        tocItems,
        tocTree,
        expandedTocMap,
        activeTocId,
        isTocDrawerOpen: tocItems.length > 0 ? state.isTocDrawerOpen : false
      }
    }, () => {
      this.setupHeadingObserver()
      this.postTocToParent()
    })
```

- [ ] **Step 2: Add `postTocToParent()` method**

Add this new method right after `updateTocItems()` (after line 382):

```js
  postTocToParent() {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) {
      return
    }
    try {
      window.parent.postMessage({
        type: 'mkdp:toc',
        headings: this.state.tocItems.map((item) => ({
          id: item.id,
          text: item.text,
          level: item.level
        }))
      }, '*')
    } catch (_) {}
  }
```

- [ ] **Step 3: Add active heading postMessage in `updateActiveHeadingByScroll()`**

Find `updateActiveHeadingByScroll()` in `index.jsx`. At the end of the method where `setState` is called for `activeTocId`, add a postMessage. Find the setState call inside `updateActiveHeadingByScroll` and add to its callback:

After the existing `this.setState({ activeTocId: closestId })`, change it to:

```js
    if (closestId !== this.state.activeTocId) {
      this.setState({ activeTocId: closestId }, () => {
        if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
          try {
            window.parent.postMessage({
              type: 'mkdp:active-heading',
              id: closestId
            }, '*')
          } catch (_) {}
        }
      })
    }
```

- [ ] **Step 4: Hide built-in TOC panel when in browse mode iframe**

In `componentDidMount()`, detect browse mode and set a flag. Add after the `this.startSocket(...)` line (after line 575):

```js
    if (this.getBrowsePath()) {
      document.documentElement.classList.add('mkdp-browse-mode')
    }
```

Then in `app/_static/page.css`, add at the end of the file:

```css
/* Hide built-in TOC when rendered inside browse shell iframe */
.mkdp-browse-mode #toc-panel,
.mkdp-browse-mode #toc-mobile-open-btn,
.mkdp-browse-mode #toc-drawer-backdrop {
  display: none !important;
}

.mkdp-browse-mode #page-shell.has-toc #content-col {
  margin-left: 0;
}
```

- [ ] **Step 5: Commit**

```bash
git add app/pages/index.jsx app/_static/page.css
git commit -m "feat(browse): add postMessage TOC bridge for browse shell

When running inside the browse mode iframe, send heading data
and active heading changes to the parent frame via postMessage.
Hide the built-in TOC panel in browse mode since the parent
shell will render its own floating TOC."
```

---

### Task 3: Rewrite browse shell HTML — CSS foundation and layout

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js:54-478`

This is the largest task. We split the `buildBrowseShellHtml()` rewrite into three steps: CSS, sidebar HTML+JS, and content area HTML+JS.

- [ ] **Step 1: Replace CSS in `buildBrowseShellHtml()`**

Replace the entire `buildBrowseShellHtml()` function starting at line 54. Start with the document skeleton and all CSS. The function will be built incrementally across Tasks 3-5.

Replace lines 54-478 with:

```js
function buildBrowseShellHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Markdown Browse</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #ffffff;
      --surface: #f8f9fa;
      --border: #e5e7eb;
      --text: #1f2937;
      --muted: #6b7280;
      --accent: #3b82f6;
      --accent-soft: rgba(59, 130, 246, 0.08);
      --folder-color: #e8a948;
      --blocked-color: #ef4444;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #111827;
        --surface: #1f2937;
        --border: #374151;
        --text: #f3f4f6;
        --muted: #9ca3af;
        --accent: #60a5fa;
        --accent-soft: rgba(96, 165, 250, 0.1);
        --folder-color: #fbbf24;
        --blocked-color: #f87171;
      }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      height: 100vh;
      overflow: hidden;
      color: var(--text);
      background: var(--bg);
      font-size: 14px;
      line-height: 1.5;
    }

    .shell {
      display: flex;
      height: 100vh;
    }

    /* --- Sidebar --- */
    .sidebar {
      width: 280px;
      min-width: 280px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      transition: width 200ms ease, min-width 200ms ease;
      overflow: hidden;
    }

    .sidebar.is-collapsed {
      width: 48px;
      min-width: 48px;
    }

    .sidebar-top {
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid var(--border);
    }

    .sidebar-top-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      white-space: nowrap;
    }

    .sidebar.is-collapsed .sidebar-top {
      padding: 12px 8px;
      justify-content: center;
    }

    .sidebar.is-collapsed .sidebar-top-title,
    .sidebar.is-collapsed .sidebar-search,
    .sidebar.is-collapsed .sidebar-breadcrumb,
    .sidebar.is-collapsed .sidebar-divider {
      display: none;
    }

    .collapse-btn {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .collapse-btn:hover {
      color: var(--text);
      border-color: var(--accent);
    }

    .sidebar-search {
      padding: 10px 12px 8px;
    }

    .search-input {
      width: 100%;
      padding: 7px 10px 7px 32px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--bg);
      color: var(--text);
      font-size: 13px;
      outline: none;
    }

    .search-input:focus {
      border-color: var(--accent);
    }

    .search-wrap {
      position: relative;
    }

    .search-icon {
      position: absolute;
      left: 10px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--muted);
      pointer-events: none;
    }

    .sidebar-breadcrumb {
      padding: 4px 14px 8px;
      font-size: 12px;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;
      overflow: hidden;
    }

    .breadcrumb-link {
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .breadcrumb-link:hover {
      color: var(--text);
    }

    .breadcrumb-current {
      font-weight: 500;
      color: var(--text);
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sidebar-divider {
      height: 1px;
      background: var(--border);
      margin: 0 12px 4px;
    }

    .file-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 6px 12px;
    }

    .sidebar.is-collapsed .file-list {
      padding: 4px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
    }

    .file-item {
      width: 100%;
      padding: 8px 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .file-item:hover {
      background: var(--accent-soft);
    }

    .file-item.is-active {
      background: var(--accent-soft);
    }

    .file-item.is-active .file-name {
      color: var(--accent);
      font-weight: 500;
    }

    .file-item[disabled] {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .sidebar.is-collapsed .file-item {
      width: 32px;
      height: 32px;
      padding: 0;
      justify-content: center;
      border-radius: 6px;
    }

    .file-icon {
      flex-shrink: 0;
      width: 20px;
      height: 20px;
    }

    .file-info {
      flex: 1;
      min-width: 0;
    }

    .sidebar.is-collapsed .file-info {
      display: none;
    }

    .file-name {
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .file-meta {
      font-size: 11px;
      color: var(--muted);
    }

    .file-chevron {
      flex-shrink: 0;
      opacity: 0.3;
    }

    .sidebar.is-collapsed .file-chevron {
      display: none;
    }

    .empty-dir {
      padding: 20px 14px;
      font-size: 13px;
      color: var(--muted);
      text-align: center;
    }

    /* --- Content Area --- */
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .content-topbar {
      padding: 10px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-shrink: 0;
    }

    .content-topbar-left {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      min-width: 0;
    }

    .topbar-path {
      color: var(--muted);
    }

    .topbar-filename {
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .topbar-size {
      font-size: 11px;
      color: var(--muted);
      margin-left: 4px;
    }

    .content-topbar-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .topbar-btn {
      padding: 5px 10px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--muted);
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .topbar-btn:hover {
      color: var(--text);
      border-color: var(--accent);
    }

    .topbar-btn.is-active {
      background: var(--accent-soft);
      color: var(--accent);
      border-color: var(--accent);
    }

    .content-body {
      flex: 1;
      min-height: 0;
      position: relative;
      display: flex;
    }

    .preview-frame {
      flex: 1;
      border: 0;
      background: transparent;
    }

    .fallback-view {
      flex: 1;
      display: none;
      padding: 24px 32px;
      overflow: auto;
    }

    .fallback-view.is-visible {
      display: block;
    }

    .fallback-text {
      max-width: 720px;
      margin: 0 auto;
      white-space: pre-wrap;
      word-break: break-word;
      font: 13px/1.6 'SF Mono', Monaco, Consolas, monospace;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 20px;
    }

    /* --- Floating TOC --- */
    .toc-float {
      position: absolute;
      top: 0;
      right: 0;
      width: 200px;
      padding: 24px 16px;
      overflow-y: auto;
      max-height: 100%;
      font-size: 12px;
    }

    .toc-float-title {
      font-weight: 600;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 11px;
      margin-bottom: 12px;
    }

    .toc-float-item {
      display: block;
      padding: 4px 0 4px 14px;
      border-left: 2px solid transparent;
      color: var(--muted);
      text-decoration: none;
      cursor: pointer;
      transition: color 150ms, border-color 150ms;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .toc-float-item:hover {
      color: var(--text);
    }

    .toc-float-item.is-active {
      border-left-color: var(--accent);
      color: var(--accent);
      font-weight: 500;
    }

    .toc-float-item.toc-level-3 {
      padding-left: 28px;
      font-size: 11px;
    }

    /* --- TOC Drawer (narrow screens) --- */
    .toc-drawer-backdrop {
      display: none;
    }

    .toc-drawer {
      display: none;
    }

    /* --- Welcome screen --- */
    .welcome {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      gap: 12px;
      padding: 40px;
    }

    .welcome-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
    }

    .welcome-subtitle {
      font-size: 14px;
    }

    /* --- Responsive --- */
    @media (max-width: 1100px) {
      .toc-float {
        display: none;
      }

      .toc-drawer-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.3);
        opacity: 0;
        pointer-events: none;
        transition: opacity 200ms;
        z-index: 100;
      }

      .toc-drawer-backdrop.is-open {
        opacity: 1;
        pointer-events: auto;
      }

      .toc-drawer {
        display: flex;
        flex-direction: column;
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 240px;
        background: var(--surface);
        border-left: 1px solid var(--border);
        transform: translateX(100%);
        transition: transform 200ms ease;
        z-index: 101;
        padding: 16px;
        overflow-y: auto;
      }

      .toc-drawer.is-open {
        transform: translateX(0);
      }

      .toc-drawer-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }

      .toc-drawer-title {
        font-weight: 600;
        font-size: 13px;
        color: var(--muted);
        text-transform: uppercase;
      }

      .toc-drawer-close {
        border: none;
        background: none;
        color: var(--muted);
        cursor: pointer;
        font-size: 18px;
      }
    }

    @media (max-width: 960px) {
      .sidebar:not(.is-collapsed) {
        width: 48px;
        min-width: 48px;
      }

      .sidebar:not(.is-collapsed) .sidebar-top-title,
      .sidebar:not(.is-collapsed) .sidebar-search,
      .sidebar:not(.is-collapsed) .sidebar-breadcrumb,
      .sidebar:not(.is-collapsed) .sidebar-divider,
      .sidebar:not(.is-collapsed) .file-info,
      .sidebar:not(.is-collapsed) .file-chevron {
        display: none;
      }

      .sidebar:not(.is-collapsed) .sidebar-top {
        padding: 12px 8px;
        justify-content: center;
      }

      .sidebar:not(.is-collapsed) .file-list {
        padding: 4px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
      }

      .sidebar:not(.is-collapsed) .file-item {
        width: 32px;
        height: 32px;
        padding: 0;
        justify-content: center;
        border-radius: 6px;
      }
    }
  </style>
</head>
<body>
PLACEHOLDER_BODY
</body>
</html>`;
}
```

Note: `PLACEHOLDER_BODY` will be replaced in Task 4. This step establishes the CSS foundation.

- [ ] **Step 2: Commit CSS foundation**

```bash
git add scripts/lib/standalone-preview-server.js
git commit -m "refactor(browse): replace browse shell CSS with new design system

New CSS variables, Notion/Yuque-style layout, collapsible sidebar,
floating TOC, responsive breakpoints. Body HTML is placeholder,
will be filled in the next commits."
```

---

### Task 4: Rewrite browse shell HTML — sidebar and SVG icons

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js:54` (continue building `buildBrowseShellHtml`)

- [ ] **Step 1: Add SVG icon helper function**

Insert a new function before `buildBrowseShellHtml()` (before line 54):

```js
function svgIcons() {
  return {
    folder: '<svg class="file-icon" viewBox="0 0 20 20" fill="none"><path d="M3 5h5l2 2h7v9H3V5z" fill="var(--folder-color)" opacity="0.2"/><path d="M3 5h5l2 2h7v9H3V5z" stroke="var(--folder-color)" stroke-width="1.2"/></svg>',
    markdown: '<svg class="file-icon" viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="10" height="14" rx="2" fill="var(--accent)" opacity="0.12"/><rect x="3" y="2" width="10" height="14" rx="2" stroke="var(--accent)" stroke-width="1.1"/><path d="M6.5 7L8 9l3-4" stroke="var(--accent)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" opacity="0.6"/><path d="M7 12h4" stroke="var(--accent)" stroke-width="0.9" stroke-linecap="round" opacity="0.5"/></svg>',
    textFile: '<svg class="file-icon" viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="10" height="14" rx="2" stroke="currentColor" stroke-width="1.1" opacity="0.3"/></svg>',
    blocked: '<svg class="file-icon" viewBox="0 0 20 20" fill="none"><rect x="3" y="2" width="10" height="14" rx="2" stroke="currentColor" stroke-width="1.1" opacity="0.3"/><circle cx="14" cy="14" r="4.5" fill="var(--bg)" stroke="var(--blocked-color)" stroke-width="1.2"/><path d="M12 14h4" stroke="var(--blocked-color)" stroke-width="1.2" stroke-linecap="round"/></svg>',
    search: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    chevronLeft: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M10 4L6 8l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronRight: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    chevronSep: '<svg width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    sun: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="4" stroke="currentColor" stroke-width="1.2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    download: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M5 7l3 3 3-3" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v2h12v-2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    toc: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M3 8h7M3 12h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
    fileEntry: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/></svg>'
  };
}
```

- [ ] **Step 2: Replace `PLACEHOLDER_BODY` with sidebar HTML and content area structure**

In `buildBrowseShellHtml()`, replace `PLACEHOLDER_BODY` with the full body HTML:

```js
function buildBrowseShellHtml() {
  const icons = svgIcons();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <!-- ... (all the CSS from Task 3, unchanged) ... -->
</head>
<body>
  <div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-top">
        <span class="sidebar-top-title">Files</span>
        <button class="collapse-btn" id="collapse-btn" title="Toggle sidebar">${icons.chevronLeft}</button>
      </div>
      <div class="sidebar-search">
        <div class="search-wrap">
          <span class="search-icon">${icons.search}</span>
          <input class="search-input" id="search-input" type="text" placeholder="Search files..." />
        </div>
      </div>
      <div class="sidebar-breadcrumb" id="breadcrumb"></div>
      <div class="sidebar-divider"></div>
      <div class="file-list" id="file-list"></div>
    </aside>
    <section class="content" id="content">
      <div class="content-topbar" id="content-topbar" style="display:none;">
        <div class="content-topbar-left" id="topbar-left"></div>
        <div class="content-topbar-right">
          <button class="topbar-btn" id="toc-toggle-btn" style="display:none;" title="Table of contents">${icons.toc} TOC</button>
          <button class="topbar-btn" id="theme-btn" title="Toggle theme">${icons.sun} Theme</button>
          <a class="topbar-btn" id="raw-btn" style="display:none;" title="Download raw file">${icons.download} Raw</a>
        </div>
      </div>
      <div class="content-body" id="content-body">
        <div class="welcome" id="welcome">
          <div class="welcome-title">Markdown File Browser</div>
          <div class="welcome-subtitle">Select a markdown file from the sidebar to preview it.</div>
        </div>
        <iframe id="preview-frame" class="preview-frame" title="Markdown preview" style="display:none;"></iframe>
        <div id="fallback-view" class="fallback-view"></div>
        <div class="toc-float" id="toc-float" style="display:none;">
          <div class="toc-float-title">On this page</div>
          <div id="toc-float-list"></div>
        </div>
      </div>
      <div class="toc-drawer-backdrop" id="toc-drawer-backdrop"></div>
      <div class="toc-drawer" id="toc-drawer">
        <div class="toc-drawer-header">
          <span class="toc-drawer-title">On this page</span>
          <button class="toc-drawer-close" id="toc-drawer-close">&times;</button>
        </div>
        <div id="toc-drawer-list"></div>
      </div>
    </section>
  </div>
  <script>
    /* ===== ICONS (used by JS rendering) ===== */
    const ICONS = {
      folder: \`${icons.folder.replace(/`/g, '\\`')}\`,
      markdown: \`${icons.markdown.replace(/`/g, '\\`')}\`,
      textFile: \`${icons.textFile.replace(/`/g, '\\`')}\`,
      blocked: \`${icons.blocked.replace(/`/g, '\\`')}\`,
      chevronRight: \`${icons.fileEntry.replace(/`/g, '\\`')}\`
    };

    /* ===== STATE ===== */
    let currentDir = '.';
    let selectedPath = '';
    let allEntries = [];
    let tocHeadings = [];
    let activeTocId = '';
    let sidebarCollapsed = localStorage.getItem('mkdp-sidebar-collapsed') === 'true';
    let currentTheme = localStorage.getItem('mkdp-theme') || '';

    /* ===== ELEMENTS ===== */
    const sidebar = document.getElementById('sidebar');
    const collapseBtn = document.getElementById('collapse-btn');
    const searchInput = document.getElementById('search-input');
    const breadcrumb = document.getElementById('breadcrumb');
    const fileList = document.getElementById('file-list');
    const contentTopbar = document.getElementById('content-topbar');
    const topbarLeft = document.getElementById('topbar-left');
    const welcomeEl = document.getElementById('welcome');
    const previewFrame = document.getElementById('preview-frame');
    const fallbackView = document.getElementById('fallback-view');
    const tocFloat = document.getElementById('toc-float');
    const tocFloatList = document.getElementById('toc-float-list');
    const tocToggleBtn = document.getElementById('toc-toggle-btn');
    const tocDrawerBackdrop = document.getElementById('toc-drawer-backdrop');
    const tocDrawer = document.getElementById('toc-drawer');
    const tocDrawerClose = document.getElementById('toc-drawer-close');
    const tocDrawerList = document.getElementById('toc-drawer-list');
    const themeBtn = document.getElementById('theme-btn');
    const rawBtn = document.getElementById('raw-btn');

    /* ===== SIDEBAR COLLAPSE ===== */
    function applySidebarState() {
      sidebar.classList.toggle('is-collapsed', sidebarCollapsed);
      collapseBtn.innerHTML = sidebarCollapsed ? '${icons.chevronRight}' : '${icons.chevronLeft}';
      collapseBtn.title = sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }
    applySidebarState();

    collapseBtn.addEventListener('click', () => {
      sidebarCollapsed = !sidebarCollapsed;
      localStorage.setItem('mkdp-sidebar-collapsed', sidebarCollapsed);
      applySidebarState();
    });

    /* ===== THEME ===== */
    function applyTheme(theme) {
      if (theme) {
        document.documentElement.style.colorScheme = theme;
        localStorage.setItem('mkdp-theme', theme);
      } else {
        document.documentElement.style.colorScheme = '';
        localStorage.removeItem('mkdp-theme');
      }
      currentTheme = theme;
    }
    if (currentTheme) applyTheme(currentTheme);

    themeBtn.addEventListener('click', () => {
      const isDark = currentTheme === 'dark' || (!currentTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      applyTheme(isDark ? 'light' : 'dark');
    });

    /* ===== BREADCRUMB ===== */
    function renderBreadcrumb(dir) {
      breadcrumb.innerHTML = '';
      const parts = dir === '.' ? [] : dir.split('/').filter(Boolean);

      const backBtn = document.createElement('span');
      backBtn.className = 'breadcrumb-link';
      backBtn.innerHTML = '${icons.chevronLeft}';
      backBtn.style.cursor = dir === '.' ? 'default' : 'pointer';
      backBtn.style.opacity = dir === '.' ? '0.3' : '1';
      backBtn.addEventListener('click', () => {
        if (dir === '.') return;
        const parentParts = parts.slice(0, -1);
        loadDirectory(parentParts.length ? parentParts.join('/') : '.');
      });
      breadcrumb.appendChild(backBtn);

      if (parts.length === 0) {
        const root = document.createElement('span');
        root.className = 'breadcrumb-current';
        root.textContent = '(root)';
        breadcrumb.appendChild(root);
        return;
      }

      parts.forEach((part, i) => {
        const sep = document.createElement('span');
        sep.innerHTML = '${icons.chevronSep}';
        sep.style.opacity = '0.4';
        breadcrumb.appendChild(sep);

        if (i < parts.length - 1) {
          const link = document.createElement('span');
          link.className = 'breadcrumb-link';
          link.textContent = part;
          link.addEventListener('click', () => {
            loadDirectory(parts.slice(0, i + 1).join('/'));
          });
          breadcrumb.appendChild(link);
        } else {
          const current = document.createElement('span');
          current.className = 'breadcrumb-current';
          current.textContent = part;
          breadcrumb.appendChild(current);
        }
      });
    }

    /* ===== SEARCH ===== */
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      renderFileList(query ? allEntries.filter(e => e.name.toLowerCase().includes(query)) : allEntries);
    });

    /* ===== FILE LIST ===== */
    function getFileIcon(entry) {
      if (entry.kind === 'directory') return ICONS.folder;
      if (entry.kind === 'blocked') return ICONS.blocked;
      if (entry.isMarkdown) return ICONS.markdown;
      return ICONS.textFile;
    }

    function renderFileList(entries) {
      fileList.innerHTML = '';
      if (!entries.length) {
        const empty = document.createElement('div');
        empty.className = 'empty-dir';
        empty.textContent = 'No files found.';
        fileList.appendChild(empty);
        return;
      }

      entries.forEach(entry => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'file-item';
        btn.disabled = entry.kind === 'blocked';
        if (entry.relativePath === selectedPath) btn.classList.add('is-active');
        if (entry.kind === 'blocked') btn.title = 'Outside root — access blocked';

        const iconSpan = document.createElement('span');
        iconSpan.innerHTML = getFileIcon(entry);
        btn.appendChild(iconSpan);

        const info = document.createElement('div');
        info.className = 'file-info';
        const nameDiv = document.createElement('div');
        nameDiv.className = 'file-name';
        nameDiv.textContent = entry.name;
        info.appendChild(nameDiv);
        const metaDiv = document.createElement('div');
        metaDiv.className = 'file-meta';
        metaDiv.textContent = entry.kind === 'directory'
          ? (entry.itemCount !== undefined ? entry.itemCount + ' items' : 'folder')
          : (entry.kind === 'blocked' ? 'blocked' : (entry.isMarkdown ? 'markdown' : 'text'));
        info.appendChild(metaDiv);
        btn.appendChild(info);

        if (entry.kind === 'directory') {
          const chev = document.createElement('span');
          chev.className = 'file-chevron';
          chev.innerHTML = ICONS.chevronRight;
          btn.appendChild(chev);
        }

        btn.addEventListener('click', () => {
          if (entry.kind === 'directory') {
            loadDirectory(entry.relativePath);
          } else if (entry.kind !== 'blocked') {
            openFile(entry.relativePath, entry);
          }
        });

        fileList.appendChild(btn);
      });
    }

    /* ===== DIRECTORY LOADING ===== */
    async function apiJson(url) {
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Request failed');
      return data;
    }

    async function loadDirectory(pathValue) {
      try {
        const data = await apiJson('/_mkdp/browse/tree?path=' + encodeURIComponent(pathValue || '.'));
        currentDir = data.relativePath || '.';
        location.hash = currentDir === '.' ? '' : currentDir;
        allEntries = data.entries;
        searchInput.value = '';
        renderBreadcrumb(currentDir);
        renderFileList(allEntries);
      } catch (err) {
        fileList.innerHTML = '<div class="empty-dir" style="color:var(--blocked-color);">' + (err.message || String(err)) + '</div>';
      }
    }

    /* ===== FILE OPENING ===== */
    function showWelcome() {
      welcomeEl.style.display = '';
      previewFrame.style.display = 'none';
      fallbackView.classList.remove('is-visible');
      contentTopbar.style.display = 'none';
      tocFloat.style.display = 'none';
      tocToggleBtn.style.display = 'none';
    }

    function showPreview(relativePath) {
      welcomeEl.style.display = 'none';
      fallbackView.classList.remove('is-visible');
      previewFrame.style.display = '';
      previewFrame.src = '/page/1?browsePath=' + encodeURIComponent(relativePath);
      contentTopbar.style.display = '';
      rawBtn.style.display = '';
      rawBtn.href = '/_mkdp/browse/raw?path=' + encodeURIComponent(relativePath);
      tocHeadings = [];
      activeTocId = '';
      renderTocFloat();
    }

    function showFallback(html) {
      welcomeEl.style.display = 'none';
      previewFrame.style.display = 'none';
      previewFrame.removeAttribute('src');
      fallbackView.innerHTML = html;
      fallbackView.classList.add('is-visible');
      contentTopbar.style.display = '';
      tocFloat.style.display = 'none';
      tocToggleBtn.style.display = 'none';
    }

    function setTopbar(entry) {
      const parts = entry.relativePath.split('/');
      const pathPart = parts.length > 1 ? parts.slice(0, -1).join('/') + ' / ' : '';
      topbarLeft.innerHTML = '';

      const icon = document.createElement('span');
      icon.innerHTML = getFileIcon(entry);
      topbarLeft.appendChild(icon);

      if (pathPart) {
        const pathSpan = document.createElement('span');
        pathSpan.className = 'topbar-path';
        pathSpan.textContent = pathPart;
        topbarLeft.appendChild(pathSpan);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'topbar-filename';
      nameSpan.textContent = entry.name;
      topbarLeft.appendChild(nameSpan);
    }

    async function openFile(relativePath, entry) {
      selectedPath = relativePath;
      renderFileList(searchInput.value.trim() ? allEntries.filter(e => e.name.toLowerCase().includes(searchInput.value.toLowerCase().trim())) : allEntries);

      try {
        const data = await apiJson('/_mkdp/browse/file?path=' + encodeURIComponent(relativePath));
        const fileEntry = entry || { name: data.name, relativePath: data.relativePath, isMarkdown: data.kind === 'markdown', kind: 'file' };
        setTopbar(fileEntry);

        if (data.kind === 'markdown') {
          showPreview(data.relativePath);
          return;
        }
        if (data.fallback === 'text') {
          showFallback('<pre class="fallback-text"></pre>');
          fallbackView.querySelector('.fallback-text').textContent = data.text || '';
          rawBtn.style.display = '';
          rawBtn.href = '/_mkdp/browse/raw?path=' + encodeURIComponent(data.relativePath);
          return;
        }
        showFallback('<div style="padding:40px;text-align:center;color:var(--muted);">Cannot preview this file.</div>');
      } catch (err) {
        showFallback('<div style="padding:20px;color:var(--blocked-color);">' + (err.message || String(err)) + '</div>');
      }
    }

    /* ===== TOC (from postMessage) ===== */
    function renderTocFloat() {
      if (!tocHeadings.length) {
        tocFloat.style.display = 'none';
        tocToggleBtn.style.display = 'none';
        renderTocDrawerList();
        return;
      }
      tocFloat.style.display = '';
      tocToggleBtn.style.display = '';
      tocFloatList.innerHTML = '';
      tocHeadings.forEach(h => {
        const a = document.createElement('a');
        a.className = 'toc-float-item' + (h.level >= 3 ? ' toc-level-3' : '') + (h.id === activeTocId ? ' is-active' : '');
        a.textContent = h.text;
        a.title = h.text;
        a.addEventListener('click', () => {
          previewFrame.contentWindow.postMessage({ type: 'mkdp:scroll-to', id: h.id }, '*');
        });
        tocFloatList.appendChild(a);
      });
      renderTocDrawerList();
    }

    function renderTocDrawerList() {
      tocDrawerList.innerHTML = '';
      tocHeadings.forEach(h => {
        const a = document.createElement('a');
        a.className = 'toc-float-item' + (h.level >= 3 ? ' toc-level-3' : '') + (h.id === activeTocId ? ' is-active' : '');
        a.textContent = h.text;
        a.addEventListener('click', () => {
          previewFrame.contentWindow.postMessage({ type: 'mkdp:scroll-to', id: h.id }, '*');
          closeTocDrawer();
        });
        tocDrawerList.appendChild(a);
      });
    }

    window.addEventListener('message', (event) => {
      if (!event.data || typeof event.data.type !== 'string') return;
      if (event.data.type === 'mkdp:toc') {
        tocHeadings = event.data.headings || [];
        renderTocFloat();
      } else if (event.data.type === 'mkdp:active-heading') {
        activeTocId = event.data.id || '';
        document.querySelectorAll('.toc-float-item').forEach(el => {
          el.classList.toggle('is-active', el.textContent === (tocHeadings.find(h => h.id === activeTocId) || {}).text);
        });
      }
    });

    /* ===== TOC DRAWER ===== */
    function openTocDrawer() {
      tocDrawerBackdrop.classList.add('is-open');
      tocDrawer.classList.add('is-open');
    }
    function closeTocDrawer() {
      tocDrawerBackdrop.classList.remove('is-open');
      tocDrawer.classList.remove('is-open');
    }
    tocToggleBtn.addEventListener('click', openTocDrawer);
    tocDrawerBackdrop.addEventListener('click', closeTocDrawer);
    tocDrawerClose.addEventListener('click', closeTocDrawer);

    /* ===== INIT ===== */
    const initialDir = decodeURIComponent(location.hash.replace(/^#/, '')) || '.';
    loadDirectory(initialDir);
  </script>
</body>
</html>`;
}
```

Note: The CSS from Task 3 Step 1 should be preserved inside the `<style>` tag. This step replaces the entire function with the final version combining CSS + HTML + JS.

- [ ] **Step 3: Run existing tests to verify no regressions**

Run: `node test/browse-service.test.js`
Expected: `browse-service tests: ok`

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/standalone-preview-server.js
git commit -m "feat(browse): rewrite browse shell with new UI

Complete rewrite of buildBrowseShellHtml() with:
- Notion/Yuque-style file browser layout
- Collapsible sidebar (280px <-> 48px) with localStorage persistence
- Inline SVG icon system (folder, markdown, text, blocked)
- Search box for filtering files
- Breadcrumb navigation
- Content area with topbar, theme toggle, raw download
- Floating TOC (postMessage from iframe)
- Responsive TOC drawer for narrow screens
- Welcome screen for initial state"
```

---

### Task 5: Add scroll-to handler in iframe for TOC clicks

**Files:**
- Modify: `app/pages/index.jsx:572-578`

- [ ] **Step 1: Add postMessage listener in `componentDidMount()`**

In `app/pages/index.jsx`, in `componentDidMount()`, after line 576 (`window.addEventListener('scroll', ...)`), add:

```js
    window.addEventListener('message', this.handleParentMessage)
```

- [ ] **Step 2: Add `handleParentMessage` method**

Add the method binding in the constructor (after line 153):

```js
    this.handleParentMessage = this.handleParentMessage.bind(this)
```

Add the method itself (after `handleWindowScroll`, around line 430):

```js
  handleParentMessage(event) {
    if (!event.data || event.data.type !== 'mkdp:scroll-to') {
      return
    }
    const id = event.data.id
    if (id) {
      scrollToHashTarget(`#${id}`)
    }
  }
```

- [ ] **Step 3: Clean up listener in `componentWillUnmount()`**

Add after line 614 (`window.removeEventListener('scroll', ...)`):

```js
    window.removeEventListener('message', this.handleParentMessage)
```

- [ ] **Step 4: Commit**

```bash
git add app/pages/index.jsx
git commit -m "feat(browse): handle scroll-to messages from parent frame

When the browse shell TOC sends a scroll-to message via
postMessage, scroll to the target heading in the iframe."
```

---

### Task 6: Manual integration test

**Files:** None (testing only)

- [ ] **Step 1: Start the browse server**

Run: `node scripts/mkdp-browse.js . --no-browser`

This starts the browse server on the current project directory.

- [ ] **Step 2: Open in browser and verify**

Open the URL printed to stdout (e.g., `http://127.0.0.1:<port>/_mkdp/browse`).

Verify:
1. Sidebar shows file/folder cards with SVG icons
2. Binary files (`.png`, `.tar.gz`, etc.) are NOT shown in the sidebar
3. Markdown files are shown with blue icon, text files with muted icon
4. Clicking a markdown file renders it in the content area
5. Floating TOC appears on the right after markdown loads
6. TOC active heading tracks scrolling
7. Clicking a TOC item scrolls the document
8. Sidebar collapse/expand works with animation
9. Breadcrumb navigation works
10. Search filters files in real time
11. Theme toggle switches light/dark
12. Raw button downloads the file
13. Narrow the window — TOC hides, button appears, drawer works
14. Narrow further — sidebar auto-collapses to icon strip
15. Refresh page — sidebar collapse state and theme persist

- [ ] **Step 3: Fix any issues found**

Address any visual or functional issues discovered during testing.

- [ ] **Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix(browse): address integration test findings"
```

---

## Summary

| Task | Description | Estimated Scope |
|------|-------------|-----------------|
| 1 | Filter binary files from directory listing | `browse-service.js` + test |
| 2 | postMessage TOC bridge in iframe | `index.jsx` + `page.css` |
| 3 | Browse shell CSS foundation | `standalone-preview-server.js` |
| 4 | Browse shell HTML + JS + icons | `standalone-preview-server.js` |
| 5 | Scroll-to handler in iframe | `index.jsx` |
| 6 | Manual integration test | Testing only |

Tasks 1-2 are independent and can be parallelized. Tasks 3-4 are sequential. Task 5 depends on Task 4. Task 6 depends on all.
