---
name: ship-release
description: Finalize a release after approval — detect the RC branch, validate it, generate a changelog, gate on a human readiness check, then tag the built commit, merge rc→main, publish a release on your Git host, back-merge to the integration branch, clean up, and announce the shipped release. Re-entrant and safe to re-run after a partial failure. Works on any Git host.
user-invocable: true
disable-model-invocation: true
argument-hint: Optional version (auto-detected from the RC branch); flag --skip-ci to skip CI/store status checks
allowed-tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "AskUserQuestion"]
summary: Ship an approved release candidate — validate the RC branch, draft the changelog, gate on a human check, then tag, merge rc→main, publish the release, back-merge to the integration branch, clean up, and announce the shipped release. Re-entrant. Any Git host.
example: "/ship-release"
type: skill
category: workflow
platform: cross
portability: adaptable
publish: public
adaptation_notes: "The git cascade ports verbatim: detect the RC branch → validate (version matches the version file, tag free, clean tree) → generate the changelog → human readiness gate (AskUserQuestion, before any irreversible op) → tag the built commit locally → rc→main PR 'Release vX.Y.Z' + merge → push the tag → publish a release on the host (e.g. GitHub Release) → back-merge PR main→integration 'RC vX.Y.Z' + merge → delete the RC branch. See merge-cascade.md — that file is fully stack-neutral. Two things you swap: (a) WHERE the version lives — replace the version read with your project's version file (package.json, Cargo.toml, gradle.properties, pyproject.toml, VERSION, …) for the 'version file matches the RC branch version' check; (b) HOW you build / distribute / get approval — the CI build + store/registry distribution + approval step that happened between /cut-rc and now (store review, package-registry publish, deploy gate, …). The integration branch is auto-detected (origin/develop, else remote default, else main) — don't hardcode it. `gh` is shown for PRs and releases; swap for `glab`/your host. The optional CI/store status probes are non-blocking and gated by --skip-ci; drop them if you have no such CLI. Re-entry guards (skip already-completed steps) are generic and must be kept. A third adaptable touch point is the **release announcement** (Phase 11, required): post the `$CHANGELOG` once to your team's shared releases channel via your chat tool (any team-chat bot or incoming webhook — e.g. Teams/Discord), with discussion in-thread and no per-team cross-posts — swap the channel and the mechanism. It must degrade gracefully in headless/CI runs and never gate the already-shipped release."
---

# Ship Release

Finalize a release candidate after it has been approved: validate it, tag the built commit, run the merge cascade, publish the release, and clean up. Repository-agnostic: it detects the integration branch and reads your project's version file instead of assuming a stack, and it is **re-entrant** — re-running after a partial failure skips the steps that already succeeded.

## Arguments
$ARGUMENTS

An optional version (otherwise auto-detected from the RC branch) and an optional `--skip-ci` flag to skip the non-blocking CI/store status probes.

## What this does

`ship-release` closes the cycle that `/cut-rc` opened. The shape is fixed and ports to any Git host:

1. **Detect** the RC branch (current branch, explicit version, or the single remote `rc-*`).
2. **Validate** — the version file matches the RC version, the tag is free, the tree is clean.
3. **Changelog** — generate human-readable release notes from the commits since the last tag.
4. **Readiness gate** — a human AskUserQuestion confirmation **before any irreversible operation**.
5. **Cascade** — tag the built commit locally → merge rc→main → push the tag → publish a release → back-merge main→integration.
6. **Cleanup** — delete the RC branch.
7. **Announce** — post the changelog to your team's shared releases channel (required).

Three things are stack-specific and live in `adaptation_notes`: **where the version lives** (your version file, for the match check), **how you built / distributed / got approval** (the CI + store/registry + approval that happened between `/cut-rc` and now), and **the chat tool + shared releases channel** for the announcement.

## Workflow

### Phase 0: Integration-Branch Detection

```bash
if git ls-remote --heads origin develop | grep -q .; then
  INTEGRATION_BRANCH=develop
else
  INTEGRATION_BRANCH=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
  INTEGRATION_BRANCH=${INTEGRATION_BRANCH:-main}
fi
```

### Phase 1: Detect the RC Branch

```bash
# Parse arguments
SKIP_CI=false
EXPLICIT_VERSION=""
for arg in $ARGUMENTS; do
  case "$arg" in
    --skip-ci) SKIP_CI=true ;;
    *)         EXPLICIT_VERSION="$arg" ;;
  esac
done

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" == rc-* ]]; then
  RC_BRANCH="$CURRENT_BRANCH"; VERSION="${CURRENT_BRANCH#rc-}"
elif [ -n "$EXPLICIT_VERSION" ]; then
  RC_BRANCH="rc-$EXPLICIT_VERSION"; VERSION="$EXPLICIT_VERSION"
else
  # Search the remote (preserve newlines for correct counting)
  RC_ARRAY=()
  while IFS= read -r line; do
    [ -n "$line" ] && RC_ARRAY+=("$line")
  done < <(git branch -r | grep 'origin/rc-' | sed 's|.*origin/||;s|^[[:space:]]*||;s|[[:space:]]*$||')
  RC_COUNT=${#RC_ARRAY[@]}

  if [ "$RC_COUNT" -eq 0 ]; then
    echo "Error: No RC branches found. Run /cut-rc first."
    exit 1
  elif [ "$RC_COUNT" -eq 1 ]; then
    RC_BRANCH="${RC_ARRAY[0]}"; VERSION="${RC_BRANCH#rc-}"
  else
    echo "Multiple RC branches found:"
    printf '  %s\n' "${RC_ARRAY[@]}"
    echo "Error: Multiple RC branches found — pass an explicit version (e.g. /ship-release 3.1.0)"
    exit 1
  fi
fi
```

### Phase 2: Pre-Ship Validation

```bash
# Checkout and fast-forward the RC branch
if ! git fetch origin; then
  echo "Error: git fetch origin failed. Check network and authentication."
  exit 1
fi
if ! git checkout "$RC_BRANCH" 2>/dev/null; then
  if ! git checkout -b "$RC_BRANCH" "origin/$RC_BRANCH"; then
    echo "Error: Could not checkout RC branch $RC_BRANCH"; exit 1
  fi
fi
if ! git pull --ff-only origin "$RC_BRANCH"; then
  echo "Error: Cannot fast-forward $RC_BRANCH. Local branch has diverged from origin."
  exit 1
fi

# Verify the project's version file matches the RC branch version.
# Stack-specific READ — see `adaptation_notes`. The check is the same everywhere:
VERSION_FILE_VERSION="<read from your version file>"
if [ "$VERSION_FILE_VERSION" != "$VERSION" ]; then
  echo "Error: version file ($VERSION_FILE_VERSION) does not match RC branch version ($VERSION)"
  exit 1
fi

# Verify the tag doesn't already exist (local or remote)
if git tag -l "$VERSION" | grep -q .; then
  echo "Error: Tag $VERSION already exists locally"; exit 1
fi
if git ls-remote --tags origin "$VERSION" | grep -q .; then
  echo "Error: Tag $VERSION already exists on remote"; exit 1
fi

# Working tree clean
if [ -n "$(git diff --cached --name-only)" ] || [ -n "$(git diff --name-only)" ]; then
  echo "Error: RC branch has uncommitted changes"; exit 1
fi
```

**Optional CI / store status probes** (skipped with `--skip-ci`, and only if such a CLI exists). These are **non-blocking** context — never gate the release on them.

```bash
if [ "$SKIP_CI" = false ]; then
  # Replace with your CI / store CLI if you have one (build status, beta crashes, review/approval state).
  # Each call must degrade gracefully:  <cli> <status-cmd> 2>/dev/null || echo "status unavailable"
  :
fi
```

### Phase 3: Generate the Changelog

```bash
LAST_TAG=$(git tag --sort=-v:refname | head -1)
if [ -z "$LAST_TAG" ]; then
  echo "No previous tags found — using all commits"
  RAW_COMMITS=$(git log --oneline --no-merges)
else
  RAW_COMMITS=$(git log "$LAST_TAG"..HEAD --oneline --no-merges)
fi
```

Transform the raw commits into a human-readable changelog. Map commit prefixes to user-facing sections, describe impact (not implementation), consolidate related commits into one entry, and omit internal-only commits:

| Commit prefix | Changelog line | Include? |
|---------------|----------------|----------|
| `Feat:`       | `- New:`       | Yes |
| `Fix:`        | `- Fixed:`     | Yes |
| `Perf:` / `Refactor:` | `- Improved:` | Yes |
| `Chore:`      | `- Improved:`  | Only if user-visible |
| `Test:` / `Docs:` | —          | No (internal) |

```markdown
## What's Changed

- New: [user-facing description consolidated from Feat: commits]
- Improved: [from Perf:/Refactor:/user-visible Chore: commits]
- Fixed: [from Fix: commits]

**Full Changelog**: <host compare link>/<last tag>...<version>
```

Adapt the prefixes to your commit convention (e.g. Conventional Commits `feat:`/`fix:`). Build the compare link for your host (GitHub: `.../compare/<last tag>...<version>`); omit it when there is no previous tag. If your CI/store tooling can seed a draft from git history, use that as the starting draft and refine it with this flow.

Show the draft via AskUserQuestion: **"Use as-is"** / **"Edit changelog"** (apply the user's edits, then re-show). Store the final text in `$CHANGELOG` — it is reused for the rc→main PR body, the published release notes, and the back-merge PR body.

### Phase 4: Release Readiness Gate

This is the **human gate before any irreversible operation** — the next phase tags and merges. Use AskUserQuestion.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Release Readiness
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Version:   <version>
  RC Branch: rc-<version>
  Last Tag:  <last tag>
  [CI/store build info, if available]

  Confirm release <version> is approved and ready to ship?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 5: Tag (local only)

```bash
if ! git tag -l "$VERSION" | grep -q .; then
  git tag -a "$VERSION" -m "Release $VERSION"
else
  echo "Tag $VERSION already exists locally — skipping"
fi
```

The tag is created locally but **not pushed** until the rc→main PR merges (Phase 6) — this prevents an orphaned tag if the merge fails. (Whether the tag carries a `v` prefix is a project choice — see `merge-cascade.md`.)

### Phase 6: Release PR (rc → main)

**For the full cascade, branch topology, and PR conventions, read [`merge-cascade.md`](merge-cascade.md).**

```bash
# Re-entry: skip if the release PR already merged
EXISTING_RELEASE_PR=$(gh pr list --state merged --head "rc-$VERSION" --base main --json number --jq '.[0].number // empty')
if [ -n "$EXISTING_RELEASE_PR" ]; then
  echo "Release PR #$EXISTING_RELEASE_PR already merged — skipping Phase 6"
else
  # AskUserQuestion before creating: "Create PR rc-<version> -> main, title 'Release v<version>'. Proceed?"
  # Then run the rc→main create/merge commands in `merge-cascade.md` ("Forward Merge: RC → main").
  # On a failed create or merge, surface the PR URL and re-run /ship-release after resolving — nothing
  # irreversible has happened yet (the tag is still local).
  :
fi
```

**After the PR merges — push the tag** (the tag-after-merge ordering; see `merge-cascade.md`):

```bash
if ! git ls-remote --tags origin "$VERSION" | grep -q .; then
  git push origin "$VERSION"
else
  echo "Tag $VERSION already on remote — skipping push"
fi
```

### Phase 7: Publish the Release

```bash
# Re-entry: skip if the release already exists
if gh release view "$VERSION" >/dev/null 2>&1; then
  echo "Release $VERSION already exists — skipping Phase 7"
else
  gh release create "$VERSION" --target main --title "$VERSION" --notes "$CHANGELOG" --latest
fi
```

(GitLab: `glab release create`. Other hosts: the equivalent "create release from tag" call.)

### Phase 8: Back-Merge PR (main → integration branch)

**For the cascade details, read [`merge-cascade.md`](merge-cascade.md).**

```bash
# Re-entry: skip if the back-merge PR already merged (match by exact title)
EXISTING_BACKMERGE=$(gh pr list --state merged --head main --base "$INTEGRATION_BRANCH" --json number,title \
  --jq '.[] | select(.title == "RC v'"$VERSION"'") | .number // empty')
if [ -n "$EXISTING_BACKMERGE" ]; then
  echo "Back-merge PR #$EXISTING_BACKMERGE already merged — skipping Phase 8"
else
  # Run the main→integration create/merge commands in `merge-cascade.md` ("Back-Merge: main → integration
  # branch") — title "RC v$VERSION", matched by exact title on merge so an unrelated open main→integration
  # PR isn't merged by accident. A back-merge conflict is non-blocking — the release is already shipped;
  # surface a warning + the PR URL and resolve before the next cycle.
  :
fi
```

### Phase 9: Cleanup

```bash
# Delete the RC remote branch (tolerate already-deleted)
if git ls-remote --heads origin "rc-$VERSION" | grep -q .; then
  git push origin --delete "rc-$VERSION"
else
  echo "Remote branch rc-$VERSION already deleted — skipping"
fi

# Delete the RC local branch (safe delete, not -D)
git checkout "$INTEGRATION_BRANCH"
git pull --ff-only origin "$INTEGRATION_BRANCH"
git branch -d "rc-$VERSION" 2>/dev/null || echo "Local branch rc-$VERSION already deleted — skipping"
```

### Phase 10: Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Release <version> Shipped
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Tag:        <version>
  Release:    <host release URL for the tag>
  Merged:     rc-<version> -> main (PR #N)
  Back-merge: main -> <integration branch> (PR #N)
  Cleaned:    rc-<version> branch deleted
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 11: Release Announcement (required)

Announcing every shipped release is **required** — the cycle isn't done until the release is visible to the people who depend on it. Post **one** consolidated, changelog-bearing announcement to your team's **shared releases channel** and let discussion happen **in-thread** on that post. Reuse `$CHANGELOG` from Phase 3 so the announcement matches the published release notes.

- **One channel, one post.** A single shared releases channel that any stakeholder (other teams, support, PM, leadership) can follow — not per-team channels. Don't cross-post the full announcement; it duplicates content and fragments discussion. (A team whose releases get buried can add its own one-line pointer later, but the shared channel stays canonical.)
- **What it carries.** Version, build/artifact id, a one-line human highlight, the `$CHANGELOG` body, and links to the full changelog + the published release.
- **Discussion in-thread.** Invite questions as replies on the post so the whole audience can follow — never route discussion to a private channel a public reader can't open.
- **Mechanism (adapt to your stack).** Any chat tool works (Teams / Discord / etc.). A bot or incoming webhook gives a clean sender identity and full formatting control; an assistant/app integration is simpler but may stamp attribution and limit formatting. Whatever you pick, it must **degrade gracefully in headless/CI runs** (fall back to a webhook post) and a failed announcement must **never gate** the already-shipped release.

**Interactive runs:** confirm the drafted message with the user (AskUserQuestion: **"Post as-is"** / **"Edit"**) before sending, then record the post's link/id. **Headless/CI runs:** skip the prompt, post a pre-approved minimal template via your webhook fallback, record the result, and let a failed post pass without failing the release.

Announcing is **non-idempotent** — most chat APIs can't dedupe or edit/delete a sent message. On a re-run, skip if you recorded a post for this version; if you can't tell, confirm before re-posting (see Re-Entry Detection).

## Re-Entry Detection

Re-running after a partial failure detects and skips completed steps:

| Check | Condition | Skips |
|-------|-----------|-------|
| Tag exists locally | `git tag -l "$VERSION"` | Phase 5 |
| Release PR merged | `gh pr list --state merged --head rc-$VERSION --base main` | Phase 6 |
| Tag on remote | `git ls-remote --tags origin "$VERSION"` | tag push |
| Release published | `gh release view "$VERSION"` | Phase 7 |
| Back-merge PR merged | `gh pr list --state merged --head main --base $INTEGRATION_BRANCH` (title match) | Phase 8 |
| Release announced | recorded post link/id for the version | Phase 11 |

## Error Recovery

| Phase | Error | Recovery |
|-------|-------|----------|
| 1 | No RC branches | Exit; suggest `/cut-rc` |
| 2 | Version mismatch | Exit; show both versions |
| 2 | Tag already exists | Exit; suggest a manual check |
| 6 | PR has merge conflicts | Show the error, leave the PR open; user resolves on the host and re-runs |
| 6 | PR merge blocked (required checks/reviews) | Default: show the error, link the PR; the user clears the blockers. An admin/force merge bypassing branch protection is allowed ONLY with explicit per-release human approval + an audit note in the Summary — never silently |
| 7 | Publish fails | Show the error; can be created manually |
| 8 | Back-merge conflict | Non-blocking warning; user resolves manually |

## Supporting Files
- [`merge-cascade.md`](merge-cascade.md) — the PR-based merge workflow (branch topology, rc→main and back-merge PRs, tag-after-merge ordering, re-entry guards, conflict handling). Stack-neutral; ports verbatim.
