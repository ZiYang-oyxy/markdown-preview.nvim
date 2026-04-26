# Browse Mode 文档渲染风格统一 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the visual style between the browse shell and embedded document rendering page, eliminating header duplication, control style conflicts, and dual TOC systems.

**Architecture:** The browse shell (vanilla JS in `standalone-preview-server.js`) communicates with the document iframe (`index.jsx`) via `postMessage`. We add new message types for theme/mermaid/export control, hide the document's own header in browse mode via CSS, and upgrade the shell's flat TOC to a tree structure with collapse/expand.

**Tech Stack:** Vanilla JS (shell), React class component (document page), CSS custom properties, postMessage API.

---

## File Structure

| File | Role | Change Type |
|------|------|-------------|
| `app/_static/page.css` | Document page layout CSS | Modify — add browse-mode rules to hide header/toolbar, adjust border-radius |
| `app/pages/index.jsx` | Document React page | Modify — expand `handleParentMessage` for new message types, post `mkdp:state` to parent |
| `scripts/lib/standalone-preview-server.js` | Browse shell HTML generator | Modify — add topbar controls + popover, upgrade TOC to tree, handle new postMessage types |

---

### Task 1: Hide document header in browse mode (CSS)

**Files:**
- Modify: `app/_static/page.css:696-705` (existing `.mkdp-browse-mode` rules)

- [ ] **Step 1: Add browse-mode header hiding rules**

Append these rules to the existing `.mkdp-browse-mode` block at the end of `app/_static/page.css`. Find the existing block (lines 696-705) and add new rules after line 705:

```css
/* Hide document header and toolbar when inside browse shell iframe */
.mkdp-browse-mode #page-header,
.mkdp-browse-mode .mkdp-page-toolbar {
  display: none !important;
}

/* In browse mode, markdown-body always gets full border-radius since no header is above it */
.mkdp-browse-mode #page-ctn .markdown-body {
  border-radius: 14px;
}

/* Remove outer padding and background gradient in browse mode for seamless iframe fit */
.mkdp-browse-mode main {
  padding: 8px 12px 12px;
  background: var(--secondary-background-color);
}

/* Force single-column layout in browse mode (no built-in TOC column) */
.mkdp-browse-mode #page-shell,
.mkdp-browse-mode #page-shell.has-toc {
  grid-template-columns: minmax(0, 1fr);
}
```

- [ ] **Step 2: Verify the CSS changes don't break standalone mode**

Open a markdown file directly in standalone mode (not browse). Verify the header and TOC panel still appear normally. The `.mkdp-browse-mode` class is only added when `?browsePath=` is present, so standalone mode should be unaffected.

- [ ] **Step 3: Commit**

```bash
git add app/_static/page.css
git commit -m "feat(browse): hide document header in browse mode for unified UI"
```

---

### Task 2: Expand iframe postMessage handling (document side)

**Files:**
- Modify: `app/pages/index.jsx:450-458` (`handleParentMessage` method)
- Modify: `app/pages/index.jsx:609-619` (`componentDidMount` method)
- Modify: `app/pages/index.jsx:806-819` (inside `refreshRender` callback)

- [ ] **Step 1: Expand `handleParentMessage` to handle new message types**

Replace the existing `handleParentMessage` method (lines 450-458) with:

```jsx
  handleParentMessage(event) {
    if (!event.data || typeof event.data.type !== 'string') {
      return
    }
    if (event.data.type === 'mkdp:scroll-to') {
      const id = event.data.id
      if (id) {
        scrollToHashTarget(`#${id}`)
      }
      return
    }
    if (event.data.type === 'mkdp:set-theme') {
      const theme = event.data.theme
      if (theme && ['light', 'dark'].includes(theme)) {
        this.setThemeMode(theme)
      }
      return
    }
    if (event.data.type === 'mkdp:set-mermaid-theme') {
      const preset = event.data.preset
      if (preset && MERMAID_THEME_PRESETS.includes(preset)) {
        this.setMermaidThemePreset(preset)
      }
      return
    }
    if (event.data.type === 'mkdp:export') {
      const exportBtn = document.getElementById('mkdp-export-btn')
      if (exportBtn && !exportBtn.disabled) {
        exportBtn.click()
      }
      return
    }
  }
```

- [ ] **Step 2: Add `postStateToParent` method**

Add a new method after `postTocToParent` (after line 400):

```jsx
  postStateToParent() {
    if (typeof window === 'undefined' || !window.parent || window.parent === window) {
      return
    }
    const hasMermaid = typeof document !== 'undefined' &&
      document.querySelectorAll('.mermaid').length > 0
    try {
      window.parent.postMessage({
        type: 'mkdp:state',
        theme: this.state.theme || 'light',
        mermaidPreset: this.getActiveMermaidThemePreset(),
        hasMermaid: hasMermaid
      }, '*')
    } catch (_) {}
  }
```

- [ ] **Step 3: Bind `postStateToParent` in constructor**

Add to the constructor bindings (after line 164, the `this.setMermaidThemePreset` binding):

```jsx
    this.postStateToParent = this.postStateToParent.bind(this)
```

- [ ] **Step 4: Call `postStateToParent` after content renders**

In the `refreshRender` function, inside the `setState` callback (around line 806-819), add `this.postStateToParent()` after `this.updateTocItems()`. Find the block:

```jsx
        if (refreshContent) {
          bindPreviewInteractions(document)
          this.renderMermaidDiagrams(document)

          chart.render()
          renderDiagram()
          renderFlowchart()
          renderDot()
          window.setTimeout(() => bindPreviewInteractions(document), 0)
          this.updateTocItems()
        }
```

Add `this.postStateToParent()` after `this.updateTocItems()`:

```jsx
        if (refreshContent) {
          bindPreviewInteractions(document)
          this.renderMermaidDiagrams(document)

          chart.render()
          renderDiagram()
          renderFlowchart()
          renderDot()
          window.setTimeout(() => bindPreviewInteractions(document), 0)
          this.updateTocItems()
          this.postStateToParent()
        }
```

- [ ] **Step 5: Also post state after theme/mermaid changes**

Update `setThemeMode` (lines 167-173) to also notify parent:

```jsx
  setThemeMode(theme) {
    this.setState({
      theme
    }, () => {
      this.renderMermaidDiagrams()
      this.postStateToParent()
    })
  }
```

Update `setMermaidThemePreset` (lines 187-194) to also notify parent:

```jsx
  setMermaidThemePreset(themePreset) {
    this.setState({
      mermaidThemePreset: themePreset,
      mermaidThemePresetTouched: true
    }, () => {
      this.renderMermaidDiagrams()
      this.postStateToParent()
    })
  }
```

- [ ] **Step 6: Commit**

```bash
git add app/pages/index.jsx
git commit -m "feat(browse): expand iframe postMessage for theme/mermaid/export control"
```

---

### Task 3: Add topbar controls and popover to browse shell

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js` — CSS section (~line 82-526), HTML section (~line 528-585), JS section (~line 587-982)

This is the largest task. We add three new icon buttons (color theme, mermaid theme, export) to the shell topbar with a popover component, and wire them to postMessage.

- [ ] **Step 1: Add new SVG icons to `svgIcons()` function**

Add these three new icons to the return object of `svgIcons()` (after the `fileEntry` icon, before the closing `};` at line 68):

```js
    colorTheme: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.3"/><path d="M7 1.5A5.5 5.5 0 007 12.5V1.5z" fill="currentColor"/></svg>',
    mermaidChart: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="7" width="3" height="5.5" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="5.5" y="4" width="3" height="8.5" rx="0.5" stroke="currentColor" stroke-width="1.2"/><rect x="10" y="1.5" width="3" height="11" rx="0.5" stroke="currentColor" stroke-width="1.2"/></svg>',
    exportHtml: '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 1.5h5l3.5 3.5v7.5a1 1 0 01-1 1H3a1 1 0 01-1-1v-11a1 1 0 011-1z" stroke="currentColor" stroke-width="1.2"/><path d="M8 1.5V5h3.5" stroke="currentColor" stroke-width="1.2"/><path d="M5 8.5l2 2 2-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
```

- [ ] **Step 2: Add popover and separator CSS**

Add the following CSS before the `/* ---- Responsive ---- */` comment (before line 503). Insert after the `.toc-drawer-body` rule (after line 501):

```css
    /* ---- Popover ---- */
    .topbar-btn-wrap { position: relative; }
    .topbar-popover {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 120px;
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
      padding: 4px;
      z-index: 50;
      display: none;
    }
    .topbar-popover.is-open { display: block; }
    .topbar-popover-item {
      display: block;
      width: 100%;
      padding: 6px 10px;
      border: none;
      background: transparent;
      color: var(--text);
      font-size: 12px;
      text-align: left;
      border-radius: 5px;
      cursor: pointer;
      font-family: inherit;
    }
    .topbar-popover-item:hover { background: var(--accent-soft); }
    .topbar-popover-item.is-active { color: var(--accent); font-weight: 500; }
    .topbar-sep {
      display: inline-block;
      width: 1px;
      height: 18px;
      background: var(--border);
      vertical-align: middle;
    }
```

- [ ] **Step 3: Update topbar HTML with new buttons**

Replace the `<div class="topbar-right">` block (lines 554-558) with:

```html
        <div class="topbar-right">
          <div class="topbar-btn-wrap is-hidden" id="color-theme-wrap">
            <button class="topbar-btn" id="color-theme-btn" type="button" title="Document color theme">${esc(icons.colorTheme)}</button>
            <div class="topbar-popover" id="color-theme-popover">
              <button class="topbar-popover-item" data-value="light" type="button">☀️ 浅色</button>
              <button class="topbar-popover-item" data-value="dark" type="button">🌙 深色</button>
            </div>
          </div>
          <div class="topbar-btn-wrap is-hidden" id="mermaid-theme-wrap">
            <button class="topbar-btn" id="mermaid-theme-btn" type="button" title="Mermaid chart theme">${esc(icons.mermaidChart)}</button>
            <div class="topbar-popover" id="mermaid-theme-popover">
              <button class="topbar-popover-item" data-value="modern" type="button">现代</button>
              <button class="topbar-popover-item" data-value="minimal" type="button">极简</button>
              <button class="topbar-popover-item" data-value="warm" type="button">暖色</button>
              <button class="topbar-popover-item" data-value="forest" type="button">森林</button>
            </div>
          </div>
          <button class="topbar-btn is-hidden" id="export-btn" type="button" title="Export HTML">${esc(icons.exportHtml)}</button>
          <span class="topbar-sep is-hidden" id="doc-controls-sep"></span>
          <button class="topbar-btn is-hidden" id="toc-toggle-btn" type="button" title="Table of contents">${esc(icons.toc)}</button>
          <button class="topbar-btn" id="theme-btn" type="button" title="Toggle theme">${esc(icons.sun)}</button>
          <a class="topbar-btn is-hidden" id="raw-link" title="Download raw" target="_blank" rel="noopener">${esc(icons.download)}</a>
        </div>
```

- [ ] **Step 4: Add DOM refs for new elements**

After the existing DOM refs block (after `var tocDrawerList = ...` at line 622), add:

```js
    var colorThemeWrap = document.getElementById('color-theme-wrap');
    var colorThemeBtn = document.getElementById('color-theme-btn');
    var colorThemePopover = document.getElementById('color-theme-popover');
    var mermaidThemeWrap = document.getElementById('mermaid-theme-wrap');
    var mermaidThemeBtn = document.getElementById('mermaid-theme-btn');
    var mermaidThemePopover = document.getElementById('mermaid-theme-popover');
    var exportBtn = document.getElementById('export-btn');
    var docControlsSep = document.getElementById('doc-controls-sep');
```

- [ ] **Step 5: Add document state tracking and popover logic**

Add the following after the existing `/* ---- State ---- */` variables (after line 631):

```js
    var docTheme = 'light';
    var docMermaidPreset = 'modern';
    var docHasMermaid = false;
```

Then add popover logic after the sidebar collapse section (after line 664, after the `collapseBtn` click listener):

```js
    /* ---- Popover helper ---- */
    var activePopover = null;

    function openPopover(popoverEl) {
      if (activePopover && activePopover !== popoverEl) {
        activePopover.classList.remove('is-open');
      }
      popoverEl.classList.toggle('is-open');
      activePopover = popoverEl.classList.contains('is-open') ? popoverEl : null;
    }

    function closeAllPopovers() {
      if (activePopover) {
        activePopover.classList.remove('is-open');
        activePopover = null;
      }
    }

    document.addEventListener('click', function(e) {
      if (activePopover && !e.target.closest('.topbar-btn-wrap')) {
        closeAllPopovers();
      }
    });

    /* ---- Document control buttons ---- */
    function showDocControls() {
      colorThemeWrap.classList.remove('is-hidden');
      exportBtn.classList.remove('is-hidden');
      docControlsSep.classList.remove('is-hidden');
      if (docHasMermaid) {
        mermaidThemeWrap.classList.remove('is-hidden');
      } else {
        mermaidThemeWrap.classList.add('is-hidden');
      }
    }

    function hideDocControls() {
      colorThemeWrap.classList.add('is-hidden');
      mermaidThemeWrap.classList.add('is-hidden');
      exportBtn.classList.add('is-hidden');
      docControlsSep.classList.add('is-hidden');
    }

    function updatePopoverActive(popoverEl, activeValue) {
      var items = popoverEl.querySelectorAll('.topbar-popover-item');
      for (var i = 0; i < items.length; i++) {
        if (items[i].getAttribute('data-value') === activeValue) {
          items[i].classList.add('is-active');
        } else {
          items[i].classList.remove('is-active');
        }
      }
    }

    colorThemeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      openPopover(colorThemePopover);
    });

    colorThemePopover.addEventListener('click', function(e) {
      var item = e.target.closest('.topbar-popover-item');
      if (!item) return;
      var value = item.getAttribute('data-value');
      if (value) {
        docTheme = value;
        previewFrame.contentWindow.postMessage({ type: 'mkdp:set-theme', theme: value }, '*');
        updatePopoverActive(colorThemePopover, value);
      }
      closeAllPopovers();
    });

    mermaidThemeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      openPopover(mermaidThemePopover);
    });

    mermaidThemePopover.addEventListener('click', function(e) {
      var item = e.target.closest('.topbar-popover-item');
      if (!item) return;
      var value = item.getAttribute('data-value');
      if (value) {
        docMermaidPreset = value;
        previewFrame.contentWindow.postMessage({ type: 'mkdp:set-mermaid-theme', preset: value }, '*');
        updatePopoverActive(mermaidThemePopover, value);
      }
      closeAllPopovers();
    });

    exportBtn.addEventListener('click', function() {
      if (previewFrame.classList.contains('is-visible')) {
        previewFrame.contentWindow.postMessage({ type: 'mkdp:export' }, '*');
      }
    });
```

- [ ] **Step 6: Handle `mkdp:state` message from iframe**

In the existing `window.addEventListener('message', ...)` handler (around line 940), add a new block to handle `mkdp:state`. Insert after the `mkdp:active-heading` handler (after line 961):

```js
      if (event.data.type === 'mkdp:state') {
        docTheme = event.data.theme || 'light';
        docMermaidPreset = event.data.mermaidPreset || 'modern';
        docHasMermaid = Boolean(event.data.hasMermaid);
        updatePopoverActive(colorThemePopover, docTheme);
        updatePopoverActive(mermaidThemePopover, docMermaidPreset);
        showDocControls();
      }
```

- [ ] **Step 7: Show/hide doc controls on file open/close**

In the existing `showWelcome()` function (around line 835), add `hideDocControls()` call. Find:

```js
    function showWelcome() {
      welcomeScreen.classList.remove('is-hidden');
```

Add `hideDocControls();` inside the function body, after the existing `tocToggleBtn.classList.add('is-hidden');` line.

In the existing `showFallback()` function (around line 857), add `hideDocControls();` similarly, after the `tocToggleBtn.classList.add('is-hidden');` line.

- [ ] **Step 8: Commit**

```bash
git add scripts/lib/standalone-preview-server.js
git commit -m "feat(browse): add topbar controls and popover for theme/mermaid/export"
```

---

### Task 4: Upgrade shell TOC to tree structure

**Files:**
- Modify: `scripts/lib/standalone-preview-server.js` — CSS section, HTML section, JS section

- [ ] **Step 1: Replace flat TOC CSS with tree CSS**

Replace the existing flat TOC styles (`.toc-list` through `.toc-link.is-deep`, lines 434-451) with tree styles:

```css
    .toc-tree { list-style: none; margin: 0; padding: 0; }
    .toc-node { margin: 1px 0; }
    .toc-node-row { display: flex; align-items: flex-start; gap: 2px; }
    .toc-node-toggle {
      width: 18px; height: 18px; flex: 0 0 18px;
      margin-top: 1px;
      border: 0; background: transparent; color: var(--muted);
      cursor: pointer; border-radius: 4px; font-size: 12px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      font-family: inherit; line-height: 1;
    }
    .toc-node-toggle:hover { background: var(--accent-soft); color: var(--text); }
    .toc-node-placeholder { width: 18px; height: 18px; flex: 0 0 18px; }
    .toc-node-link {
      flex: 1; min-width: 0;
      padding: 3px 6px; border-radius: 4px;
      font-size: 12px; color: var(--muted);
      text-decoration: none; cursor: pointer;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      border-left: 2px solid transparent;
    }
    .toc-node-link:hover { color: var(--text); background: var(--accent-soft); }
    .toc-node.is-active > .toc-node-row > .toc-node-link {
      border-left-color: var(--accent); color: var(--accent); font-weight: 500;
    }
    .toc-node-children {
      margin-left: 9px; padding-left: 8px;
      border-left: 1px solid var(--border);
    }
    .toc-node.is-collapsed > .toc-node-children { display: none; }
```

- [ ] **Step 2: Add close button to floating TOC panel and update HTML**

Replace the `.toc-float` inner HTML (lines 567-570):

```html
        <div class="toc-float" id="toc-float">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div class="toc-title">On this page</div>
            <button class="toc-drawer-close" id="toc-float-close" type="button" title="Close">&times;</button>
          </div>
          <div class="toc-tree" id="toc-float-list"></div>
        </div>
```

Also update the TOC drawer body to use `toc-tree` class (line 583):

```html
      <div class="toc-tree" id="toc-drawer-list"></div>
```

- [ ] **Step 3: Add DOM ref for close button and new state variables**

After the existing DOM refs, add:

```js
    var tocFloatClose = document.getElementById('toc-float-close');
```

After the existing state variables (after the `var currentTheme = ...` line), add:

```js
    var tocExpandedMap = {};
    var tocCollapsed = localStorage.getItem('mkdp-toc-collapsed') === '1';
```

- [ ] **Step 4: Replace `renderTocList` with `buildTocTree` and `renderTocTree`**

Replace the entire TOC rendering section (lines 917-937, from `/* ---- TOC rendering ---- */` through `function renderTocDrawerList()`) with:

```js
    /* ---- TOC tree ---- */
    function buildTocTree(headings) {
      var root = { level: 0, children: [] };
      var stack = [root];
      headings.forEach(function(h) {
        var node = { id: h.id, text: h.text, level: h.level, children: [] };
        while (stack.length > 1 && node.level <= stack[stack.length - 1].level) {
          stack.pop();
        }
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      });
      return root.children;
    }

    function ensureAncestorsExpanded(tree, targetId) {
      function walk(nodes) {
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (node.id === targetId) return true;
          if (node.children.length > 0 && walk(node.children)) {
            tocExpandedMap[node.id] = true;
            return true;
          }
        }
        return false;
      }
      walk(tree);
    }

    function renderTocTree(container, nodes) {
      container.innerHTML = '';
      function renderNodes(parentEl, nodeList) {
        nodeList.forEach(function(node) {
          var li = document.createElement('div');
          li.className = 'toc-node';
          if (node.id === activeTocId) li.classList.add('is-active');

          var hasChildren = node.children.length > 0;
          var isExpanded = hasChildren ? tocExpandedMap[node.id] !== false : false;
          if (hasChildren && !isExpanded) li.classList.add('is-collapsed');

          var row = document.createElement('div');
          row.className = 'toc-node-row';

          if (hasChildren) {
            var toggle = document.createElement('button');
            toggle.className = 'toc-node-toggle';
            toggle.type = 'button';
            toggle.textContent = isExpanded ? '−' : '+';
            toggle.addEventListener('click', (function(nid) {
              return function(e) {
                e.stopPropagation();
                tocExpandedMap[nid] = !tocExpandedMap[nid];
                renderTocFloat();
                renderTocDrawerList();
              };
            })(node.id));
            row.appendChild(toggle);
          } else {
            var placeholder = document.createElement('span');
            placeholder.className = 'toc-node-placeholder';
            row.appendChild(placeholder);
          }

          var link = document.createElement('a');
          link.className = 'toc-node-link';
          link.textContent = node.text;
          link.title = node.text;
          link.addEventListener('click', function() {
            previewFrame.contentWindow.postMessage({ type: 'mkdp:scroll-to', id: node.id }, '*');
            closeTocDrawer();
          });
          row.appendChild(link);

          li.appendChild(row);

          if (hasChildren) {
            var childContainer = document.createElement('div');
            childContainer.className = 'toc-node-children';
            renderNodes(childContainer, node.children);
            li.appendChild(childContainer);
          }

          parentEl.appendChild(li);
        });
      }
      var tree = buildTocTree(tocHeadings);
      renderNodes(container, tree);
    }

    function renderTocFloat() { renderTocTree(tocFloatList, tocHeadings); }
    function renderTocDrawerList() { renderTocTree(tocDrawerList, tocHeadings); }
```

- [ ] **Step 5: Initialize default expanded state on TOC update**

In the `mkdp:toc` message handler (around line 943), update to initialize `tocExpandedMap`:

Replace the existing `if (event.data.type === 'mkdp:toc')` block with:

```js
      if (event.data.type === 'mkdp:toc') {
        tocHeadings = event.data.headings || [];
        activeTocId = '';
        // Initialize expanded map: h1/h2 expanded, h3+ collapsed
        tocExpandedMap = {};
        tocHeadings.forEach(function(h) {
          tocExpandedMap[h.id] = h.level <= 2;
        });
        if (tocHeadings.length > 0) {
          if (!tocCollapsed) {
            tocFloat.classList.add('is-visible');
          }
          tocToggleBtn.classList.remove('is-hidden');
        } else {
          tocFloat.classList.remove('is-visible');
          tocToggleBtn.classList.add('is-hidden');
        }
        renderTocFloat();
        renderTocDrawerList();
      }
```

- [ ] **Step 6: Auto-expand ancestors on active heading change**

In the `mkdp:active-heading` handler, add ancestor expansion logic:

Replace the existing `if (event.data.type === 'mkdp:active-heading')` block with:

```js
      if (event.data.type === 'mkdp:active-heading') {
        activeTocId = event.data.id || '';
        var tree = buildTocTree(tocHeadings);
        ensureAncestorsExpanded(tree, activeTocId);
        renderTocFloat();
        renderTocDrawerList();
      }
```

- [ ] **Step 7: Wire up TOC float close button and toggle behavior**

Replace the existing TOC drawer open/close section and event bindings (lines 964-977) with:

```js
    /* ---- TOC float close and toggle ---- */
    tocFloatClose.addEventListener('click', function() {
      tocFloat.classList.remove('is-visible');
      tocCollapsed = true;
      localStorage.setItem('mkdp-toc-collapsed', '1');
    });

    /* ---- TOC drawer open/close ---- */
    function openTocDrawer() {
      tocDrawerBackdrop.classList.add('is-open');
      tocDrawer.classList.add('is-open');
      renderTocDrawerList();
    }
    function closeTocDrawer() {
      tocDrawerBackdrop.classList.remove('is-open');
      tocDrawer.classList.remove('is-open');
    }

    tocToggleBtn.addEventListener('click', function() {
      // On wide screens: toggle the float panel
      if (window.innerWidth >= 1100) {
        tocCollapsed = !tocCollapsed;
        localStorage.setItem('mkdp-toc-collapsed', tocCollapsed ? '1' : '0');
        if (tocCollapsed) {
          tocFloat.classList.remove('is-visible');
        } else if (tocHeadings.length > 0) {
          tocFloat.classList.add('is-visible');
          renderTocFloat();
        }
      } else {
        // On narrow screens: open the drawer
        openTocDrawer();
      }
    });
    tocDrawerClose.addEventListener('click', closeTocDrawer);
    tocDrawerBackdrop.addEventListener('click', closeTocDrawer);
```

- [ ] **Step 8: Update `showWelcome` to reset TOC collapsed state visibility**

In the `showWelcome()` function, find the line `tocFloat.classList.remove('is-visible');` and keep it. This already correctly hides the float when no file is selected.

- [ ] **Step 9: Update responsive CSS for toc-toggle visibility**

The existing responsive rule at line 506 hides `#toc-toggle-btn` on wide screens. We need to change this so the toggle is always visible when there are headings (it now controls float panel show/hide on wide screens too).

Replace the existing responsive TOC media query (lines 504-510):

```css
    @media (min-width: 1100px) {
      .toc-float.is-visible { display: block; }
    }
    @media (max-width: 1099px) {
      .toc-float { display: none !important; }
    }
```

(Removed the `#toc-toggle-btn { display: none !important; }` rule so the button is visible on all screen sizes.)

- [ ] **Step 10: Commit**

```bash
git add scripts/lib/standalone-preview-server.js
git commit -m "feat(browse): upgrade shell TOC to tree structure with collapse/expand"
```

---

### Task 5: Manual integration test

**Files:** none (testing only)

- [ ] **Step 1: Start the dev server**

```bash
cd /Volumes/code/nvim/markdown-preview.nvim
node -e "
const { startStandalonePreviewServer } = require('./scripts/lib/standalone-preview-server');
const path = require('path');
startStandalonePreviewServer({
  browseRoot: path.resolve('.'),
  previewOptions: { disable_filename: 0 },
  pageTitle: '\${name}',
  theme: 'light',
  name: 'test',
  contentLines: ['# Test']
}).then(s => console.log('Server:', s.origin + '/_mkdp/browse'));
"
```

- [ ] **Step 2: Test browse mode document rendering**

Open the browse URL in a browser. Click on a markdown file (e.g., `README.md`). Verify:

1. **No document header** — the document renders without the filename header bar or toolbar inside the iframe
2. **Topbar controls visible** — color theme, export buttons appear in the shell topbar; mermaid button appears if the document contains mermaid diagrams
3. **Color theme popover** — click the color theme button, verify popover shows "浅色/深色", selecting changes the document theme (not the shell)
4. **Export button** — click export button, verify the document exports as HTML
5. **Shell theme button** — clicking the sun icon still toggles the shell theme independently

- [ ] **Step 3: Test TOC tree**

1. Open a markdown file with multiple heading levels (h1, h2, h3, h4)
2. **Tree structure** — verify TOC shows nested structure with indentation
3. **Collapse/expand** — click +/− buttons on nodes with children
4. **Active tracking** — scroll through the document, verify active heading is highlighted and ancestors auto-expand
5. **Float panel close** — click ✕ on the TOC float panel, verify it hides. Click the TOC toggle button in topbar to reopen it
6. **Persistence** — close and reopen the TOC, verify collapse state persists via localStorage

- [ ] **Step 4: Test standalone mode not broken**

Access `/page/1` directly (without `?browsePath=`). Verify:
1. Document header with filename, theme select, mermaid select, export button all show normally
2. Built-in TOC panel appears on the left as before
3. No visual regressions

- [ ] **Step 5: Test responsive behavior**

Resize browser to < 1100px width. Verify:
1. TOC float panel hides
2. TOC toggle button opens the drawer from the right
3. Drawer TOC shows tree structure
4. Document controls still visible in topbar
