# Merge Cascade

The PR-based merge workflow for finalizing a release. This is the **portable core** of `/ship-release` — it transfers verbatim to any Git host that has pull requests. All branch refs use `$INTEGRATION_BRANCH` (auto-detected by the skill: `origin/develop`, else the remote default, else `main`) and the RC branch `rc-$VERSION`.

## Branch Topology

```
rc-X.Y.Z ──PR──> main ──PR──> <integration branch>
                  │
                  └── tag: X.Y.Z   (pushed only AFTER the rc→main PR merges)
```

Both merges go through **pull requests**, not direct `git merge`/`git push`. PRs preserve the audit trail and respect branch protection on `main` and the integration branch. The tag is created locally during the readiness phase but pushed only once the rc→main PR has merged, so a failed merge never leaves an orphaned tag pointing at an unshipped commit.

## Forward Merge: RC → main

```bash
gh pr create \
  --head "rc-$VERSION" \
  --base main \
  --title "Release vX.Y.Z" \
  --body "$CHANGELOG"

PR_NUM=$(gh pr list --head "rc-$VERSION" --base main --json number --jq '.[0].number // empty')

gh pr merge "$PR_NUM" --merge
```

### After the PR merges: push the tag

The tag was created locally during the readiness gate; push it only now.

```bash
if ! git ls-remote --tags origin "$VERSION" | grep -q .; then
  git push origin "$VERSION"
else
  echo "Tag $VERSION already on remote — skipping push"
fi
```

## Publish the Release

Publish a release on your Git host, pointing at the freshly pushed tag, with the generated changelog as the body. On GitHub:

```bash
gh release create "$VERSION" --target main --title "$VERSION" --notes "$CHANGELOG" --latest
```

(GitLab: `glab release create "$VERSION" --notes "$CHANGELOG"`. Other hosts: the equivalent "create release from tag" call.)

## Back-Merge: main → integration branch

The release commit (and the merge commit on `main`) must flow back so the integration branch isn't behind `main` going into the next cycle.

```bash
gh pr create \
  --head main \
  --base "$INTEGRATION_BRANCH" \
  --title "RC vX.Y.Z" \
  --body "$CHANGELOG"

# Match the PR by its exact title so an unrelated open main→integration PR isn't merged by accident.
PR_NUM=$(gh pr list --head main --base "$INTEGRATION_BRANCH" --state open --json number,title \
  --jq '.[] | select(.title == "RC vX.Y.Z") | .number // empty')

gh pr merge "$PR_NUM" --merge
```

Substitute the real version for `X.Y.Z` in both the title and the match filter.

### PR Title Conventions

| Direction | Title Format | Example |
|-----------|--------------|---------|
| RC → main | `Release vX.Y.Z` | `Release v3.1.0` |
| main → integration branch | `RC vX.Y.Z` | `RC v3.1.0` |

The `v` prefix is a title convention only. Whether the **git tag** carries a `v` is a separate, project-level choice (e.g. tag the bare `X.Y.Z` while titling the PRs with a `v`).

## Re-Entry Detection

`/ship-release` is safe to re-run after a partial failure. Each cascade step is guarded so completed work is detected and skipped.

```bash
# rc→main release PR already merged?
gh pr list --state merged --head "rc-$VERSION" --base main --json number --jq '.[0].number // empty'

# Tag already on the remote?
git ls-remote --tags origin "$VERSION" | grep -q .

# Release already published on the host?
gh release view "$VERSION" >/dev/null 2>&1

# Back-merge PR already merged? (match by exact title)
gh pr list --state merged --head main --base "$INTEGRATION_BRANCH" --json number,title \
  --jq '.[] | select(.title == "RC vX.Y.Z") | .number // empty'
```

## Conflict Handling

- **Release PR (rc → main):** **blocking.** Show the error and the PR URL, leave the PR open, and have the user resolve it on the host and re-run. Nothing irreversible has happened yet — the tag has not been pushed.
- **Back-merge PR (main → integration branch):** **non-blocking.** The release is already shipped. Surface a warning and the PR URL; the user resolves the conflict manually, but it does not undo the release. It must be resolved before the next cycle so the integration branch isn't behind `main`.

## Rules

- **Always** use the merge-commit strategy (`--merge`) — it preserves branch topology and the individual commit history.
- **Never** squash a release or back-merge PR (`--squash` collapses the history you are trying to carry across).
- **Never** force-push `main` or the integration branch.
- **Never** push the tag before the rc→main PR has merged.

## Host portability

`gh` is GitHub's CLI; the cascade itself is host-agnostic. On GitLab use `glab` (`glab mr create`/`glab mr merge`, `glab release create`); on other hosts use the equivalent PR/MR + release API. The branch topology, the title conventions, the tag-after-merge ordering, and the re-entry guards do not change.
