# Git History Sensitive Trace Cleanup Design

## Goal

Remove confirmed local-environment and organization-trace data from selected Git
history and the current affected documentation line while preserving project
behavior, unrelated current content, branches, tags, and reviewed fixtures.

## Scope

- Rewrite the affected history on `master` and one affected local backup branch.
- Replace only confirmed sensitive values with neutral placeholders.
- Sanitize the same confirmed value in the current affected documentation file.
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

Perform the rewrite in a permission-restricted private bare clone containing no
tags and only the two affected heads. The source refs remain unchanged until the
rewritten heads pass validation. Replacement input is generated as a private
temporary file and removed immediately after use.

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

- The current `master` endpoint differs only in the reviewed documentation file.
- The rewritten branches contain no `company-trace` findings.
- No confirmed local absolute path remains in the affected historical location.
- The only remaining findings match the four reviewed fixtures: two test-token
  findings and two documentation placeholder-path findings.
- No tag or unrelated branch SHA changes.
- Commit ancestry and branch tips remain connected and readable.

After importing the rewritten objects, compare the old and new endpoint trees
before updating refs. After the atomic ref update, synchronize only the reviewed
documentation file from the new `HEAD`, then verify that tracked and staged
working-tree diffs are empty. The old remote-tracking ref remains reachable until
remote publication; run the full-ref scan only after the force-push is complete
and a fetch confirms the new remote tip.

## Ref Update And Publication

Update local refs with compare-and-swap `git update-ref` operations using their
recorded old object IDs. Import verified objects without creating refs before the
transaction. Do not use `git reset --hard`; after the transaction, restore only
the reviewed documentation path from the sanitized `HEAD`. Do not update a ref
if its old object ID changed during the rewrite window.

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
