# Page Index Side Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the desktop side rails' empty collapsed strips with zero-width rails and semantic page-index restore handles.

**Architecture:** Keep the existing `railsCollapsed` state and preference persistence in `App.jsx`. Render rail content only while expanded and render independent restore buttons inside `reading-workspace` while collapsed; CSS owns the zero-width grid transition, edge placement, responsive visibility, and reduced-motion behavior.

**Tech Stack:** React 19, CSS Grid, Vitest static/component source assertions, Vite, Playwright for local visual verification.

## Global Constraints

- Desktop collapsed rail width is exactly `0`, with no residual background or divider.
- Existing mobile Sheet behavior and preference storage schema remain unchanged.
- Visible restore labels are exactly `文档` and `目录`.
- Existing `960px` maximum reading width remains unchanged.
- Reduced-motion users receive no rail or handle animation.

---

### Task 1: Lock the semantic rail contract with tests

**Files:**
- Create: `preview/src/side-rails.test.js`
- Modify: none
- Test: `preview/src/side-rails.test.js`

**Interfaces:**
- Consumes: source files `App.jsx`, `DocumentRail.jsx`, `TocRail.jsx`, and `styles.css`.
- Produces: regression assertions for semantic handles, header-integrated controls, zero-width rails, responsive behavior, and reduced motion.

- [ ] **Step 1: Write the failing source-contract tests**

  Read the four source files and assert that `App.jsx` renders `rail-restore-handle` buttons with `文档` and `目录`, each component uses `rail-heading` for its collapse button, and CSS sets both collapsed custom widths to `0px`, styles left/right handles, hides them at the mobile breakpoint, and disables transitions for reduced motion.

- [ ] **Step 2: Run the focused test to verify RED**

  Run: `cd preview && npm test -- side-rails.test.js`

  Expected: FAIL because the restore handles do not exist and collapsed widths are `40px`.

### Task 2: Implement the book-page-index rail behavior

**Files:**
- Modify: `preview/src/App.jsx`
- Modify: `preview/src/components/DocumentRail.jsx`
- Modify: `preview/src/components/TocRail.jsx`
- Modify: `preview/src/styles.css`
- Test: `preview/src/side-rails.test.js`

**Interfaces:**
- Consumes: `railsCollapsed`, `toggleRail(key)`, and the existing rail component props.
- Produces: `.rail-restore-handle--documents`, `.rail-restore-handle--toc`, `.rail-collapse-button`, and zero-width collapsed Grid columns.

- [ ] **Step 1: Render semantic restore handles in the reading workspace**

  Add one button per collapsed rail with its visible label, decorative icon, `aria-expanded="false"`, matching expand label, and `toggleRail` callback.

- [ ] **Step 2: Move collapse actions into each rail heading**

  Keep `DocumentRail` content conditional and add a `rail-heading` title row to `TocRail`; use a shared `rail-collapse-button` class and explicit icon/text semantics.

- [ ] **Step 3: Replace residual rail layout with zero-width transitions**

  Change collapsed custom widths to `0px`, remove padding/border/background from collapsed rails, clip their contents, and position page-index handles at the reading workspace's left and right edges without affecting layout.

- [ ] **Step 4: Add responsive and motion safeguards**

  Hide restore handles wherever desktop rails are hidden and disable Grid/handle transitions under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Run focused tests to verify GREEN**

  Run: `cd preview && npm test -- side-rails.test.js`

  Expected: PASS with all side rail assertions green.

### Task 3: Verify the rendered experience and regressions

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: the completed desktop UI.
- Produces: build/test evidence and screenshots for expanded, mixed, and collapsed states.

- [ ] **Step 1: Run unit and build verification**

  Run: `cd preview && npm test && npm run build`

  Expected: all Vitest tests pass and both Vite builds exit `0`.

- [ ] **Step 2: Start the local app and inspect desktop interactions**

  Run: `cd preview && npm run dev -- --host 127.0.0.1`

  Verify at desktop width that each collapse action removes its Grid column, each edge handle restores the correct rail, focus styling remains visible, and the article stays at its readable maximum width.

- [ ] **Step 3: Inspect narrow and reduced-motion states**

  Verify below `1180px` that desktop handles are absent and mobile Sheets still open; emulate reduced motion and verify layout changes without animation.

- [ ] **Step 4: Review the final diff and commit**

  Stage only the spec, plan, implementation, and focused test. Commit with `feat(preview): redesign collapsible side rails` after checking staged diff for unrelated changes or secrets.
