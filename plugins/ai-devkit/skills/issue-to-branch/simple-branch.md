# Simple Branch Creation

Quick branch creation from current changes or description, without full issue analysis.

## Usage

For quick branch without GitHub issue:
```
/issue-to-branch --simple "add CSV export endpoint"
/issue-to-branch --simple  # (analyzes current changes)
```

## Workflow

### Pre-flight Check

```bash
CURRENT_BRANCH=$(git branch --show-current)

# Warn if on main or develop
[[ "$CURRENT_BRANCH" =~ ^(main|master|develop)$ ]] && echo "On $CURRENT_BRANCH - creating new branch"

# Check uncommitted changes
git diff-index --quiet HEAD -- 2>/dev/null || echo "Uncommitted changes detected"

git status --short
```

### Analyze Changes

**If description provided**: Use as primary input
**If no description**: Infer from git diff and file patterns

```bash
CHANGED_FILES=$(git diff --name-only HEAD)
DIFF_STAT=$(git diff --stat HEAD)
```

### Branch Type Detection

Infer branch type from analysis:

| Type | Detection Keywords |
|------|-------------------|
| `feature/` | New functionality, add, implement |
| `fix/` | Bug fixes, corrections |
| `refactor/` | Code restructuring |
| `docs/` | Documentation updates |
| `test/` | Test additions |
| `chore/` | Maintenance, dependencies |
| `perf/` | Performance improvements |

### Name Generation

```bash
# Generate semantic name
# Pattern: type/action-subject (3-4 words max, kebab-case)
# Examples: feature/add-csv-export, fix/auth-timeout
```

### Infer the Affected Area

Map the changed paths to the repo's own structure so the branch name and any docs reference real
components. Don't assume a layout — derive it from where the changes actually land:

```bash
# What top-level areas do the changed files touch?
git diff --name-only HEAD | sed 's#/.*##' | sort -u
```

Then relate those to the project's conventions (source root, per-feature vs per-layer modules,
tests dir, etc.). See `project-context.md` for how to infer a repo's structure.

### Assess Complexity

| Complexity | Criteria | Documentation |
|------------|----------|---------------|
| **Simple** | Single file, typos, config | None needed |
| **Medium** | Multiple files, new module | Optional |
| **Complex** | Architecture, multi-phase | Required |

### Check Duplicates

```bash
# Check local/remote
git show-ref --verify --quiet "refs/heads/$SUGGESTED_BRANCH" && echo "Exists locally"
git ls-remote --heads origin "$SUGGESTED_BRANCH" | grep -q . && echo "Exists on remote"

# Find similar branches
git branch -a | grep -i "$(echo $SUGGESTED_NAME | cut -d'-' -f1-2)"
```

### Create Branch

First resolve the base branch (don't hardcode `develop`/`main`):
```bash
if git ls-remote --heads origin develop | grep -q .; then
    BASE_BRANCH="develop"
else
    BASE_BRANCH=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
    BASE_BRANCH="${BASE_BRANCH:-main}"
fi
```

**Regular Branch** (switches current directory):
```bash
git fetch origin
git checkout -b "$FINAL_BRANCH" "origin/$BASE_BRANCH"
git branch --unset-upstream  # CRITICAL: prevent accidental push to the base branch
```

**Worktree** (optional, parallel development) — requires the separate `worktree` skill (not bundled in this repo); otherwise use the regular branch above:
```bash
REPO_DIRNAME=$(basename "$(git rev-parse --show-toplevel)")
WORKTREE_DIR="../${REPO_DIRNAME}-${NAME_PART}"
git worktree add -b "$FINAL_BRANCH" "$WORKTREE_DIR" "origin/$BASE_BRANCH"
```
If you have the `worktree` skill, run its pre-flight checks, then copy gitignored config/env files and run the project's bootstrap/install step.

### Handle Uncommitted Changes

For regular branch:
1. Stash changes (save for later)
2. Carry changes to new branch
3. Discard changes

For worktree: Changes stay in current directory.

### Optional Documentation

For medium/complex features, create `Docs/branches/[branch-name].md`:

```markdown
# Feature: [Name]

**Branch**: `feature/[name]`
**Created**: [Date]
**Status**: In Development

## Overview
[Brief description]

## Implementation Plan
- [ ] Phase 1: Foundation
- [ ] Phase 2: Core implementation
- [ ] Phase 3: Integration
- [ ] Phase 4: Testing

## Merge Checklist
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Code review completed
```

## Summary Output

```bash
echo "Branch: $FINAL_BRANCH"
echo ""
echo "Next steps:"
echo "  1. Start working on changes"
echo "  2. git add . && git commit -m 'message'"
echo "  3. CRITICAL first push: git push -u origin $FINAL_BRANCH"
```

## Branch Tracking Safety

**CRITICAL**: Always verify tracking after creation:

```bash
git branch -vv  # Should NOT track the base branch (e.g. [origin/develop] or [origin/main])
```

Fix if needed:
```bash
git branch --unset-upstream
git push -u origin $BRANCH_NAME  # First push sets correct tracking
```

## When to Use Each Command

| Scenario | Command |
|----------|---------|
| Quick branch from current state | `/issue-to-branch --simple` |
| Branch from GitHub issue | `/issue-to-branch #123` |
| Issue + worktree + full analysis | `/issue-to-branch #123 --worktree` |
| Quick worktree from description | `/worktree "description"` |
| Quick worktree from issue | `/worktree #123` |
