# Markdown Preview Secure Static Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Naming update:** The shipped user-facing name is **Markdown Preview** and its primary CLI entry is `mkdp paste`. The old `mkdp preview` command remains a hidden compatibility alias; historical internal `preview` paths, storage keys, and protocol identifiers remain unchanged.

**Goal:** Build a paste-first Markdown Preview that is safe to publish as a static site and runs locally through a minimal loopback-only static server.

**Architecture:** Create an independent React/Vite application under `preview/`. The top-level shell owns UI and constrained `localStorage`; an opaque sandbox iframe renders untrusted Markdown through a private `MessageChannel` using a strict allowlisted renderer. Public deployment serves `preview/dist/` only, while `mkdp paste` serves the same files on a fixed loopback origin without exposing the legacy Preview/Browser server.

**Tech Stack:** React 19.2.7, Vite 8.1.3, markdown-it 14.3.0, Mermaid 11.16.0, KaTeX 0.17.0, DOMPurify 3.4.11, highlight.js 11.11.1, Vitest 4.1.x, Playwright.

## Global Constraints

- Treat every pasted/imported Markdown byte as untrusted.
- Top-level shell never inserts user-controlled HTML.
- Preview iframe is exactly `sandbox="allow-scripts"`; never add `allow-same-origin`.
- No backend data API, Socket.IO, Browse route, local image route, remote proxy, PlantUML, legacy diagram plugins, or remote resource loading.
- Storage is constrained `localStorage`: 50 documents, 1 MiB per document, about 4 MiB total.
- Safe renderer uses `html:false`, URL allowlists, DOMPurify, KaTeX `trust:false`, and immutable Mermaid strict settings.
- Exported HTML is inert: no script, event attribute, active embedding, remote fetch, or `foreignObject`.
- Desktop/mobile visuals follow the accepted concepts and exact token palette.
- Existing Browser, Preview, and Scratch behavior remains unchanged.
- Static artifact must work from a relative base path and contain no dynamic route dependency.

---

### Task 1: Scaffold isolated static Markdown Preview and constrained storage

**Files:**
- Create: `preview/package.json`
- Create: `preview/package-lock.json`
- Create: `preview/index.html`
- Create: `preview/public/preview-frame.html`
- Create: `preview/vite.config.js`
- Create: `preview/vite.preview.config.js`
- Create: `preview/src/main.jsx`
- Create: `preview/src/storage.js`
- Create: `preview/src/storage.test.js`
- Create: `preview/src/styles.css`

**Interfaces:**
- Produces `loadIndex()`, `loadDocument(id)`, `createDocument(markdown)`, `updateDocument(id, markdown)`, `deleteDocument(id)`, `subscribeToStorage(listener)`.
- Produces static `preview/dist/index.html` and `preview/dist/preview-frame.html`.

- [ ] **Step 1: Add package manifest and deterministic build commands**

```json
{
  "name": "markdown-preview",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build && vite build --config vite.preview.config.js",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "audit": "npm audit --audit-level=high"
  },
  "dependencies": {
    "dompurify": "3.4.11",
    "highlight.js": "11.11.1",
    "katex": "0.17.0",
    "markdown-it": "14.3.0",
    "mermaid": "11.16.0",
    "react": "19.2.7",
    "react-dom": "19.2.7"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "6.0.3",
    "vite": "8.1.3",
    "vitest": "4.1.10"
  }
}
```

Generate `package-lock.json` with `npm install` inside `preview/`; do not edit lockfile manually.

- [ ] **Step 2: Write failing storage tests**

Test exact limits, title extraction, separate per-document keys, deletion, corrupted index recovery, `QuotaExceededError`, and `storage` event handling. Use an injected Storage-compatible test double so the unit tests do not require jsdom.

```js
const store = createPreviewStorage(memoryStorage())
const first = store.createDocument('# 第一份\n正文')
expect(store.loadDocument(first.id).markdown).toContain('第一份')
expect(store.loadIndex().documents).toHaveLength(1)
expect(() => store.createDocument('x'.repeat(MAX_DOCUMENT_BYTES + 1))).toThrow(/1 MiB/)
```

- [ ] **Step 3: Run the storage tests and verify RED**

Run: `npm test -- storage.test.js` from `preview/`.

Expected: FAIL because `storage.js` does not exist.

- [ ] **Step 4: Implement constrained localStorage**

Use keys `mkdp-preview:index:v1`, `mkdp-preview:document:<id>`, and `mkdp-preview:preferences:v1`. Compute UTF-8 bytes with `new TextEncoder().encode(value).byteLength`; write the document before metadata, roll back the document if metadata fails, and never report saved state after an exception. Use `crypto.randomUUID()` with a random-value fallback.

- [ ] **Step 5: Create the React shell skeleton and relative static build**

`vite.config.js` uses `base:'./'`. `vite.preview.config.js` builds `src/preview/entry.js` as a stable classic IIFE file `dist/assets/preview-frame.js` with `emptyOutDir:false`; `public/preview-frame.html` loads that file with a classic `<script defer>` so it can run inside an opaque sandbox without module CORS.

The shell must render semantic placeholders for header, document rail, reading workspace, TOC rail, empty state, paste dialog, source dialog, mobile document Sheet, mobile TOC Sheet, and fixed mobile create button.

- [ ] **Step 6: Verify build and unit tests GREEN**

Run: `npm test` and `npm run build` from `preview/`.

Expected: both exit `0`; `dist/` contains only static assets and both HTML entries.

- [ ] **Step 7: Commit**

```bash
git add preview
git commit -m "feat(preview): scaffold secure static workspace"
```

---

### Task 2: Implement opaque sandbox protocol and safe renderer

**Files:**
- Create: `preview/src/protocol.js`
- Create: `preview/src/protocol.test.js`
- Create: `preview/src/preview/entry.js`
- Create: `preview/src/preview/render-markdown.js`
- Create: `preview/src/preview/render-markdown.test.js`
- Create: `preview/src/preview/preview.css`
- Create: `preview/playwright.config.js`
- Create: `preview/e2e/security.spec.js`

**Interfaces:**
- Shell produces `createPreviewChannel(iframe, handlers)` with `render`, `scrollTo`, and `requestSnapshot` methods.
- Preview accepts one `mkdp:preview-init` from `window.parent`, then communicates only through transferred `MessagePort`.

- [ ] **Step 1: Write protocol validation tests**

Test protocol version, token, maximum Markdown size, allowed message types, stale `renderId`, malformed TOC, and unknown fields. Validation returns `{ok:false,error}` rather than throwing into the global event loop.

- [ ] **Step 2: Write browser security tests before renderer implementation**

Playwright must paste payloads containing raw `<script>`, `<img onerror>`, injected image alt/title, `javascript:` links, `data:image/svg+xml`, Mermaid `click`, `foreignObject`, KaTeX trust commands, and forged `postMessage`. Assertions prove no marker executes, preview cannot read parent `localStorage`, and shell data remains unchanged.

- [ ] **Step 3: Run security tests and verify RED**

Run: `npm run test:e2e -- security.spec.js` from `preview/`.

Expected: FAIL because preview channel and renderer are not implemented.

- [ ] **Step 4: Implement one-time MessageChannel initialization**

Parent verifies the load event belongs to its iframe element, creates a random token and `MessageChannel`, then sends `{type:'mkdp:preview-init',version:1,token}` to `iframe.contentWindow` with target `'*'` and transfers `port2`. Preview accepts exactly one message where `event.source===window.parent`, validates shape, removes the global listener, stores the token, and starts `port.start()`.

- [ ] **Step 5: Implement safe Markdown renderer**

Create markdown-it with `html:false`, `linkify:true`, `typographer:true`. Override URL validation and image rendering so only approved schemes/data raster images survive. Highlight code with escaped highlight.js output. Render KaTeX with `trust:false`, `strict:'error'`, and expression size limits. Do not import legacy plugins.

Sanitize Markdown HTML with an explicit DOMPurify HTML allowlist. Render Mermaid nodes with immutable `securityLevel:'strict'`, `htmlLabels:false`, `startOnLoad:false`, `maxTextSize:50000`, and `maxEdges:500`; sanitize returned SVG with an SVG allowlist that forbids `foreignObject`, external URLs, styles containing `url()`, and event attributes.

- [ ] **Step 6: Implement render limits and accessible fallback**

Reject documents over 1 MiB, more than 20 Mermaid fences, or Mermaid source over 50 KiB. A Mermaid parse/limit error produces a localized alert plus escaped `<pre><code>` source and does not block the rest of the document.

- [ ] **Step 7: Verify GREEN**

Run: `npm test`, `npm run build`, and `npm run test:e2e -- security.spec.js`.

Expected: all pass; built `preview-frame.html` contains `sandbox` only on the parent iframe, and no security payload executes.

- [ ] **Step 8: Commit**

```bash
git add preview
git commit -m "feat(preview): add sandboxed safe markdown renderer"
```

---

### Task 3: Build the accepted desktop and mobile workflow

**Files:**
- Create: `preview/src/App.jsx`
- Create: `preview/src/components/AppHeader.jsx`
- Create: `preview/src/components/DocumentRail.jsx`
- Create: `preview/src/components/DocumentToolbar.jsx`
- Create: `preview/src/components/PasteDialog.jsx`
- Create: `preview/src/components/SourceDialog.jsx`
- Create: `preview/src/components/TocRail.jsx`
- Create: `preview/src/components/Sheet.jsx`
- Create: `preview/src/components/MermaidViewer.jsx`
- Modify: `preview/src/main.jsx`
- Modify: `preview/src/styles.css`
- Create: `preview/e2e/workflow.spec.js`
- Create: `preview/e2e/mobile.spec.js`

**Interfaces:**
- App consumes storage and preview channel interfaces from Tasks 1–2.
- Visible copy remains Chinese and matches the approved concepts.

- [ ] **Step 1: Write failing workflow E2E**

Cover empty state, paste creation, `.md` import with fatal UTF-8 decoding, second document creation without overwrite, switching, on-demand source edit, deletion, reload recovery, theme, TOC navigation, and `storage` event notification.

- [ ] **Step 2: Write failing mobile/accessibility E2E**

At `390x844`, verify document Sheet, TOC Sheet, fixed create button, source full-screen Sheet, focus trap, Escape, focus restoration, safe-area padding, reduced motion, and zero page-level horizontal overflow.

- [ ] **Step 3: Run workflow tests and verify RED**

Run: `npm run test:e2e -- workflow.spec.js mobile.spec.js`.

Expected: FAIL on missing interactions and responsive states.

- [ ] **Step 4: Implement state and dialogs**

Each paste calls `createDocument`; source editing updates only the active document after a 250ms debounce and flushes/cancels before switch/delete/close. File import uses `TextDecoder('utf-8',{fatal:true})`. Deletion requires confirmation. Clipboard denial falls back to focused manual paste.

- [ ] **Step 5: Implement exact visual system**

Use the approved colors and typography. Desktop grid is `260px minmax(0,1fr) 220px` at `>=1180px`; tablet uses document Drawer; mobile uses one reading column and Sheets. Article max width is 860px. The only signature motion is the 2px Render Blue “render line”; respect `prefers-reduced-motion`.

- [ ] **Step 6: Verify workflow GREEN**

Run: `npm test` and `npm run test:e2e -- workflow.spec.js mobile.spec.js`.

Expected: all pass at desktop and mobile viewports.

- [ ] **Step 7: Capture and inspect fidelity screenshots**

Capture `1536x1024` desktop, `390x844` reading, and `390x844` paste states. Compare them with the accepted concept images for copy, layout, typography, token colors, density, Mermaid treatment, container model, and mobile controls; fix all material drift.

- [ ] **Step 8: Commit**

```bash
git add preview
git commit -m "feat(preview): implement paste-first reading workspace"
```

---

### Task 4: Inert export and local static CLI

**Files:**
- Create: `preview/src/export.js`
- Create: `preview/src/export.test.js`
- Create: `preview/e2e/export-security.spec.js`
- Create: `scripts/lib/preview-static-server.js`
- Create: `scripts/mkdp-preview.js`
- Modify: `package.json`
- Create: `test/preview-static-server.test.js`
- Create: `packages/cli/lib/preview-static-server.js`
- Create: `packages/cli/lib/commands/preview.js`
- Modify: `packages/cli/bin/mkdp.js`
- Modify: `packages/cli/package.json`
- Modify: `scripts/mkdp-build-cli-package.js`
- Modify: `test/cli-package.test.js`

**Interfaces:**
- Export consumes a sanitized snapshot and produces an inert HTML Blob.
- `startPreviewStaticServer({port,assetRoot})` returns `{origin,url,close}`.

- [ ] **Step 1: Write failing export attack tests**

Assert exported HTML contains no script, event attribute, active embed, form, `foreignObject`, remote stylesheet, proxy URL, or viewer script. Reopen the downloaded file in Playwright and verify all XSS markers remain unset.

- [ ] **Step 2: Implement inert export**

Preview returns a sanitized snapshot through the private port. Parent validates size and sanitizes again, combines it with fixed local CSS, creates `Blob([html],{type:'text/html;charset=utf-8'})`, and triggers download. Remote images become links/placeholders; unsafe Mermaid falls back to source.

- [ ] **Step 3: Write failing static server tests**

Test default port `17329`, explicit port, loopback bind, Host rejection, capability path token, security headers, MIME types, traversal rejection, and 404 for `/_local_image_`, `/_mkdp_export_proxy`, `/_mkdp/browse`, `/socket.io`, and arbitrary fallback paths.

- [ ] **Step 4: Implement minimal static server and commands**

The server may only read files under the configured `preview/dist` realpath. It adds CSP, `nosniff`, referrer and permissions headers. `scripts/mkdp-preview.js` and packaged `mkdp paste` open the capability URL. Port conflicts fail with a clear message and never select a random port.

- [ ] **Step 5: Package static assets**

Extend `scripts/mkdp-build-cli-package.js` to copy `preview/dist` to `packages/cli/assets/preview` and verify both HTML entries exist. Do not copy or expose legacy Preview server code as part of the Markdown Preview command path.

- [ ] **Step 6: Verify GREEN**

Run from repo root:

```bash
node test/preview-static-server.test.js
node test/cli-package.test.js
```

Run from `preview/`:

```bash
npm test
npm run test:e2e -- export-security.spec.js
```

Expected: all exit `0`.

- [ ] **Step 7: Commit**

```bash
git add preview scripts package.json packages/cli test
git commit -m "feat(cli): serve secure static markdown preview"
```

---

### Task 5: Deployment docs, security regression, and final verification

**Files:**
- Create: `preview/deploy/nginx.conf.example`
- Create: `preview/deploy/_headers`
- Modify: `README.md`
- Modify: `README_zh.md`
- Modify: `docs/superpowers/specs/2026-07-15-markdown-preview-secure-static-design.md`
- Modify: `docs/superpowers/plans/2026-07-15-markdown-preview-secure-static.md`

- [ ] **Step 1: Add deployment configurations**

Document static-only Nginx/CDN hosting, CSP/security headers, HTTPS/HSTS, dedicated origin, and explicit negative routing so dynamic legacy endpoints never proxy to the old Node server.

- [ ] **Step 2: Document privacy and limitations**

Explain browser-local storage, clearing site data, 50-document/1-MiB limits, disabled raw HTML/remote images/PlantUML/legacy diagrams, safe Mermaid, and why Browser/Preview must remain local-only.

- [ ] **Step 3: Run dependency and build gates**

From `preview/`: `npm audit --audit-level=high`, `npm test`, `npm run build`, and the full Playwright suite.

Expected: no high/critical audit findings; all builds/tests pass.

- [ ] **Step 4: Run legacy regressions**

From repo root run existing Scratch, Browse, CLI, preview, and TypeScript build tests. Expected: all pass unchanged.

- [ ] **Step 5: Perform final security and visual review**

Verify opaque sandbox, private channel, static-route 404s, CSP, export reopening, localStorage isolation, light/dark themes, desktop/tablet/mobile screenshots, focus behavior, and concept fidelity. Record only intentional deviations; fix all other findings.

- [ ] **Step 6: Commit**

```bash
git add preview README.md README_zh.md docs
git commit -m "docs(preview): add secure static deployment guide"
```
