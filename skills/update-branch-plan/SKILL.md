---
name: update-branch-plan
description: Update branch plan checkboxes based on recent work
user-invocable: true
argument-hint: Optional flags (--auto, --final, --interactive)
allowed-tools: ["Read", "Edit", "Write", "Bash", "Glob", "AskUserQuestion"]
disable-model-invocation: true
summary: Analyze recent commits and conservatively update a branch plan's checkboxes and phase status — marking tasks complete only at ≥80% confidence. Any repo.
example: "/update-branch-plan"
type: skill
category: workflow
platform: cross
portability: portable
publish: public
adaptation_notes: "Already generic — it operates on a markdown branch-plan doc (Docs/branches/<branch>.md, the convention issue-to-branch establishes) using checkbox/keyword matching. The only thing to localize is the base branch, which is auto-detected. Called automatically by smart-commit (--auto) and finish-branch (--final); usable standalone."
---

# Update Branch Plan — AI-Powered Checkbox Updates

Analyze recent commits and update a branch plan's checkboxes intelligently and conservatively. Repository-agnostic: it reads a markdown plan and matches commits to tasks; it never invents progress.

## Arguments
$ARGUMENTS

## Modes

| Mode | Usage | Behavior |
|---|---|---|
| **Default** | `update-branch-plan` | Analyze, propose, wait for approval |
| **Auto** | `--auto` | Non-interactive (used by `smart-commit`) |
| **Final** | `--final` | Branch completion — handle deferred tasks, add summary (used by `finish-branch`) |
| **Interactive** | `--interactive` | Manual task selection |

## Workflow

### Phase 1: Detect Branch, Base & Plan

```bash
BRANCH=$(git branch --show-current)
PLAN_FILE="Docs/branches/${BRANCH//\//-}.md"
[ -f "$PLAN_FILE" ] || { echo "No branch plan at $PLAN_FILE"; exit 0; }

# Base branch — auto-detect (used only as the fallback diff range below).
if git ls-remote --heads origin develop | grep -q .; then BASE_BRANCH=develop
else BASE_BRANCH=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p'); BASE_BRANCH=${BASE_BRANCH:-main}; fi
```

### Phase 2: Gather Context

```bash
# Commits since the plan was last touched (else since the base branch)
LAST=$(git log -1 --format=%H -- "$PLAN_FILE" 2>/dev/null || echo "")
if [ -n "$LAST" ]; then
  COMMITS=$(git log "$LAST..HEAD" --pretty=format:"- %h %s")
  FILES=$(git diff --name-only "$LAST..HEAD")
else
  COMMITS=$(git log "$BASE_BRANCH..HEAD" --pretty=format:"- %h %s")
  FILES=$(git diff --name-only "$BASE_BRANCH..HEAD")
fi

UNCHECKED=$(grep -n '\- \[ \]' "$PLAN_FILE")
CHECKED=$(grep -n '\- \[x\]' "$PLAN_FILE")
```

### Phase 3: AI Analysis

**For matching logic, read [`progress-tracking.md`](progress-tracking.md).**

For each commit: match to plan tasks by keyword, file path, and semantic similarity; mark complete only at **≥80% confidence**; update phase status (⏳ → ✅) when all of a phase's tasks are checked; generate a one-line reason for every proposed change.

### Phase 4: Present Changes (unless `--auto`)

**For the output template, read [`plan-templates.md`](plan-templates.md).** Ask (Header "Apply updates"): **Apply all (Recommended)** / **Review individually** / **Skip**.

### Phase 5: Apply Updates

Use the Edit tool: replace `- [ ] Task` with `- [x] Task` for matched tasks; update phase emojis.

### Phase 6: Commit (in its own commit)

```bash
git add "$PLAN_FILE"
git commit -m "Docs: Update branch plan checkboxes

- Marked N tasks complete
- Updated M phase statuses"
```

## Integration

- **Called by `smart-commit`** (`--auto`) after creating commits.
- **Called by `finish-branch`** (`--final`) before archiving.
- Usable standalone for a manual progress sweep.

## Conservative Principles

- Mark complete only at **≥80% confidence**.
- Leave unchecked when ambiguous.
- Provide a reason for every change.
- Keep plan updates in **separate** commits.

## Supporting Files
- [`progress-tracking.md`](progress-tracking.md) — commit→task matching, confidence rules, interactive & final modes.
- [`plan-templates.md`](plan-templates.md) — proposed-changes output, completion summary, error messages.
