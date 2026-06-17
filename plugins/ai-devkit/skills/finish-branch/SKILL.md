---
name: finish-branch
description: Complete a feature branch — validate readiness (plan %, test evidence, code hygiene), run tests/build, finalize and archive the branch plan, then create or update the PR against the base branch. Works on any GitHub repo.
user-invocable: true
argument-hint: Optional branch name (defaults to current branch)
allowed-tools: ["Bash", "Read", "Write", "Edit", "WebFetch", "AskUserQuestion"]
disable-model-invocation: true
summary: Validate a feature branch's readiness (plan %, tests, hygiene), finalize and archive its plan, then create or update a PR against the base branch — on any GitHub repo.
example: "/finish-branch"
type: skill
category: workflow
platform: cross
portability: adaptable
publish: public
adaptation_notes: "Auto-detects the base branch (don't hardcode develop/main) and the test/build command — keep both. The plan-completion checkbox counting, test-evidence detection, and hygiene scan are generic; swap the example debug-print and test-file patterns for your language's. Archives the branch plan to Docs/archived/YEAR. Delegates plan finalization to the optional sibling skill update-branch-plan (--final); if it isn't installed, the inline 'finalize plan' step still runs. Question budget: 2."
---

# Finish Branch

Complete the current feature branch by validating it, finalizing its documentation, and creating/updating its PR. Repository-agnostic: it detects the base branch and the test command instead of assuming them.

## Target Branch:
$ARGUMENTS

## Execution Philosophy

**Be proactive, not interrogative:**
- Gather evidence automatically before any user interaction.
- Present findings as a summary, not a quiz.
- Only ask for genuinely critical decisions.

**Question budget: 2 per run.**

## Workflow

### Phase 1: Branch Status & Base Detection

```bash
BRANCH=${ARGUMENTS:-$(git branch --show-current)}
PLAN_FILE="Docs/branches/${BRANCH//\//-}.md"

# Base branch — detect once, reuse everywhere (diff ranges, PR base, issue search).
if git ls-remote --heads origin develop | grep -q .; then BASE_BRANCH=develop
else BASE_BRANCH=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p'); BASE_BRANCH=${BASE_BRANCH:-main}; fi

git status --short          # uncommitted changes?
git branch -vv | grep '^\*' # tracking?
```

### Phase 2: Readiness Analysis

**For detailed patterns, read [`pr-creation.md`](pr-creation.md).**

```bash
# Plan completion (checkbox counting — language-agnostic)
if [ -f "$PLAN_FILE" ]; then
  CHECKED=$(grep -c '\- \[x\]' "$PLAN_FILE" 2>/dev/null || echo 0)
  UNCHECKED=$(grep -c '\- \[ \]' "$PLAN_FILE" 2>/dev/null || echo 0)
  TOTAL=$((CHECKED + UNCHECKED)); COMPLETION=$((TOTAL > 0 ? CHECKED * 100 / TOTAL : 0))
fi

# Test evidence (commits + changed test files — adapt the test-file glob to your stack)
TEST_COMMITS=$(git log "$BASE_BRANCH..HEAD" --oneline --grep="^Test:" | wc -l | tr -d ' ')
TEST_FILES=$(git diff "$BASE_BRANCH..HEAD" --name-only | grep -Eic '(\.test\.|\.spec\.|_test\.|Tests?\.|test_)' || echo 0)

# Code hygiene (multi-language debug prints + leftover markers)
DEBUG_CODE=$(git diff "$BASE_BRANCH..HEAD" | grep -Eic 'console\.log\(|[^a-zA-Z]print\(|println!|fmt\.Print|System\.out\.print|debugPrint\(|dump\(' || echo 0)
TODOS=$(git diff "$BASE_BRANCH..HEAD" | grep -Ec 'TODO|FIXME|XXX|HACK' || echo 0)
```

Display a readiness report:
```
┌──────────────────────────────────────────────────────────────┐
│ BRANCH READINESS · feature/example            Stage: Late 🎯  │
├──────────────────────────────────────────────────────────────┤
│ PLAN     87% complete (26/30 tasks)                          │
│ TESTS    ✅ 3 test commits · 2 test files changed             │
│ HYGIENE  ✅ no debug prints · no blocking TODOs               │
│ BLOCKERS ⚠️  3 unchecked tasks in Phase 5                     │
└──────────────────────────────────────────────────────────────┘
```

### Phase 3: Test & Build Validation

Run the project's own test command (detect it the same way `ensure-tests` does — CI workflow first, then the manifest/Makefile). Don't hardcode a toolchain.

```bash
# Replace with the detected command, e.g. npm test · pytest -q · go test ./... · ./gradlew test
$TEST_CMD
```

If tests fail or coverage is thin, prefer running the `ensure-tests` skill before continuing.

### Phase 4: Documentation Finalization

**For the full checklist, read [`cleanup-checklist.md`](cleanup-checklist.md).**

1. **Finalize the branch plan** — run the `update-branch-plan` skill in `--final` mode if installed; otherwise mark remaining completed tasks, append a brief completion summary, and note any deferred items inline.
2. **Update project docs** — agent-guidance files (CLAUDE.md/AGENTS.md), architecture/overview docs, milestones.
3. **Archive the branch plan:**

```bash
if [ -f "$PLAN_FILE" ]; then
  YEAR=$(date +%Y); mkdir -p "Docs/archived/$YEAR"
  git mv "$PLAN_FILE" "Docs/archived/$YEAR/"
  git commit -m "Docs: Archive branch plan for $BRANCH"
fi
```

### Phase 5: Linked Issue Detection

```bash
ISSUE_NUM=$(git config "branch.$BRANCH.issue" 2>/dev/null)
[ -z "$ISSUE_NUM" ] && ISSUE_NUM=$(git log "$BASE_BRANCH..HEAD" --oneline | grep -oE '#[0-9]+' | head -1 | tr -d '#')
# Also check the branch name for an issue-123-* pattern.
```

### Phase 6: PR Management

**For PR templates, read [`pr-creation.md`](pr-creation.md).**

```bash
EXISTING_PR=$(gh pr list --head "$BRANCH" --json number -q '.[0].number')

if [ -n "$EXISTING_PR" ]; then
  echo "PR #$EXISTING_PR exists — updating its body."
  gh pr edit "$EXISTING_PR" --body "$(generate_pr_body)"
else
  gh pr create --head "$BRANCH" --base "$BASE_BRANCH" \
    --title "Clear, descriptive title" \
    --body "$(generate_pr_body)"   # include 'Fixes #ISSUE_NUM' when an issue is linked
fi
```

## Completion Checklist

- [ ] Working tree clean (or only the plan-archive commit pending)
- [ ] Readiness passed (plan ≥90%, test evidence, no debug code)
- [ ] All tests pass / build succeeds
- [ ] Branch plan finalized
- [ ] Branch plan archived to `Docs/archived/YEAR/`
- [ ] PR created/updated against `$BASE_BRANCH`
- [ ] Issue reference included (if applicable)

## Decision Logic

**Proceed automatically when ALL of:** plan ≥90% · test evidence exists · no blocking TODOs or debug code.

**Ask the user ONLY when** (within the 2-question budget):
- No test evidence → "Run ensure-tests first?"
- Incomplete work (2+ unchecked tasks) → "Complete tasks first, or defer them?"
- Hygiene issues found → "Clean up first, or proceed?"

## Supporting Files
- [`pr-creation.md`](pr-creation.md) — PR templates, `gh` commands, readiness-report and stage-detection tables.
- [`cleanup-checklist.md`](cleanup-checklist.md) — doc finalization, archival, and post-merge cleanup.
