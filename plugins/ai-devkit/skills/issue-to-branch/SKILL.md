---
name: issue-to-branch
description: Create a GitHub branch (or isolated worktree) from an issue with a comprehensive, project-aware development plan. Works on any GitHub repository.
user-invocable: true
argument-hint: GitHub issue (#123 or URL), or text description (e.g., 'fix typo in login screen'). Add --worktree for isolated worktree.
allowed-tools: ["Bash", "Read", "Write", "Edit", "TodoWrite", "WebFetch", "Grep", "Task", "AskUserQuestion"]
disable-model-invocation: true
summary: Turn a GitHub issue (or a text description) into a branch or isolated worktree with an AI-generated development plan — on any repo.
example: "/issue-to-branch #482"
type: skill
category: workflow
platform: cross
portability: portable
publish: public
adaptation_notes: "Already generic — it auto-detects the current repo via gh and infers project context from the repo's own files. To tune it, adapt your team's branch-prefix conventions, the default base branch, and the build/test steps embedded in the generated plan to match your stack."
---

# Create Branch from GitHub Issue

Create a GitHub branch with AI-powered development planning. Supports both regular branches and isolated worktrees. Repository-agnostic: it operates on whatever repo you're in, auto-detecting the remote and inferring the project's conventions from its own files.

## Issue Reference
$ARGUMENTS

## Mode Detection

```bash
if [[ "$ARGUMENTS" == *"--worktree"* ]]; then
    WORKTREE_MODE=true
    ARGS="${ARGUMENTS//--worktree/}"
else
    WORKTREE_MODE=false
    ARGS="$ARGUMENTS"
fi

# Trim leading/trailing whitespace after optional flag stripping.
ARGS="${ARGS#"${ARGS%%[![:space:]]*}"}"
ARGS="${ARGS%"${ARGS##*[![:space:]]}"}"
```

**Regular mode**: Creates a local branch from the repo's default base branch
**Worktree mode** (`--worktree`): Creates an isolated worktree alongside the repo (e.g. `../<repo>-[name]`)

## Resolve the Base Branch

Don't hardcode `develop` or `main`. Detect the repo's integration branch, falling back to its
default branch:

```bash
# Prefer an explicit integration branch if the repo uses one, else the remote default
if git ls-remote --heads origin develop | grep -q .; then
    BASE_BRANCH="develop"
else
    BASE_BRANCH=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')
    BASE_BRANCH="${BASE_BRANCH:-main}"
fi
```

Use `origin/$BASE_BRANCH` everywhere a base ref is needed below, and target `$BASE_BRANCH` when
opening the eventual PR. Adapt this to your team's convention if it differs (some orgs branch from
`main` directly; others use `develop`, `trunk`, etc.).

## Critical Principle

The generated development plan is a **research-backed hypothesis**. When you begin implementation:
- **Re-evaluate every assumption** - Context changes, better solutions emerge
- **Challenge the proposed architecture** - Initial analysis has blindspots
- **Update the plan freely** - It should evolve as you learn

## Workflow

### Phase 1: Parse Input & Route

```bash
# Detect --simple flag (backward compat)
if [[ "$ARGS" == --simple* ]]; then
    ARGS="${ARGS#--simple}"
    ARGS="${ARGS#"${ARGS%%[![:space:]]*}"}"
    SIMPLE_MODE=true
elif [[ "$ARGS" =~ github\.com/.*/issues/([0-9]+) ]]; then
    ISSUE_NUMBER="${BASH_REMATCH[1]}"
    SIMPLE_MODE=false
elif [[ "$ARGS" =~ ^#?([0-9]+)$ ]]; then
    ISSUE_NUMBER="${BASH_REMATCH[1]}"
    SIMPLE_MODE=false
elif [[ -n "$ARGS" ]]; then
    # Plain text description → simple branch mode
    SIMPLE_MODE=true
else
    echo "Error: Provide an issue reference (#123 or URL) or a text description"
    exit 1
fi
```

**If `SIMPLE_MODE=true`**: Read and follow `simple-branch.md` using `$ARGS` as the description. `$WORKTREE_MODE` carries over. **Skip all phases below.**

**If `SIMPLE_MODE=false`**: Continue with issue workflow (Phases 2-9).

### Phase 2: Fetch Issue Details and Comments

```bash
# Check GitHub CLI authentication
if ! gh auth status >/dev/null 2>&1; then
    echo "Error: Not authenticated. Run: gh auth login"
    exit 1
fi

# Detect the current repo (works on any GitHub repository)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Fetch issue details
ISSUE_DATA=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json number,title,body,labels,state 2>/dev/null)
ISSUE_TITLE=$(echo "$ISSUE_DATA" | jq -r '.title')
ISSUE_BODY=$(echo "$ISSUE_DATA" | jq -r '.body // ""' | head -c 10000)
ISSUE_STATE=$(echo "$ISSUE_DATA" | jq -r '.state')

# Fetch issue comments
COMMENTS_JSON=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json comments --jq '.comments' 2>/dev/null)
if [ -n "$COMMENTS_JSON" ] && [ "$COMMENTS_JSON" != "[]" ]; then
    ISSUE_COMMENTS=$(echo "$COMMENTS_JSON" | jq -r '.[] | "Comment by @\(.author.login):\n\(.body)\n"' | head -c 20000)
fi
```

### Phase 3: Generate Semantic Branch Name

```bash
# Generate semantic name from issue title
SEMANTIC_NAME=$(echo "$ISSUE_TITLE" | tr '[:upper:]' '[:lower:]' | \
    sed -E 's/[^a-z0-9 -]//g' | \
    sed -E 's/\b(a|an|the|for|with|in|of|on|at|to|from|by|and|or)\b//g' | \
    sed -E 's/  +/ /g' | \
    cut -d' ' -f1-4 | \
    tr ' ' '-')

BRANCH_NAME="feature/$SEMANTIC_NAME"

# Validate and check existence. Truncate to a clean kebab boundary — a trailing "." or ".."
# is an invalid git ref, so trim trailing separators instead of appending an ellipsis.
if [ ${#BRANCH_NAME} -gt 63 ]; then
    BRANCH_NAME=$(printf '%s' "${BRANCH_NAME:0:60}" | sed -E 's/[-.]+$//')
fi

if git ls-remote --heads origin "$BRANCH_NAME" | grep -q .; then
    echo "Error: Branch '$BRANCH_NAME' already exists on remote"
    exit 1
fi
```

### Phase 4: Complexity Assessment

Evaluate issue complexity:
- **Simple tasks** (bug fixes, typos, single commands): Skip documentation
- **Complex features**: Proceed with comprehensive analysis

Detect if issue needs clarification:
- Has `feature`/`enhancement` label
- Body >500 chars
- Contains `refactor`/`redesign`/`overhaul`
- Multiple phases mentioned

**For complex issues**: Use AskUserQuestion for scope, constraints, preferences, success criteria.

### Phase 5: Codebase Analysis

For complex features, use the Task tool with an Explore agent to analyze:
- Relevant files/modules mentioned in the issue
- Existing implementations and the patterns they follow
- Integration points and dependencies

**Read supporting files for detailed analysis patterns:**
- `project-context.md` - How to infer this repo's architecture and conventions from its own files
- `development-plan.md` - Plan template and patterns

### Phase 6: Create Branch or Worktree

```bash
# Save current branch
PREVIOUS_BRANCH=$(git branch --show-current)
git fetch origin
```

**Regular mode**:
```bash
git checkout -b "$BRANCH_NAME" "origin/$BASE_BRANCH"

# CRITICAL: Clear upstream tracking to prevent accidental pushes to the base branch
git branch --unset-upstream
```

**Worktree mode** (optional, for parallel development) — Regular mode above is self-contained; worktree mode delegates its safety/setup mechanics to a **separate `worktree` skill that is not bundled in this repo**. Install/adapt that skill alongside this one to use this mode, or stick with Regular mode. Core mechanics:
```bash
REPO_DIRNAME=$(basename "$(git rev-parse --show-toplevel)")
NAME_PART=$(echo "$SEMANTIC_NAME" | cut -d'-' -f1-3)
WORKTREE_DIR="../${REPO_DIRNAME}-${NAME_PART}"
git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" "origin/$BASE_BRANCH"
```
If you have the `worktree` skill, also run its pre-flight checks (uncommitted changes, nested worktree, target dir exists) and its config-setup step — copy any gitignored config/env files the new working copy needs and run the project's bootstrap/install step so the worktree builds.

### Phase 7: Store Issue Metadata

```bash
# Store issue metadata for PR linking (works in both modes)
REPO_URL=$(git remote get-url origin | sed 's/\.git$//' | sed 's/git@github.com:/https:\/\/github.com\//')
git config "branch.$BRANCH_NAME.issue" "$ISSUE_NUMBER"
git config "branch.$BRANCH_NAME.issueUrl" "$REPO_URL/issues/$ISSUE_NUMBER"
git config "branch.$BRANCH_NAME.issueTitle" "$ISSUE_TITLE"
```

**Verify metadata was stored** (all three must succeed):
```bash
git config --get "branch.$BRANCH_NAME.issue" || echo "ERROR: Failed to store issue number"
git config --get "branch.$BRANCH_NAME.issueUrl" || echo "ERROR: Failed to store issue URL"
```

### Phase 8: Generate & Commit Development Plan

**CRITICAL**: The plan must be committed immediately — not just staged. A staged-only plan
is lost if any subsequent phase errors, resets staging, or the session ends unexpectedly.

For complex features, create documentation:

```bash
# Determine correct working directory
if [ "$WORKTREE_MODE" = true ]; then
    WORK_DIR="$WORKTREE_DIR"
else
    WORK_DIR="."
fi

mkdir -p "$WORK_DIR/Docs/branches"
DOC_FILENAME="Docs/branches/${BRANCH_NAME//\//-}.md"
```

Create plan using template from `development-plan.md`.

**Commit the plan immediately** — it's a hypothesis that will evolve during implementation:
```bash
git -C "$WORK_DIR" add "$DOC_FILENAME"
git -C "$WORK_DIR" commit -m "Docs: Add development plan for #$ISSUE_NUMBER"
```

**Verify the plan was committed** (gate — do not continue silently if this fails):
```bash
if ! git -C "$WORK_DIR" log -1 --format=%s | grep -q "development plan"; then
    echo "ERROR: Branch plan was NOT committed. Check $DOC_FILENAME exists and retry."
fi
```

### Phase 9: Move Issue to "In Progress" on a Project Board (optional)

If the repo's org uses a GitHub Projects (v2) board with a "Status" field, update the issue's status
to its in-progress state. This phase is **optional and non-blocking** — failure (or the absence of a
board) does not affect the branch or plan. Skip it entirely if the project doesn't use Projects.

The org owner, project number, field ID, and option ID are project-specific and must be discovered
at runtime — do not hardcode them. Discover them like so, then perform the edit:

```bash
OWNER=$(echo "$REPO" | cut -d/ -f1)

# 1. List the org's projects to find the relevant project NUMBER
gh project list --owner "$OWNER" --format json

# 2. For that project number, discover the Status field ID and its option IDs
#    (look for the single-select field named "Status" and its "In Progress" option)
gh project field-list <PROJECT_NUMBER> --owner "$OWNER" --format json

# 3. Find this issue's item ID on the board
ITEM_ID=$(gh project item-list <PROJECT_NUMBER> --owner "$OWNER" --format json --limit 200 2>/dev/null | \
    jq -r ".items[] | select(.content.number == $ISSUE_NUMBER) | .id")

# 4. Move it to "In Progress" using the IDs discovered above
if [ -n "$ITEM_ID" ] && [ "$ITEM_ID" != "null" ]; then
    gh project item-edit \
        --project-id "<PROJECT_ID>" \
        --id "$ITEM_ID" \
        --field-id "<STATUS_FIELD_ID>" \
        --single-select-option-id "<IN_PROGRESS_OPTION_ID>" 2>&1
    echo "Moved issue #$ISSUE_NUMBER to 'In Progress' on project board"
else
    echo "Note: Issue #$ISSUE_NUMBER not on a project board (or no board in use). Skipping."
fi
```

### Phase 10: Summary

**Validate before printing summary** — confirm critical outputs exist:
```bash
PLAN_FILE="$WORK_DIR/Docs/branches/${BRANCH_NAME//\//-}.md"
PLAN_OK=$(test -f "$PLAN_FILE" && echo "yes" || echo "no")
META_OK=$(git config --get "branch.$BRANCH_NAME.issue" >/dev/null 2>&1 && echo "yes" || echo "no")
```

**Regular mode**:
```
Branch: feature/[name]
Plan: Docs/branches/feature-[name].md (committed) [$PLAN_OK]
Issue metadata: [$META_OK]

Next steps:
1. Review the development plan — update freely as you implement
2. First push: git push -u origin feature/[name]
```

**Worktree mode**:
```
Branch: feature/[name]
Worktree: ../<repo>-[name]
Plan: Docs/branches/feature-[name].md (committed) [$PLAN_OK]
Issue metadata: [$META_OK]

Next steps:
1. cd ../<repo>-[name]
2. Review the development plan — update freely as you implement
3. First push: git push -u origin feature/[name]
4. Open the project in your editor/IDE
```

**If any check failed, print a warning block:**
```
⚠️  POST-CREATION ISSUES:
- Plan not committed: [reason]
- Issue metadata missing: [reason]
- Project board not updated: [reason]
```

## Benefits

- **AI-Powered Planning**: Comprehensive codebase analysis
- **Complete Issue Context**: Includes discussion comments
- **Semantic Naming**: Meaningful, searchable branch names
- **PR Auto-Linking**: Issue metadata enables automatic PR linking via `/finish-branch`
- **Project Board Sync**: Automatically moves issue to "In Progress" on GitHub project board
- **Worktree Support**: Parallel development without branch switching

## Error Handling

| Error | Solution |
|-------|----------|
| No GitHub Auth | `gh auth login` |
| Issue Not Found | Check issue number |
| Branch Exists | Suggest alternatives |
| Worktree dir exists | Remove with `git worktree remove ../<repo>-[name]` |

## Alternate Workflows

### Simple Branch (No Issue)
Quick branch creation without GitHub issue analysis — just provide a text description:
```
/issue-to-branch fix typo in login screen
/issue-to-branch add CSV export endpoint
/issue-to-branch --simple  # (analyzes current changes, no description)
```

**For simple branch workflow, read**: `simple-branch.md`

Plain text that doesn't match a GitHub issue reference (`#123` or URL) automatically routes to the simple branch workflow. The `--simple` flag is still supported for backward compatibility and for the no-description variant.

## Supporting Files

For detailed templates and patterns, read:
- `simple-branch.md` - Quick branch creation without issue
- `development-plan.md` - Branch documentation template
- `project-context.md` - How to infer a repo's architecture and conventions for the plan
