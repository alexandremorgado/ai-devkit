# PR Creation Patterns

Templates and `gh` commands for creating and updating pull requests. All examples target `$BASE_BRANCH` (detected in the skill, not hardcoded).

## PR Description Template

```markdown
## Summary
[1–3 bullets describing what this PR does]

## Changes
- [Specific changes]
- [Files / modules affected]

## Testing
- [How it was tested; key test names; pass rate]

## Related Issues
Fixes #XXX   (use "Relates to #XXX" if it should NOT auto-close)
```

## GitHub CLI

### Create
```bash
gh pr create \
  --head "$BRANCH" \
  --base "$BASE_BRANCH" \
  --title "Clear, descriptive title" \
  --body "$(cat <<'EOF'
## Summary
- Brief description

## Changes
- Specific changes

## Testing
- Test approach and result

## Related Issues
Fixes #XXX
EOF
)"
```

### Update
```bash
gh pr edit "$PR_NUMBER" --title "Updated title" --body "Updated body"
```

### Confirm the PR targets the intended base
```bash
TARGET=$(gh pr view "$PR_NUMBER" --json baseRefName -q .baseRefName)
[ "$TARGET" != "$BASE_BRANCH" ] && echo "Warning: PR targets '$TARGET', expected '$BASE_BRANCH'"
```

## Readiness Report Format

```
┌──────────────────────────────────────────────────────────────┐
│ BRANCH READINESS · [name]                     Stage: [stage]  │
├──────────────────────────────────────────────────────────────┤
│ PLAN     XX% complete (Y/Z tasks)                            │
│ TESTS    ✅/⚠️  N test commits · M test files                 │
│ HYGIENE  ✅/⚠️  debug prints · blocking TODOs                 │
│ BLOCKERS [specific blockers, if any]                         │
└──────────────────────────────────────────────────────────────┘
```

## Branch Stage Detection

| Completion | Stage | Indicator |
|---|---|---|
| ≥90% | Late | 🎯 Ready for PR |
| 50–89% | Mid | 🔧 In development |
| <50% | Early | 🌱 Just started |

## Issue Detection Methods

1. **Git config:** `git config "branch.$BRANCH.issue"`
2. **Branch name:** parse an `issue-123-*` / `123-*` pattern
3. **Commit search:** `git log "$BASE_BRANCH..HEAD" | grep -oE '#[0-9]+'`

## Wiring Validation (generic)

Before opening the PR, sanity-check that new source has been wired into the build/manifest — the equivalent of "did you register the new module?":

```bash
# New top-level source dirs added on this branch:
git diff "$BASE_BRANCH..HEAD" --name-only --diff-filter=A | sed -n 's#^\(src\|lib\|pkg\|app\)/\([^/]*\)/.*#\2#p' | sort -u
# For each, confirm it's referenced by the build/manifest (package.json, go.mod, Package.swift,
# build.gradle, CMakeLists, etc.) — flag any that aren't.
```

## User Decision Points (stay within the 2-question budget)

**No test evidence** — Header "No tests": `Run ensure-tests first (Recommended)` / `Proceed without` / `Abort`.

**Incomplete work** — Header "Incomplete": `Complete tasks first (Recommended)` / `Proceed with partial` / `Mark tasks deferred`.
