---
name: cut-rc
description: Cut a release candidate branch from the integration branch — pre-flight checks, version resolution (explicit or semver bump, with a smart suggestion from commit prefixes), a changelog preview, then create rc-X.Y.Z, bump the project's version file, commit, and push to trigger your CI build. Works on any Git host.
user-invocable: true
disable-model-invocation: true
argument-hint: Version (e.g. 3.1.0) or increment flag (--patch, --minor, --major); omit to get a smart suggestion
allowed-tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "AskUserQuestion"]
summary: Open a release cycle — pre-flight the integration branch, resolve the next version, preview the changelog, then create rc-X.Y.Z, bump the version file, and push to kick off your CI build. Any Git host.
example: "/cut-rc --minor"
type: skill
category: workflow
platform: cross
portability: adaptable
publish: public
adaptation_notes: "The git mechanics port verbatim: pre-flight (clean tree · on the integration branch · synced · warn on existing RC branches / open PRs) → resolve the next version → create rc-X.Y.Z from the integration branch and unset its upstream → bump → commit → push (the push is what triggers the build). Two things you swap: (a) WHERE the version lives — replace the version read/write with your project's version file (package.json `version`, Cargo.toml, gradle.properties, pyproject.toml, a VERSION file, …) and verify the bump with a count-before/count-after on that file; (b) HOW the push starts a build — the RC-branch push triggers your CI (GitHub Actions, GitLab CI, …) which builds and distributes to your store/registry. The integration branch is auto-detected (origin/develop, else the remote default, else main) — don't hardcode it. The semver bump, smart-suggestion-from-commit-prefixes, changelog preview, and rollback are all generic. `gh` is shown for the open-PR warning; swap for `glab`/your host or skip it (warning-only, never blocking)."
---

# Cut Release Candidate

Create a release candidate branch from the integration branch, bump the project's version, and push to start a build. Repository-agnostic: it detects the integration branch and reads your project's version file instead of assuming a stack.

## Arguments
$ARGUMENTS

A version (`3.1.0`), an increment flag (`--patch` / `--minor` / `--major`), or nothing (smart-suggestion mode).

## What this does

`cut-rc` opens a release cycle. The shape is fixed and ports to any Git host:

1. **Pre-flight** the integration branch is clean, current, and synced; warn about anything in flight.
2. **Resolve** the next version — explicit, a semver bump, or a suggestion derived from the commits since the last tag.
3. **Preview** the changelog so you see what is shipping before you commit to a number.
4. **Create** `rc-X.Y.Z` from the integration branch, **bump** the version in the project's version file, **commit**, and **push** — the push is what triggers your CI build.

Two things are stack-specific and live in `adaptation_notes`: **where the version lives** (your version file) and **how the push becomes a build** (your CI → store/registry).

## Workflow

### Phase 0: Integration-Branch Detection

Detect the integration branch once and reuse it everywhere. Don't hardcode `develop`/`main`.

```bash
if git ls-remote --heads origin develop | grep -q .; then
  INTEGRATION_BRANCH=develop
else
  INTEGRATION_BRANCH=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
  INTEGRATION_BRANCH=${INTEGRATION_BRANCH:-main}
fi
```

### Phase 1: Pre-Flight Checks

```bash
# 1a: Working tree clean (untracked files are tolerated; staged/unstaged changes are not)
if [ -n "$(git diff --cached --name-only)" ] || [ -n "$(git diff --name-only)" ]; then
  echo "Error: Working tree has uncommitted changes. Commit or stash first."
  exit 1
fi

# 1b: On the integration branch
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "$INTEGRATION_BRANCH" ]; then
  echo "Warning: Currently on '$CURRENT_BRANCH', not '$INTEGRATION_BRANCH'"
  # AskUserQuestion: "Switch to $INTEGRATION_BRANCH" / "Continue on $CURRENT_BRANCH" / "Cancel"
fi

# 1c: Synced with the remote integration branch
if ! git fetch origin; then
  echo "Error: git fetch origin failed. Check network and authentication."
  exit 1
fi
LOCAL_SHA=$(git rev-parse "$INTEGRATION_BRANCH")
REMOTE_SHA=$(git rev-parse "origin/$INTEGRATION_BRANCH")
if [ "$LOCAL_SHA" != "$REMOTE_SHA" ]; then
  echo "Error: Local $INTEGRATION_BRANCH ($LOCAL_SHA) is out of sync with origin/$INTEGRATION_BRANCH ($REMOTE_SHA)"
  echo "Run: git pull origin $INTEGRATION_BRANCH"
  exit 1
fi

# 1d: Warn about existing RC branches (preserve newlines for correct counting)
EXISTING_RC=()
while IFS= read -r line; do
  [ -n "$line" ] && EXISTING_RC+=("$line")
done < <(git branch -r | grep 'origin/rc-' | sed 's|.*origin/||;s|^[[:space:]]*||;s|[[:space:]]*$||')
if [ ${#EXISTING_RC[@]} -gt 0 ]; then
  echo "Warning: Existing RC branch(es) found:"
  printf '  %s\n' "${EXISTING_RC[@]}"
fi

# 1e: Warn about open PRs targeting the integration branch (optional — swap gh for your host, or skip)
if command -v gh >/dev/null 2>&1; then
  OPEN_PRS=$(gh pr list --base "$INTEGRATION_BRANCH" --state open --json number --jq 'length' 2>/dev/null || echo "0")
  if [ "$OPEN_PRS" -gt 0 ] 2>/dev/null; then
    echo "Warning: $OPEN_PRS open PR(s) targeting $INTEGRATION_BRANCH"
    gh pr list --base "$INTEGRATION_BRANCH" --state open --json number,title --jq '.[] | "  #\(.number) \(.title)"'
  fi
fi
```

Warnings are informational — none of 1d/1e blocks the cut. Display a pre-flight summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pre-Flight Checks
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Branch:       <integration branch> (synced)
  Working tree: clean
  Existing RCs: [none | list]
  Open PRs:     [count]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 2: Version Resolution

Read the current version from **your project's version file** and compute the next one. This is the first stack-specific touch point — see `adaptation_notes` for how to swap in your version file.

```bash
# Replace this read with your project's version file. The variable contract is the same:
# CURRENT_VERSION must hold the current X.Y.Z.
#   package.json     CURRENT_VERSION=$(jq -r .version package.json)
#   Cargo.toml       CURRENT_VERSION=$(grep -m1 '^version' Cargo.toml | sed 's/.*"\(.*\)".*/\1/')
#   gradle.properties CURRENT_VERSION=$(grep -m1 '^version=' gradle.properties | cut -d= -f2)
#   pyproject.toml   CURRENT_VERSION=$(grep -m1 '^version' pyproject.toml | sed 's/.*"\(.*\)".*/\1/')
#   VERSION file     CURRENT_VERSION=$(tr -d '[:space:]' < VERSION)
CURRENT_VERSION="<read from your version file>"
```

Parse `$ARGUMENTS`:
- **Explicit version** (e.g. `3.1.0`) → use directly.
- **`--patch` / `--minor` / `--major`** → compute from current (semver):

```bash
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"
case "$ARG" in
  --patch) NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))" ;;
  --minor) NEW_VERSION="$MAJOR.$((MINOR + 1)).0" ;;
  --major) NEW_VERSION="$((MAJOR + 1)).0.0" ;;
  "")      NEW_VERSION="" ;;  # smart-suggestion mode
  *)       NEW_VERSION="$ARG" ;;
esac
```

- **No argument → smart-suggestion mode.** Analyze the commits since the last tag and suggest an increment from the commit prefixes (`Feat:` → minor; only `Fix:`/`Perf:`/`Refactor:` → patch). Adapt the prefixes to your commit convention (e.g. Conventional Commits `feat:`/`fix:`). The heuristic only distinguishes minor vs patch and never auto-escalates to major — a breaking change is a deliberate manual `--major` decision.

```bash
LAST_TAG=$(git tag --sort=-v:refname | head -1)
if [ -z "$LAST_TAG" ]; then
  COMMITS=$(git log --oneline 2>/dev/null)
else
  COMMITS=$(git log "$LAST_TAG"..HEAD --oneline 2>/dev/null)
fi

FEAT_COUNT=$(echo "$COMMITS" | grep -c '^[a-f0-9]* Feat:' || true)
if [ "$FEAT_COUNT" -gt 0 ]; then
  SUGGESTED="--minor"; REASON="$FEAT_COUNT feature commit(s) detected"
else
  SUGGESTED="--patch"; REASON="only fixes/refactors (no new features)"
fi
```

Present the suggestion via AskUserQuestion with the evidence:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Version Suggestion
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Current:    X.Y.Z
  Commits:    N total (F feat, B fix, P perf, R refactor)
  Suggestion: --minor (new features detected)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

AskUserQuestion options: the suggested increment, an alternative increment, or an explicit version.

**Validate `NEW_VERSION` is strictly greater than `CURRENT_VERSION`:**

```bash
HIGHER=$(printf '%s\n%s\n' "$CURRENT_VERSION" "$NEW_VERSION" | sort -V | tail -1)
if [ "$HIGHER" = "$CURRENT_VERSION" ] || [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "Error: New version $NEW_VERSION must be greater than current $CURRENT_VERSION"
  exit 1
fi
```

### Phase 3: Changelog Preview

Show a grouped commit summary since the last tag — a **preview only**; the prose changelog is generated in `/ship-release`.

```bash
LAST_TAG=$(git tag --sort=-v:refname | head -1)
if [ -z "$LAST_TAG" ]; then
  echo "No previous tags found — showing all commits"
  RAW_COMMITS=$(git log --oneline --no-merges)
else
  RAW_COMMITS=$(git log "$LAST_TAG"..HEAD --oneline --no-merges)
fi
```

Group by commit prefix (adapt the prefixes to your convention) and display:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Changelog Preview — N commits since <last tag>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Feat:     N    Fix:      N    Perf:     N
  Refactor: N    Chore:    N    Test:     N
  Docs:     N    Other:    N
─── Feat ────────────────────────────────────────
  [commits]
─── Fix ─────────────────────────────────────────
  [commits]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 4: Branch Creation

Create the RC branch from the *remote* integration branch and detach it from upstream so a stray `git push` can never land on the integration branch.

```bash
git checkout -b "rc-$NEW_VERSION" "origin/$INTEGRATION_BRANCH"
git branch --unset-upstream
```

### Phase 5: Version Bump (with verification)

Bump the version in your project's version file and verify the edit with a count-before / count-after. This is the second stack-specific touch point — the **procedure** is generic, the **file and match string** are yours (see `adaptation_notes`).

```bash
# Generic count-and-verify bump (illustrated with a simple substitution).
# 1) Count the current-version occurrences you expect to change.
EXPECTED_COUNT=$(grep -c "<current-version match>" "$VERSION_FILE" || true)
if [ "$EXPECTED_COUNT" -eq 0 ]; then
  echo "Error: No occurrences of the current version in $VERSION_FILE. Already bumped?"
  exit 1
fi

# 2) Replace (escape regex metacharacters in the version — dots especially).
#    Many ecosystems have a native bumper that is safer than sed:
#      npm version <X.Y.Z> --no-git-tag-version
#      cargo set-version <X.Y.Z>
#      poetry version <X.Y.Z>
ESCAPED_CURRENT=$(echo "$CURRENT_VERSION" | sed 's/\./\\./g')
sed -i '' "s/<match using ${ESCAPED_CURRENT}>/<replacement using $NEW_VERSION>/g" "$VERSION_FILE"

# 3) Verify: the new version appears exactly EXPECTED_COUNT times and the old version is gone.
NEW_COUNT=$(grep -c "<new-version match>" "$VERSION_FILE")
OLD_COUNT=$(grep -c "<current-version match>" "$VERSION_FILE" || true)
if [ "$NEW_COUNT" -ne "$EXPECTED_COUNT" ] || [ "$OLD_COUNT" -ne 0 ]; then
  # Rollback: restore the file, return to the integration branch, delete the half-made RC branch.
  git checkout -- "$VERSION_FILE"
  git checkout "$INTEGRATION_BRANCH"
  git branch -d "rc-$NEW_VERSION"
  echo "Error: Version bump verification failed. Rolled back."
  exit 1
fi
```

> `sed -i ''` is the BSD/macOS form; GNU sed uses `sed -i`. Prefer your ecosystem's native version bumper when one exists — it edits the canonical field and avoids brittle pattern matching.

### Phase 6: Commit

```bash
git add "$VERSION_FILE"
git commit -m "Bump version to $NEW_VERSION for release candidate"
```

### Phase 7: Push (with confirmation)

The push is the irreversible-ish step: it publishes the RC branch and **triggers your CI build**. Gate it behind AskUserQuestion.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ready to Push
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Branch:  rc-<new version>
  Version: <current> -> <new version>
  Commits: N (changelog preview above)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Push rc-<new version> to origin? This triggers your CI build.
```

```bash
if ! git push -u origin "rc-$NEW_VERSION"; then
  echo "Error: Push failed. Branch rc-$NEW_VERSION exists locally but not on origin."
  echo "Fix the issue and run: git push -u origin rc-$NEW_VERSION"
  exit 1
fi
```

### Phase 8: Post-Push Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RC Branch Created
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Branch:  rc-<new version> (pushed)
  Version: <current> -> <new version>
  CI will build this branch and distribute to your store/registry.

  Post-RC checklist:
  [ ] CI build succeeds
  [ ] Build reaches your distribution channel (beta track / staging / pre-release)
  [ ] QA smoke test passes
  [ ] Release approved (store review / sign-off)

  After approval: /ship-release
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If your CI exposes a status CLI or API, surface the monitor command here (non-blocking — never gate the cut on it).

## Error Recovery

| Phase | Error | Recovery |
|-------|-------|----------|
| 1 | Dirty working tree | Exit; tell the user to commit/stash |
| 1 | Wrong branch | Offer to switch to the integration branch |
| 1 | Out of sync | Exit; tell the user to pull |
| 2 | Invalid / not-greater version | Exit with the comparison |
| 5 | Bump count mismatch | Restore the version file, delete the RC branch, exit |
| 7 | Push rejected | Show the error; the branch stays local for a retry |
