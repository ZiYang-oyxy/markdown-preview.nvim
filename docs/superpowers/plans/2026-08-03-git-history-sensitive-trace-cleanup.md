# Git History Sensitive Trace Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove confirmed organization and local-environment traces from the affected Git history and current documentation while changing no unrelated current content.

**Architecture:** Create a permission-restricted rollback bundle and a two-branch bare clone outside the repository. Extract only reviewed findings into an ephemeral `git filter-repo` replacement stream, validate the rewritten object graph, atomically update local refs, and leave remote force-push to the repository owner.

**Tech Stack:** Git, `git-filter-repo`, `gitleaks 8.x`, Bash, `jq`

## Global Constraints

- Never print or add a confirmed sensitive value to a tracked file, commit message, or long-lived Git ref.
- Rewrite only `master` and the single local branch containing commit `b59eb46434057163edf366c4e6267903c16415a6`.
- Preserve the two reviewed test-token findings and two reviewed README placeholder-path findings.
- Change current `master` content only at `preview/acceptance/README.md`, replacing the confirmed sensitive value with a neutral placeholder.
- Preserve every unrelated local branch, remote-tracking ref, tag, linked worktree, and untracked file.
- Never run `git reset --hard` or push the local backup branch.
- Codex must not force-push `master`; it prints a lease-protected command for the repository owner.
- Stop immediately if any ref changes between baseline capture and compare-and-swap update.

---

### Task 1: Capture Baseline And Private Rollback Bundle

**Files:**
- Create privately: `${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/run.*/pre-rewrite.bundle`
- Create privately: `${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup` (temporary symlink)
- Modify tracked files: none

**Interfaces:**
- Consumes: the current repository, installed `gitleaks`, `jq`, and `git-filter-repo`
- Produces: `RUN_ROOT`, a verified rollback bundle, and immutable old ref object IDs

- [ ] **Step 1: Verify tools and tracked working-tree state**

Run:

```bash
command -v gitleaks
command -v jq
command -v git-filter-repo
git diff --exit-code
git diff --cached --exit-code
git status --porcelain=v1
```

Expected: all tools resolve and both diff commands exit `0`. Record any
untracked status entries exactly; later checks must preserve them unchanged.

- [ ] **Step 2: Resolve the affected refs without recording the backup branch name**

Run in Bash:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
MASTER_REF="refs/heads/master"
BACKUP_REF="$(git for-each-ref --format='%(refname)' --contains b59eb46434057163edf366c4e6267903c16415a6 refs/heads)"
test "$(printf '%s\n' "$BACKUP_REF" | wc -l | tr -d ' ')" = "1"
git merge-base --is-ancestor 3edcac656fb0d9f7b72ce8a492e8a6c73b9901db "$MASTER_REF"
git show-ref --verify --quiet refs/remotes/origin/master
```

Expected: exactly one local branch contains the backup-only finding; the primary finding is an ancestor of `master`; `origin/master` exists.

- [ ] **Step 3: Create a private run directory and rollback bundle**

Run in Bash:

```bash
PRIVATE_BACKUP_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups"
RUN_LINK="$PRIVATE_BACKUP_ROOT/current-markdown-preview-cleanup"
install -d -m 700 "$PRIVATE_BACKUP_ROOT"
test ! -e "$RUN_LINK"
test ! -L "$RUN_LINK"
RUN_ROOT="$(mktemp -d "$PRIVATE_BACKUP_ROOT/run.XXXXXX")"
chmod 700 "$RUN_ROOT"
ln -s "$RUN_ROOT" "$RUN_LINK"
git bundle create "$RUN_ROOT/pre-rewrite.bundle" "$MASTER_REF" "$BACKUP_REF"
chmod 600 "$RUN_ROOT/pre-rewrite.bundle"
git bundle verify "$RUN_ROOT/pre-rewrite.bundle"
```

Expected: bundle verification lists both affected heads and exits `0`.

- [ ] **Step 4: Record baseline evidence in command output**

Run:

```bash
git rev-parse refs/heads/master refs/remotes/origin/master
git rev-parse refs/heads/master^{tree}
git bundle list-heads "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup/pre-rewrite.bundle"
git for-each-ref --format='%(refname) %(objectname)' refs/heads refs/remotes refs/tags
```

Expected: both object IDs and the local tree ID are recorded. Local `master` is
ahead because it includes the approved design and plan commits; retain all output
for compare-and-swap validation.

### Task 2: Build The Isolated Two-Ref Rewrite Input

**Files:**
- Create privately: `$RUN_ROOT/rewrite.git/`
- Create temporarily: `$RUN_ROOT/findings.json` with mode `0600`
- Modify tracked files: none

**Interfaces:**
- Consumes: `RUN_ROOT` from Task 1 and the source repository's installed gitleaks configuration
- Produces: a bare repository containing only the affected heads and an unredacted, private findings report

- [ ] **Step 1: Rehydrate paths and affected refs**

Run in Bash:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
PRIVATE_BACKUP_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups"
RUN_ROOT="$(readlink "$PRIVATE_BACKUP_ROOT/current-markdown-preview-cleanup")"
MASTER_REF="refs/heads/master"
BACKUP_REF="$(git for-each-ref --format='%(refname)' --contains b59eb46434057163edf366c4e6267903c16415a6 refs/heads)"
REWRITE_GIT="$RUN_ROOT/rewrite.git"
CFG="$REPO_ROOT/.git/secret-guard/gitleaks.toml"
test -f "$RUN_ROOT/pre-rewrite.bundle"
test -f "$CFG"
```

Expected: all paths and both affected refs resolve without printing sensitive finding values.

- [ ] **Step 2: Clone only `master`, then fetch only the affected local branch**

Run:

```bash
git clone --bare --no-local --no-tags --single-branch --branch master "$REPO_ROOT" "$REWRITE_GIT"
git -C "$REWRITE_GIT" fetch "$REPO_ROOT" "$BACKUP_REF:$BACKUP_REF"
git -C "$REWRITE_GIT" for-each-ref --format='%(refname)' refs/heads refs/tags
```

Expected: exactly two local heads and no tag are present; no unrelated branch is imported.

- [ ] **Step 3: Generate the unredacted report privately**

Run in Bash:

```bash
umask 077
gitleaks git "$REWRITE_GIT" --config "$CFG" --no-banner --exit-code 0 --report-format json --report-path "$RUN_ROOT/findings.json"
chmod 600 "$RUN_ROOT/findings.json"
jq 'length' "$RUN_ROOT/findings.json"
```

Expected: the scan reports `87` findings and no secret value is written to stdout.

- [ ] **Step 4: Validate the replacement selection without displaying values**

Run:

```bash
jq -e '
  [.[] | select(
    .RuleID == "company-trace" or
    (.RuleID == "abs-path" and .File == "studio/acceptance/README.md")
  )] as $selected |
  ($selected | length) == 83 and
  ($selected | all(.Secret | length > 0)) and
  ($selected | all(.Secret | ((contains("\n") or contains("\r") or contains("==>")) | not)))
' "$RUN_ROOT/findings.json"
```

Expected: `true` and exit `0`; selection is 82 organization-trace findings plus the one reviewed historical absolute path.

### Task 3: Rewrite The Two Affected Refs

**Files:**
- Modify privately: `$RUN_ROOT/rewrite.git/`
- Delete immediately after use: `$RUN_ROOT/findings.json`
- Modify tracked files: none

**Interfaces:**
- Consumes: the validated private report and isolated bare repository from Task 2
- Produces: rewritten `master` and backup refs plus `filter-repo/commit-map`

- [ ] **Step 1: Run the exact-value rewrite**

Run in Bash:

```bash
PRIVATE_BACKUP_ROOT="${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups"
RUN_ROOT="$(readlink "$PRIVATE_BACKUP_ROOT/current-markdown-preview-cleanup")"
REWRITE_GIT="$RUN_ROOT/rewrite.git"
MASTER_REF="refs/heads/master"
BACKUP_REF="$(git -C "$REWRITE_GIT" for-each-ref --format='%(refname)' --contains b59eb46434057163edf366c4e6267903c16415a6 refs/heads)"
git -C "$REWRITE_GIT" filter-repo --force \
  --replace-text <(jq -r '
    .[] | select(
      .RuleID == "company-trace" or
      (.RuleID == "abs-path" and .File == "studio/acceptance/README.md")
    ) | .Secret | select(length > 0) | . + "==>[REDACTED_LOCAL_VALUE]"
  ' "$RUN_ROOT/findings.json" | sort -u) \
  --refs "$MASTER_REF" "$BACKUP_REF"
```

Expected: `git filter-repo` rewrites only the two named heads and creates a commit map.

- [ ] **Step 2: Remove the unredacted intermediate immediately**

Run:

```bash
unlink "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup/findings.json"
test ! -e "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup/findings.json"
```

Expected: the unredacted JSON no longer exists. The permission-restricted rollback bundle remains intentionally available.

- [ ] **Step 3: Verify object-graph integrity**

Run:

```bash
RUN_ROOT="$(readlink "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup")"
git -C "$RUN_ROOT/rewrite.git" fsck --full
test -s "$RUN_ROOT/rewrite.git/filter-repo/commit-map"
```

Expected: `git fsck` exits `0`; the commit map is non-empty.

### Task 4: Import And Validate The Rewritten Mirror

**Files:**
- Create privately: `$RUN_ROOT/rewritten-redacted.json`
- Modify tracked files: none

**Interfaces:**
- Consumes: rewritten refs from Task 3 and the source repository's gitleaks configuration
- Produces: imported rewritten objects and exact evidence that only the reviewed current path changes and four reviewed fixtures remain

- [ ] **Step 1: Import rewritten objects without creating or updating refs**

Run in Bash:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
RUN_ROOT="$(readlink "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup")"
REWRITE_GIT="$RUN_ROOT/rewrite.git"
MASTER_REF="refs/heads/master"
BACKUP_REF="$(git -C "$REWRITE_GIT" for-each-ref --format='%(refname)' refs/heads | awk '$0 != "refs/heads/master"')"
NEW_MASTER="$(git -C "$REWRITE_GIT" rev-parse "$MASTER_REF")"
NEW_BACKUP="$(git -C "$REWRITE_GIT" rev-parse "$BACKUP_REF")"
git fetch-pack --no-progress "$REWRITE_GIT" "$MASTER_REF" "$BACKUP_REF"
git cat-file -e "$NEW_MASTER^{commit}"
git cat-file -e "$NEW_BACKUP^{commit}"
```

Expected: both rewritten commits exist in the source object database, while all
source refs remain at their Task 1 baseline OIDs.

- [ ] **Step 2: Prove the exact current endpoint delta**

Run in Bash:

```bash
RUN_ROOT="$(readlink "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup")"
BUNDLE="$RUN_ROOT/pre-rewrite.bundle"
OLD_MASTER="$(git bundle list-heads "$BUNDLE" refs/heads/master | awk '{print $1}')"
NEW_MASTER="$(git -C "$RUN_ROOT/rewrite.git" rev-parse refs/heads/master)"
test "$(git diff --name-status "$OLD_MASTER" "$NEW_MASTER")" = $'M\tpreview/acceptance/README.md'
```

Expected: the endpoint tree changes exactly one existing documentation file and
no other current content.

- [ ] **Step 3: Scan all refs in the isolated two-head repository**

Run in Bash:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
RUN_ROOT="$(readlink "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup")"
gitleaks git "$RUN_ROOT/rewrite.git" --config "$REPO_ROOT/.git/secret-guard/gitleaks.toml" --no-banner --redact=100 --exit-code 0 --report-format json --report-path "$RUN_ROOT/rewritten-redacted.json"
```

Expected: scan completes and writes a fully redacted report.

- [ ] **Step 4: Assert the exact remaining finding set**

Run:

```bash
jq -e '
  length == 4 and
  ([.[] | select(.RuleID == "company-trace")] | length == 0) and
  ([.[] | select(.RuleID == "abs-path" and .File == "README.md")] | length == 2) and
  ([.[] | select(.RuleID == "generic-api-key" and .File == "studio/e2e/security.spec.js")] | length == 1) and
  ([.[] | select(.RuleID == "generic-api-key" and .File == "studio/src/protocol.test.js")] | length == 1)
' "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup/rewritten-redacted.json"
```

Expected: `true` and exit `0`.

- [ ] **Step 5: Verify no unrelated source ref changed**

Run:

```bash
git for-each-ref --format='%(refname) %(objectname)' refs/heads refs/remotes refs/tags
git status --porcelain=v1
```

Expected: source refs still match Task 1 evidence and status matches the
untracked baseline recorded in Task 1.

### Task 5: Atomically Update The Rewritten Local Refs

**Files:**
- Modify: source repository `refs/heads/master`
- Modify: the single affected local backup ref
- Modify in worktree: `preview/acceptance/README.md` only
- Preserve: all other tracked, staged, untracked, remote-tracking, tag, and linked-worktree state

**Interfaces:**
- Consumes: verified rewritten objects, rollback bundle, and current source refs
- Produces: atomically updated local refs with the old remote-tracking ref intentionally untouched

- [ ] **Step 1: Derive old and new object IDs from authoritative stores**

Run in Bash:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
RUN_ROOT="$(readlink "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup")"
BUNDLE="$RUN_ROOT/pre-rewrite.bundle"
MASTER_REF="refs/heads/master"
BACKUP_REF="$(git for-each-ref --format='%(refname)' --contains b59eb46434057163edf366c4e6267903c16415a6 refs/heads)"
OLD_MASTER="$(git bundle list-heads "$BUNDLE" "$MASTER_REF" | awk '{print $1}')"
OLD_BACKUP="$(git bundle list-heads "$BUNDLE" "$BACKUP_REF" | awk '{print $1}')"
NEW_MASTER="$(git -C "$RUN_ROOT/rewrite.git" rev-parse "$MASTER_REF")"
NEW_BACKUP="$(git -C "$RUN_ROOT/rewrite.git" rev-parse "$BACKUP_REF")"
test "$(git rev-parse "$MASTER_REF")" = "$OLD_MASTER"
test "$(git rev-parse "$BACKUP_REF")" = "$OLD_BACKUP"
```

Expected: both compare checks exit `0`; otherwise stop without updating either ref.

- [ ] **Step 2: Update both refs in one Git reference transaction**

Run in Bash:

```bash
printf 'start\nupdate %s %s %s\nupdate %s %s %s\nprepare\ncommit\n' \
  "$MASTER_REF" "$NEW_MASTER" "$OLD_MASTER" \
  "$BACKUP_REF" "$NEW_BACKUP" "$OLD_BACKUP" |
  git update-ref --stdin
```

Expected: transaction reports `start: ok`, `prepare: ok`, and `commit: ok`.

- [ ] **Step 3: Synchronize only the approved sanitized current file**

Run:

```bash
git restore --source=HEAD --staged --worktree -- preview/acceptance/README.md
git diff --exit-code
git diff --cached --exit-code
git status --porcelain=v1
```

Expected: the approved file matches sanitized `HEAD`, tracked and staged diffs
are empty, and all untracked baseline entries remain untouched. Branch status
may show divergence from `origin/master` until publication.

- [ ] **Step 4: Scan each rewritten local branch explicitly**

Run in Bash:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
RUN_ROOT="$(readlink "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup")"
CFG="$REPO_ROOT/.git/secret-guard/gitleaks.toml"
BACKUP_REF="$(git -C "$RUN_ROOT/rewrite.git" for-each-ref --format='%(refname)' refs/heads | awk '$0 != "refs/heads/master"')"
BACKUP_BRANCH="${BACKUP_REF#refs/heads/}"
gitleaks git "$REPO_ROOT" --config "$CFG" --log-opts=master --no-banner --redact=100 --exit-code 0 --report-format json --report-path "$RUN_ROOT/local-master-redacted.json"
gitleaks git "$REPO_ROOT" --config "$CFG" --log-opts="$BACKUP_BRANCH" --no-banner --redact=100 --exit-code 0 --report-format json --report-path "$RUN_ROOT/local-backup-redacted.json"
jq -e '
  length == 4 and
  ([.[] | select(.RuleID == "company-trace")] | length == 0)
' "$RUN_ROOT/local-master-redacted.json"
jq -e '
  [.[] | select(.RuleID == "company-trace")] | length == 0
' "$RUN_ROOT/local-backup-redacted.json"
```

Expected: both assertions return `true`; `master` contains exactly the four
reviewed fixtures and the local backup branch contains no organization-trace
finding.

### Task 6: Prepare Owner-Controlled Remote Publication

**Files:**
- Modify remotely, by user only: `refs/heads/master`
- Modify after publication: local `refs/remotes/origin/master` via fetch
- Modify tracked files: none

**Interfaces:**
- Consumes: rewritten local master and unchanged old remote-tracking object ID
- Produces: an exact lease-protected command, then final full-ref verification after user publication

- [ ] **Step 1: Confirm the remote has not moved**

Run in Bash:

```bash
OLD_REMOTE_MASTER="$(git rev-parse refs/remotes/origin/master)"
REMOTE_MASTER="$(git ls-remote origin refs/heads/master | awk '{print $1}')"
test "$REMOTE_MASTER" = "$OLD_REMOTE_MASTER"
```

Expected: comparison exits `0`. If it fails, stop and re-plan against the new remote tip.

- [ ] **Step 2: Print the exact command for the repository owner**

Run:

```bash
NEW_MASTER="$(git rev-parse refs/heads/master)"
OLD_REMOTE_MASTER="$(git rev-parse refs/remotes/origin/master)"
printf 'git push origin %s:refs/heads/master --force-with-lease=refs/heads/master:%s\n' "$NEW_MASTER" "$OLD_REMOTE_MASTER"
```

Expected: one fully resolved `git push` command. Codex stops and asks the user to run it; Codex does not execute it.

- [ ] **Step 3: After user confirmation, fetch and verify the published tip**

Run:

```bash
git fetch origin master
test "$(git rev-parse refs/heads/master)" = "$(git rev-parse refs/remotes/origin/master)"
```

Expected: fetch succeeds and both object IDs match.

- [ ] **Step 4: Run final all-ref security and repository checks**

Run in Bash:

```bash
RUN_ROOT="$(readlink "${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup")"
gitleaks git "$(git rev-parse --show-toplevel)" --config "$(git rev-parse --git-dir)/secret-guard/gitleaks.toml" --no-banner --redact=100 --exit-code 0 --report-format json --report-path "$RUN_ROOT/final-redacted.json"
jq -e '
  length == 4 and
  ([.[] | select(.RuleID == "company-trace")] | length == 0)
' "$RUN_ROOT/final-redacted.json"
git fsck --full
git diff --exit-code
git diff --cached --exit-code
```

Expected: final report contains only four reviewed fixtures, no organization-trace finding, repository integrity passes, and tracked/staged diffs remain empty.

- [ ] **Step 5: Close the active-run marker and report recovery instructions**

Run:

```bash
RUN_LINK="${XDG_CONFIG_HOME:-$HOME/.config}/secret-guard/history-backups/current-markdown-preview-cleanup"
RUN_ROOT="$(readlink "$RUN_LINK")"
unlink "$RUN_LINK"
test -f "$RUN_ROOT/pre-rewrite.bundle"
```

Expected: the temporary symlink is gone; the private rollback bundle remains
available at the resolved `RUN_ROOT` path. Report that path together with this
pre-publication rollback script, substituting no literal ref names or object IDs:

```bash
BUNDLE="$RUN_ROOT/pre-rewrite.bundle"
MASTER_REF="refs/heads/master"
BACKUP_REF="$(git -C "$RUN_ROOT/rewrite.git" for-each-ref --format='%(refname)' refs/heads | awk '$0 != "refs/heads/master"')"
OLD_MASTER="$(git bundle list-heads "$BUNDLE" "$MASTER_REF" | awk '{print $1}')"
OLD_BACKUP="$(git bundle list-heads "$BUNDLE" "$BACKUP_REF" | awk '{print $1}')"
CURRENT_MASTER="$(git rev-parse "$MASTER_REF")"
CURRENT_BACKUP="$(git rev-parse "$BACKUP_REF")"
printf 'start\nupdate %s %s %s\nupdate %s %s %s\nprepare\ncommit\n' \
  "$MASTER_REF" "$OLD_MASTER" "$CURRENT_MASTER" \
  "$BACKUP_REF" "$OLD_BACKUP" "$CURRENT_BACKUP" |
  git update-ref --stdin
git restore --source=HEAD --staged --worktree -- preview/acceptance/README.md
```

Do not run the rollback after remote publication without coordinating a second
history rewrite, because doing so would restore the removed data to local refs.
