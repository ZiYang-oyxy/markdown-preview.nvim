# Compact Wider Markdown Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop Markdown preview wider and its typography more compact while preserving mobile readability and keeping exported HTML visually consistent.

**Architecture:** Adjust only the React preview shell CSS, iframe document CSS, and the inline export stylesheet. Add source-level regression assertions for the exact layout tokens, then verify the built UI in a real browser at desktop and mobile widths.

**Tech Stack:** React 19, Vite 8, Vitest 4, Playwright 1.59, CSS

## Global Constraints

- Desktop `document-toolbar` and `preview-container` maximum width is `1200px`.
- Markdown `#preview-root` maximum width is `1040px`.
- Desktop body typography is `16px / 1.6`; mobile body typography remains `16px`.
- Desktop headings are `h1` up to `44px`, `h2` `25px`, and `h3` `20px`.
- Preview and exported HTML use the same key typography and spacing values.
- Do not change component structure, rendering logic, themes, rails, or interactions.

---

### Task 1: Add layout-token regression coverage

**Files:**
- Create: `preview/src/compact-layout.test.js`
- Test: `preview/src/styles.css`
- Test: `preview/src/preview/preview.css`
- Test: `preview/src/export.js`

**Interfaces:**
- Consumes: CSS and export template source text.
- Produces: regression assertions for the agreed width and typography tokens.

- [ ] **Step 1: Write the failing test**

Create a Vitest test that reads all three source files and asserts: shell width `1200px`, preview root width `1040px`, body `16px / 1.6`, block margin `0.9em`, headings `44px`, `25px`, and `20px`, plus matching export values.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix preview test -- compact-layout.test.js`

Expected: FAIL because the current sources still contain `960px`, `860px`, and `17px / 1.76`.

- [ ] **Step 3: Commit the red test with the implementation task**

Keep the failing test uncommitted until Task 2 makes it green so the branch is never committed in a known-broken state.

### Task 2: Implement compact, wider preview styling

**Files:**
- Modify: `preview/src/styles.css`
- Modify: `preview/src/preview/preview.css`
- Modify: `preview/src/export.js`
- Modify: `preview/src/compact-layout.test.js`

**Interfaces:**
- Consumes: exact design tokens in Global Constraints.
- Produces: consistent browser preview and exported HTML styling.

- [ ] **Step 1: Expand the shell**

Set both `.document-toolbar` and `.preview-container` to `width: min(100%, 1200px)` without changing their narrow-viewport behavior.

- [ ] **Step 2: Compact the iframe document**

Set `#preview-root` to `width: min(100%, 1040px)`, desktop padding `48px clamp(24px, 4vw, 56px) 80px`, `font-size: 16px`, and `line-height: 1.6`. Set common block margins to `0.9em 0`, `h1` to `clamp(32px, 5vw, 44px)`, `h2` to `25px`, and `h3` to `20px`; proportionally reduce heading margins while retaining current colors and rules.

- [ ] **Step 3: Synchronize export styles**

Mirror the `1040px`, `16px / 1.6`, heading sizes, common block margins, and compact desktop padding in the export stylesheet string. Leave export-only card presentation intact.

- [ ] **Step 4: Run the focused test**

Run: `npm --prefix preview test -- compact-layout.test.js`

Expected: PASS.

- [ ] **Step 5: Commit implementation**

Run: `git add preview/src/styles.css preview/src/preview/preview.css preview/src/export.js preview/src/compact-layout.test.js docs/superpowers/plans/2026-07-16-compact-wider-preview.md && git commit -m "style(preview): compact and widen reading layout"`

### Task 3: Full automated and real-browser verification

**Files:**
- Verify: `preview/src/styles.css`
- Verify: `preview/src/preview/preview.css`
- Verify: `preview/src/export.js`

**Interfaces:**
- Consumes: built preview application.
- Produces: automated test results and computed-style/browser screenshots proving desktop and mobile behavior.

- [ ] **Step 1: Run the full test suite**

Run: `npm --prefix preview test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Build both Vite targets**

Run: `npm --prefix preview run build`

Expected: both the application and embedded preview builds complete successfully.

- [ ] **Step 3: Inspect desktop rendering**

Start the preview development server, open a representative Markdown document at a desktop viewport at least `1440px` wide, and verify computed widths, font size, line height, title hierarchy, overflow, and visual density.

- [ ] **Step 4: Inspect mobile rendering**

At a viewport no wider than `640px`, verify computed body font size remains `16px`, the document has no horizontal overflow, and headings remain legible.

- [ ] **Step 5: Record evidence and close**

Capture screenshots for desktop and mobile, inspect browser console errors, run `git status --short`, and report any unrelated pre-existing changes separately.
