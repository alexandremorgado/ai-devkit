# Post-Branch Cleanup Checklist

Steps for finalizing branch work and cleaning up after merge. All branch refs use `$BASE_BRANCH` (detected by the skill).

## Documentation Finalization

### Finalize the branch plan
Run the `update-branch-plan` skill in `--final` mode if installed, to: mark remaining completed tasks, add a completion summary, and handle deferred tasks. If it isn't installed, do this inline.

### Archive the branch plan
```bash
BRANCH=$(git branch --show-current)
PLAN_FILE="Docs/branches/${BRANCH//\//-}.md"
YEAR=$(date +%Y); ARCHIVE_DIR="Docs/archived/$YEAR"

mkdir -p "$ARCHIVE_DIR"
git mv "$PLAN_FILE" "$ARCHIVE_DIR/"
git commit -m "Docs: Archive branch plan for $BRANCH"
```

### Project documentation updates
**Check for staleness:**
- [ ] Agent-guidance files (`CLAUDE.md` / `AGENTS.md`) — if new patterns/modules were added
- [ ] Architecture / overview docs — new modules, changed boundaries
- [ ] Relevant skill docs — update examples or references when the architecture shifts

**Typical updates:** bump "Last updated" dates · add the branch to a milestones timeline · mark tasks with PR numbers and dates · add new modules to the architecture section · update test counts.

## Post-Merge Cleanup

### Delete the branch (after merge)
```bash
git checkout "$BASE_BRANCH"
git pull origin "$BASE_BRANCH"
git branch -d "$BRANCH"
git push origin --delete "$BRANCH"   # usually automatic on GitHub
```

### Worktree cleanup (if used)
```bash
git worktree remove "../<repo>-[name]"
git worktree prune
```

## Completion Summary Template

Append to the branch plan before archiving:

```markdown
---

## Branch Completion Summary

**Completed**: YYYY-MM-DD
**Tasks Completed**: Y / Z (P%)
**Commits**: N
**Files Changed**: M

**Key Achievements:**
- …

**Deferred Items:**
- … (deferred to future work)
```

## Verification After Merge

1. [ ] PR merged to `$BASE_BRANCH`
2. [ ] Issue auto-closed (if "Fixes #XXX" was used)
3. [ ] Remote branch deleted
4. [ ] Branch plan archived
5. [ ] Project docs updated
6. [ ] Local branch deleted
7. [ ] Worktree removed (if applicable)

## Common Issues

**Branch still exists after merge:**
```bash
git branch -D "$BRANCH"   # force-delete local
git fetch --prune          # drop stale remote refs
```

**Issue not auto-closed:** the PR body must use a closing keyword — `Fixes #XXX`, `Closes #XXX`, or `Resolves #XXX`. `Related to #XXX` does **not** auto-close.
