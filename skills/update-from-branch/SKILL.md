---
name: update-from-branch
description: Sync the current branch with another (usually main) via merge or rebase, while safely preserving uncommitted work (auto-stash) and surfacing conflicts clearly. Works on any repo.
user-invocable: true
argument-hint: Optional source branch (defaults to the detected base, e.g. main)
allowed-tools: ["Bash", "Read", "Edit", "Grep", "Glob", "Task"]
summary: Sync the current branch from another (usually main) via merge or rebase, auto-stashing dirty work and surfacing conflicts clearly — never discards changes. Any repo.
example: "/update-from-branch main"
type: skill
category: workflow
platform: cross
portability: portable
publish: public
adaptation_notes: "Generic and safety-first. Pick the default merge-vs-rebase choice to match your team's history policy (rebase for linear history; merge to preserve true topology and never rewrite shared commits). The base-branch detection and auto-stash are portable as-is."
---

# Update From Branch

Bring the latest changes from another branch (usually `main`) into the branch you're on, **without ever losing uncommitted work**. The skill stashes dirty changes, fetches, applies via merge or rebase, restores the stash, and reports any conflicts with clear next steps. Safety-first: it shows what will happen before doing it and never discards anything.

## Source Branch (optional):
$ARGUMENTS

## Workflow

### Phase 1: Orient + Detect the Source

```bash
CURRENT=$(git branch --show-current)

# Source to sync FROM: the argument, else the detected base branch.
SOURCE="$ARGUMENTS"
if [ -z "$SOURCE" ]; then
  if git ls-remote --heads origin develop | grep -q .; then SOURCE=develop
  else SOURCE=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p'); SOURCE=${SOURCE:-main}; fi
fi

echo "Updating '$CURRENT' from '$SOURCE'"
```

Guard rails — refuse politely if:
- `CURRENT` **is** `SOURCE` (nothing to sync — you're on the branch you'd merge from).
- There's a merge/rebase already in progress (`git status` shows it) — tell the user to finish or `--abort` it first.

### Phase 2: Protect Dirty Work (auto-stash)

```bash
DIRTY=0
if [ -n "$(git status --porcelain)" ]; then
  DIRTY=1
  git stash push --include-untracked -m "update-from-branch: WIP on $CURRENT"
  echo "Stashed uncommitted changes (including untracked). They will be restored after the update."
fi
```

The work is parked in a named stash — it is never thrown away, even if later steps fail.

### Phase 3: Fetch the Latest

```bash
git fetch origin "$SOURCE"

# How far apart are we? (behind = commits to pull in; ahead = your local commits)
BEHIND=$(git rev-list --count "HEAD..origin/$SOURCE")
AHEAD=$(git rev-list --count "origin/$SOURCE..HEAD")
echo "Behind origin/$SOURCE by $BEHIND · ahead by $AHEAD"
```

If `BEHIND` is 0, you're already up to date — restore the stash (Phase 5) and stop.

### Phase 4: Choose Strategy + Apply

Decide **merge vs rebase** and state the choice before running it:

- **Rebase** — replays your local commits on top of `$SOURCE` for a clean, linear history. Best when your branch is **unpushed or solo**. Never rebase commits others have already pulled.
- **Merge** — records a merge commit, preserving true history and the original commits. Best when the branch is **shared/pushed**, or your team prefers explicit merge topology.

> Default heuristic: if the branch has an upstream and may be shared (`git rev-parse --abbrev-ref @{u}` succeeds and others could have it), prefer **merge**; for a private, unpushed branch, **rebase** is fine. When unsure, ask once, then default to merge (the non-rewriting, safer choice).

```bash
# --- Rebase path ---
git rebase "origin/$SOURCE"

# --- Merge path ---
git merge --no-edit "origin/$SOURCE"
```

### Phase 5: Restore Dirty Work

Only after the update lands cleanly:

```bash
if [ "$DIRTY" = "1" ]; then
  git stash pop || echo "Stash pop hit conflicts — your WIP is safe in 'git stash list'; resolve, then 'git stash drop'."
fi
```

### Phase 6: Conflict Handling + Report

If merge/rebase or the stash pop reports conflicts, **stop and guide** — do not attempt blind auto-resolution:

```bash
git status --short | grep '^UU\|^AA\|^DD'   # conflicted paths
git diff --name-only --diff-filter=U         # files needing resolution
```

Tell the user, per path, the resolution loop and the abort escape hatch:

```
Conflicts in:
  src/api/client   ← edit to resolve, then: git add src/api/client
  config           ← edit to resolve, then: git add config

After resolving all:   git rebase --continue   (or: git commit, for a merge)
To back out entirely:  git rebase --abort       (or: git merge --abort)
Your stashed WIP (if any) remains in: git stash list
```

Final summary (clean case):
```
✅ '<current>' updated from '<source>'
   Strategy: <merge|rebase> · pulled <N> commit(s)
   WIP restored: <yes|none>
```

## Quick Reference

### Merge vs rebase
| | Merge | Rebase |
|---|---|---|
| History | Preserves topology, adds merge commit | Linear, rewrites your commits |
| Use when | Branch is shared/pushed | Branch is private/unpushed |
| Risk | Extra merge commits | Never rewrite shared history |

### Safety invariants
- Dirty work is **stashed**, never discarded — recover from `git stash list`.
- Show the plan (behind/ahead, chosen strategy) before applying.
- On conflict: surface paths + resolution + abort command; never force.
- Refuse if a merge/rebase is already in progress.

### Escape hatches
Abort in-progress: `git rebase --abort` / `git merge --abort`. · Recover WIP: `git stash list` → `git stash pop`.
