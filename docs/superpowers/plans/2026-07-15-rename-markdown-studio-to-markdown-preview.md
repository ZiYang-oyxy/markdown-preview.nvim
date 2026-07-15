# Markdown Preview Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the user-facing “Markdown Studio” product label to “Markdown Preview” without breaking the existing CLI command, browser storage, static asset paths, or iframe protocol.

**Architecture:** Treat this as a public naming and CLI-entry migration, not an internal namespace migration. Update visible product copy, expose `mkdp paste`, retain `mkdp studio` only as a warned compatibility alias, and keep the existing `studio/` implementation directory, `mkdp-studio:*` storage keys, `mkdp:studio-init` protocol message, static filenames, CSS classes, and JavaScript identifiers.

**Tech Stack:** React 19, Vite 8, Vitest 4, Playwright 1.59, Node.js CLI tests, Markdown documentation.

> **Approved CLI decision:** Expose `mkdp paste` as the primary command. Keep `mkdp studio` as a hidden compatibility alias with a rename warning; do not overload the existing file-oriented `mkdp preview [file|-]` command.

## Global Constraints

- The exact user-facing product name is `Markdown Preview`.
- Keep `mkdp preview [file|-]` as the existing file-preview command; do not introduce a second command with the same name.
- Expose `mkdp paste` as the primary CLI entry and hide `mkdp studio` from help while retaining it as a compatibility alias.
- Expose `npm run paste` as the primary repository script and retain `npm run studio` as a compatibility alias.
- Keep `studio/`, `studio-preview.html`, `assets/studio-preview.*`, `packages/cli/assets/studio/`, and internal `studio-*` filenames unchanged.
- Keep `mkdp-studio:*` localStorage keys unchanged so existing browser documents and preferences remain readable.
- Keep `mkdp:studio-init`, `MarkdownStudioPreview`, `createStudioStorage`, `startStudioStaticServer`, `.studio-shell`, and other internal identifiers unchanged.
- Preserve the existing uncommitted rail-collapse work in `studio/src/App.jsx`, `studio/src/components/DocumentRail.jsx`, `studio/src/components/TocRail.jsx`, and `studio/src/styles.css`; this rename must not revert or reformat it.
- Do not rewrite historical superseded specs/plans merely to erase the old name; add a rename note to the active secure-static spec and plan instead.

---

### Task 1: Lock the public naming contract with tests

**Files:**
- Modify: `studio/e2e/workflow.spec.js`
- Modify: `test/cli-package.test.js`

**Interfaces:**
- Consumes: the built page metadata, rendered header, and `mkdp --help` output.
- Produces: regression coverage requiring visible `Markdown Preview` copy while retaining the `studio` CLI command.

- [ ] **Step 1: Add browser assertions for the title, brand, and accessible home label**

In the initial-load test in `studio/e2e/workflow.spec.js`, add:

```js
await expect(page).toHaveTitle('Markdown Preview')
await expect(page.getByText('Markdown Preview', { exact: true })).toBeVisible()
await expect(page.getByRole('link', { name: 'Markdown Preview 首页' })).toBeVisible()
```

- [ ] **Step 2: Update the CLI help contract without renaming the command**

In `test/cli-package.test.js`, retain the assertion that the `studio` command exists and make its description require the new public name:

```js
assert.match(help.stdout, /studio\s+Open the independent paste-first Markdown Preview/)
assert.match(help.stdout, /preview \[file\|-\]\s+Preview a Markdown file in the browser/)
```

The second assertion explicitly guards against accidentally replacing the existing `preview` file command.

- [ ] **Step 3: Run the focused tests and verify they fail for old copy**

Run from the worktree root:

```bash
npm --prefix studio run build
npm --prefix studio run test:e2e -- workflow.spec.js
node test/cli-package.test.js
```

Expected: the new brand/title/help assertions fail because production copy still says `Markdown Studio`; unrelated existing tests continue to run normally.

- [ ] **Step 4: Commit the failing naming contract**

```bash
git add studio/e2e/workflow.spec.js test/cli-package.test.js
git commit -m "test(preview): define public product name"
```

---

### Task 2: Rename user-visible application and CLI copy

**Files:**
- Modify: `studio/index.html`
- Modify: `studio/src/components/AppHeader.jsx`
- Modify: `packages/cli/bin/mkdp.js`
- Modify: `packages/cli/lib/commands/studio.js`
- Modify: `scripts/mkdp-build-cli-package.js`
- Modify: `packages/cli/lib/studio-static-server.js`
- Modify: `test/studio-static-server.test.js`

**Interfaces:**
- Consumes: the public naming assertions from Task 1.
- Produces: browser metadata, visible brand, accessibility labels, CLI help/status/error text, and build diagnostics consistently naming the product `Markdown Preview`.

- [ ] **Step 1: Update browser metadata and the visible header**

In `studio/index.html`, replace only the title text:

```html
<title>Markdown Preview</title>
```

In `studio/src/components/AppHeader.jsx`, replace the brand link with:

```jsx
<a className="brand" href="./" aria-label="Markdown Preview 首页">
  <span className="brand-mark" aria-hidden="true">M</span>
  <span className="brand-name">Markdown Preview</span>
</a>
```

Do not rename `.brand`, `.brand-mark`, `.brand-name`, or any `studio-*` CSS class.

- [ ] **Step 2: Update CLI-facing descriptions and runtime messages**

In `packages/cli/bin/mkdp.js`, change only the `studio` description to:

```js
'  studio             Open the independent paste-first Markdown Preview',
```

In `packages/cli/lib/commands/studio.js`, change the runtime status line to:

```js
process.stderr.write('Markdown Preview is running on loopback only; press Ctrl+C to stop\n')
```

Use `Usage: mkdp paste [options]`; the hidden `studio` alias prints the same usage after its rename warning.

- [ ] **Step 3: Update user-facing build and server diagnostics**

Change diagnostic labels such as `Studio dist assets`, `Studio assets do not exist`, and test fixture display text such as `Studio shell` to `Markdown Preview dist assets`, `Markdown Preview assets do not exist`, and `Markdown Preview shell`. Do not rename functions, variables, paths, or fixture filenames.

- [ ] **Step 4: Run focused unit, build, CLI, and static-server verification**

Run from the worktree root:

```bash
npm --prefix studio run build
npm --prefix studio run test:e2e -- workflow.spec.js
node test/studio-static-server.test.js
node test/cli-package.test.js
```

Expected: all commands exit `0`; the page title and header say `Markdown Preview`; help still exposes both `preview [file|-]` and `studio` with distinct purposes.

- [ ] **Step 5: Inspect the diff for accidental namespace changes**

Run:

```bash
git diff --check
git diff -- studio/index.html studio/src/components/AppHeader.jsx packages/cli/bin/mkdp.js packages/cli/lib/commands/studio.js scripts/mkdp-build-cli-package.js packages/cli/lib/studio-static-server.js test/studio-static-server.test.js
```

Expected: no whitespace errors; changes are limited to visible strings and their assertions. There must be no changes to `mkdp-studio:*`, `mkdp:studio-init`, `studio-preview.*`, or internal exported identifiers.

- [ ] **Step 6: Commit the public-copy rename**

```bash
git add studio/index.html studio/src/components/AppHeader.jsx packages/cli/bin/mkdp.js packages/cli/lib/commands/studio.js scripts/mkdp-build-cli-package.js packages/cli/lib/studio-static-server.js test/studio-static-server.test.js
git commit -m "refactor(preview): rename public studio branding"
```

---

### Task 3: Align current documentation and acceptance material

**Files:**
- Modify: `README.md`
- Modify: `README_zh.md`
- Modify: `studio/README.md`
- Modify: `studio/acceptance/README.md`
- Modify: `studio/acceptance/REPORT.md`
- Modify: `studio/acceptance/acceptance.py`
- Modify: `docs/superpowers/specs/2026-07-15-markdown-studio-secure-static-design.md`
- Modify: `docs/superpowers/plans/2026-07-15-markdown-studio-secure-static.md`

**Interfaces:**
- Consumes: the compatibility boundary established in Tasks 1–2.
- Produces: current user and maintainer documentation that says `Markdown Preview` while accurately documenting legacy/internal `studio` names.

- [ ] **Step 1: Rename prose headings and product references**

Use `Markdown Preview` in current headings, introductions, deployment guidance, acceptance descriptions, and generated acceptance text. Preserve literal commands and paths in code spans, including:

```text
npm install --prefix studio
npm run build-studio
npm run paste
mkdp paste
studio/dist/
studio-preview.html
mkdp-studio:*
```

When prose must explain one of those identifiers, use wording such as “Markdown Preview 的内部 `studio/` 构建目录” rather than renaming the literal identifier.

- [ ] **Step 2: Record the naming decision in the active secure-static spec**

Near the beginning of `docs/superpowers/specs/2026-07-15-markdown-studio-secure-static-design.md`, add:

```markdown
> **命名说明（2026-07-15）**：用户可见产品名改为 **Markdown Preview**，主 CLI 入口为 `mkdp paste`。为保持兼容，`mkdp studio` 暂留为隐藏别名；内部 `studio` 命名、`mkdp-studio:*` 与 `mkdp:studio-init` 暂不迁移。
```

Update subsequent current-state prose to call the product Markdown Preview, but leave protocol examples, key tables, path examples, and identifier names literal.

- [ ] **Step 3: Mark the active implementation plan with the same compatibility note**

Near the top of `docs/superpowers/plans/2026-07-15-markdown-studio-secure-static.md`, add:

```markdown
> **Naming update:** The shipped user-facing name is **Markdown Preview**. Historical task text retains internal `studio` identifiers because those paths, commands, storage keys, and protocol names remain compatible implementation details.
```

Do not mechanically rewrite the superseded `2026-07-15-markdown-studio.md` plan or the superseded design spec; they are historical records.

- [ ] **Step 4: Search for stale user-visible branding and classify every remaining match**

Run from the worktree root:

```bash
rg -n "Markdown Studio|独立 Markdown Studio" README.md README_zh.md studio packages scripts test docs/superpowers/specs/2026-07-15-markdown-studio-secure-static-design.md docs/superpowers/plans/2026-07-15-markdown-studio-secure-static.md --glob '!studio/node_modules/**' --glob '!studio/dist/**' --glob '!studio/package-lock.json'
```

Expected: no current user-visible product copy remains. Any retained match must be either a historical quote/reference or an explicit compatibility explanation; review it manually rather than globally replacing it.

- [ ] **Step 5: Validate commands shown in documentation**

Run:

```bash
node packages/cli/bin/mkdp.js --help
npm run paste -- --help
```

Expected: both exit `0`; documentation still uses real commands, and help describes `studio` as opening Markdown Preview.

- [ ] **Step 6: Commit documentation and acceptance-copy changes**

```bash
git add README.md README_zh.md studio/README.md studio/acceptance/README.md studio/acceptance/REPORT.md studio/acceptance/acceptance.py docs/superpowers/specs/2026-07-15-markdown-studio-secure-static-design.md docs/superpowers/plans/2026-07-15-markdown-studio-secure-static.md
git commit -m "docs(preview): align product naming"
```

---

### Task 4: Run full regression and compatibility verification

**Files:**
- Verify only; modify a test or production file only if the corresponding suite exposes a rename regression.

**Interfaces:**
- Consumes: all changes from Tasks 1–3.
- Produces: evidence that the rename did not change rendering, storage, sandbox security, export behavior, mobile behavior, packaging, or the existing preview command.

- [ ] **Step 1: Run the full Studio unit suite and production build**

```bash
npm --prefix studio test
npm --prefix studio run build
```

Expected: both exit `0` and `studio/dist/index.html` contains `<title>Markdown Preview</title>`.

- [ ] **Step 2: Run the full browser suite**

```bash
npm --prefix studio run test:e2e
```

Expected: all Playwright tests pass, including workflow, mobile, security, resilience, and export-security coverage.

- [ ] **Step 3: Run root server and packaged CLI tests**

```bash
node test/studio-static-server.test.js
node test/cli-package.test.js
```

Expected: both exit `0`; packaged assets remain under `assets/studio`, and both CLI commands retain their original routing.

- [ ] **Step 4: Verify compatibility identifiers are unchanged**

```bash
rg -n "mkdp-studio:index:v1|mkdp-studio:preferences:v1|mkdp-studio:document:|mkdp:studio-init|studio-preview\.html" studio/src studio/public studio/e2e
node packages/cli/bin/mkdp.js preview --help
node packages/cli/bin/mkdp.js studio --help
```

Expected: the storage keys, protocol message, and iframe filename still exist; both commands print their distinct usage and exit `0`.

- [ ] **Step 5: Perform final repository checks**

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. The pre-existing uncommitted rail-collapse files remain intact unless they were separately committed by their owner; rename work contains no generated `studio/dist/`, `node_modules`, Playwright report, or test-result artifacts.

- [ ] **Step 6: Commit any test-only correction discovered by the full regression**

Only if a rename-specific correction was required, stage the concrete files shown by `git status --short` and commit them:

```bash
git add studio/e2e/workflow.spec.js test/cli-package.test.js
git commit -m "test(preview): complete rename regression coverage"
```

If all suites pass without further changes, do not create an empty commit.
