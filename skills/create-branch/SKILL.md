---
name: create-branch
description: Create a git branch from your current uncommitted changes or a short description — infers a sensible type prefix (feat/fix/chore/refactor/docs) and a kebab-case name, optionally in an isolated git worktree. Works on any repo.
user-invocable: true
argument-hint: Optional description of the work (defaults to analyzing current changes)
allowed-tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "Task"]
summary: Create a git branch from current changes or a short description — infer a type/kebab-name, confirm, then git switch -c (or git worktree add for isolation). Any repo.
example: "/create-branch add rate limiting to the api client"
type: skill
category: workflow
platform: cross
portability: portable
publish: public
adaptation_notes: "Already generic — it detects the base branch and works on any repo. To tune it, adjust the type-prefix taxonomy (feat/fix/chore/refactor/docs/perf/test) in the Quick Reference to match your team's convention, and the worktree path layout to your preference."
---

# Create Branch

Create a new git branch without needing an issue. Infer a clean `type/kebab-name` from either your current uncommitted changes or a one-line description, confirm it, then switch to it — optionally in an isolated worktree. This is the ad-hoc counterpart to `issue-to-branch`: use it when there's no issue to anchor on.

## Description (optional):
$ARGUMENTS

## Workflow

### Phase 1: Gather Signals

```bash
# Where are we starting from? Detect the base branch instead of assuming it.
CURRENT=$(git branch --show-current)
if git ls-remote --heads origin develop | grep -q .; then BASE=develop
else BASE=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p'); BASE=${BASE:-main}; fi

# What changed locally? (Used when no description is given.)
git status --short
git diff --stat
git diff --cached --stat
```

Two entry points, same destination:
- **Description given** (`$ARGUMENTS` non-empty) — derive the name from the words.
- **No description** — derive it from the diff: which top-level dirs/files changed, and whether they look like a fix, a feature, docs, or config.

### Phase 2: Infer Type + Name

**Type prefix** — pick from the verb/intent:
- `feat` — adds capability ("add", "implement", "support", new files).
- `fix` — corrects behavior ("fix", "bug", "crash", "regression").
- `refactor` — restructures without behavior change ("rename", "extract", "move").
- `docs` — documentation only (`*.md`, README, comments).
- `chore` — config, deps, tooling, CI, housekeeping.
- `perf` / `test` — performance work / test-only changes (optional, if your team uses them).

**Name** — kebab-case, concise, no redundant prefix:
- Lowercase, words joined by `-`, no spaces or slashes inside the name.
- Drop filler ("the", "a", "to"). 3–5 words max.
- `"add rate limiting to the api client"` → `feat/rate-limiting-api-client`.

```bash
# Slugify a description into a safe branch suffix (portable).
slugify() {
  echo "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | cut -c1-50
}
```

### Phase 3: Confirm

Present the proposal before creating anything — never silently branch:

```
Proposed branch:  feat/rate-limiting-api-client
  Base:           main
  Source:         description ("add rate limiting to the api client")
  Isolation:      none (switch in place)

Proceed? [accept / rename / change-base / use-worktree / cancel]
```

If the user asks for isolation (says "worktree", "isolated", "in parallel", or passes a worktree hint), switch to the worktree path in Phase 4.

### Phase 4: Create the Branch

**Standard — switch in place** (carries any uncommitted work onto the new branch):

```bash
NAME="feat/rate-limiting-api-client"   # from Phase 2
git switch -c "$NAME" "$BASE"          # branch off the detected base
```

**Isolated — new git worktree** (leaves the current tree untouched; good for parallel work):

```bash
NAME="feat/rate-limiting-api-client"
# Sibling directory named after the leaf of the branch.
WT="../$(basename "$(git rev-parse --show-toplevel)")-${NAME##*/}"
git worktree add -b "$NAME" "$WT" "$BASE"
echo "Worktree ready at: $WT  (cd there to work)"
```

> Worktree note: uncommitted changes in the current tree do **not** follow into a new worktree. If the user has dirty work they want to move, prefer the standard `git switch -c` (which carries it) or commit/stash first.

### Phase 5: Optional Upstream

Only push/track when the user wants a remote branch now (many teams push later, at first PR):

```bash
git push -u origin "$NAME"   # sets upstream so future `git push`/`git pull` need no args
```

## Quick Reference

### Type prefixes (adapt to your team)
| Prefix | Use for |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix / regression |
| `refactor` | Restructure, no behavior change |
| `docs` | Documentation only |
| `chore` | Config, deps, tooling, CI |
| `perf` / `test` | Perf-only / test-only (optional) |

### Naming rules
- `type/kebab-name`, lowercase, hyphen-separated.
- One topic per branch; keep it short and searchable.
- No spaces, uppercase, or extra slashes inside the name.

### Standard vs worktree
- **Standard** (`git switch -c`) — fast, single workspace, carries dirty changes.
- **Worktree** (`git worktree add`) — isolated dir for parallel work; clean up later with `git worktree remove <path>`.
