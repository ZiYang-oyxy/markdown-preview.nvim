# Git History Sensitive Trace Cleanup Design

## Goal

Remove confirmed local-environment and organization-trace data from selected Git
history while preserving project behavior, current `master` content, unrelated
branches, tags, and known test/documentation fixtures.

## Scope

- Rewrite the affected history on `master` and one affected local backup branch.
- Replace only confirmed sensitive values with neutral placeholders.
- Keep test-only token fixtures and documented placeholder paths unchanged.
- Do not publish the local backup branch.
- Do not modify any untracked working-tree file.
- Do not store original sensitive values in tracked files, commit messages, logs,
  or long-lived Git refs.

## Safety Model

Before rewriting history, create a private Git bundle under the user's local
secret-guard configuration directory. The bundle contains the original affected
refs and is permission-restricted. Its location and restoration command are
reported after validation, but it is never added as a Git ref because retained
refs would keep the sensitive commits visible to all-ref scans.

Perform the rewrite in a disposable mirror under `/tmp`. The source repository
remains unchanged until the rewritten refs pass validation. Replacement input is
generated as a permission-restricted temporary file and removed after use.

## Rewrite Strategy

Use `git filter-repo --replace-text` with an explicit `--refs` set containing
only the affected primary and local backup branches. Exact sensitive values are
replaced with neutral placeholders; generic organization words are not globally
rewritten unless they are an exact confirmed finding.

This approach is preferred over deleting complete files because it preserves
historically useful documentation and build state. It is preferred over deleting
the backup branch because the branch may contain unrelated work worth retaining.

## Validation

The rewritten mirror must pass all of the following checks before local refs are
updated:

- The current `master` tree hash is identical to the pre-rewrite tree hash.
- The rewritten branches contain no `company-trace` findings.
- No confirmed local absolute path remains in the affected historical location.
- The only remaining findings match the four reviewed fixtures: two test-token
  findings and two documentation placeholder-path findings.
- No tag or unrelated branch SHA changes.
- Commit ancestry and branch tips remain connected and readable.

After importing the rewritten local refs, scan those refs explicitly and verify
that tracked and staged working-tree diffs remain empty. The old remote-tracking
ref remains reachable until remote publication; run the full-ref scan only after
the force-push is complete and a fetch confirms the new remote tip.

## Ref Update And Publication

Update local refs with compare-and-swap `git update-ref` operations using their
recorded old object IDs. Do not use `git reset --hard`; the current `master` tree
is unchanged, so the index and working tree remain valid. Do not update a ref if
its old object ID changed during the rewrite window.

Remote publication is intentionally separate. Codex will provide an exact
`git push --force-with-lease=<ref>:<old-object-id>` command after local validation,
but repository ownership policy requires the user to run the force-push. The
lease prevents overwriting remote work added after the rewrite started.

## Rollback And Coordination

Before remote publication, rollback uses the private bundle and compare-and-swap
ref updates. After publication, collaborators must re-clone or explicitly reset
their local branches to the rewritten history; merging an old clone can restore
the removed data. Hosting-provider caches, forks, and existing clones are outside
Git history rewrite guarantees and may require separate coordination.
