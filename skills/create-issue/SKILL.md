---
name: create-issue
description: Create a well-structured GitHub issue with AI-inferred type, labels, and duplicate detection. Works on any GitHub repository.
user-invocable: true
argument-hint: Brief description of the issue
allowed-tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "Task", "WebFetch"]
summary: Create a well-structured GitHub issue with AI-inferred type, labels, and duplicate detection via gh — on any repo.
example: "/create-issue the favorites list flashes when you filter by date"
type: skill
category: workflow
platform: cross
portability: portable
publish: public
adaptation_notes: "Already generic — it auto-detects the current repo and reads that repo's existing labels, so it works as-is. To tune it, adjust the label taxonomy in the Quick Reference and the issue template fields to match your team's conventions."
---

# Create GitHub Issue

Create a well-structured GitHub issue with AI-powered code analysis and comprehensive details. Repository-agnostic: it operates on whatever repo you're in and adapts to that repo's existing labels.

## Brief Issue Description:
$ARGUMENTS

## Workflow

### Phase 1: Initial Context Analysis

```bash
# Operate on the current repo (inferred from the local git remote)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Fetch the repo's existing labels so we match its taxonomy, not a hardcoded one
gh label list --repo "$REPO" --json name,description
```

**AI Analysis** — infer from the description:
- **Issue type**: detect keywords (fails, error, crash → bug; add, implement, support → feature; update, refactor, docs).
- **Affected components**: search the codebase for mentioned files/modules/symbols.
- **Priority**: from keywords (critical, blocks, urgent vs minor, nice-to-have).
- **Category labels**: match against the repo's existing labels fetched above.

Present the AI-inferred details for confirmation before creating anything.

### Phase 2: Duplicate Detection

**For detailed patterns, read**: `issue-templates.md`

```bash
SLUG=$(echo "$REPO" | tr '/' '-')
CACHE_FILE="/tmp/gh-issues-open-$SLUG.json"
# Portable mtime: GNU `stat -c %Y` (Linux), else BSD `stat -f %m` (macOS), else 0.
file_mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || echo 0; }
if [ ! -f "$CACHE_FILE" ] || [ "$(( $(date +%s) - $(file_mtime "$CACHE_FILE") ))" -gt 300 ]; then
    gh issue list --repo "$REPO" --state open --limit 100 --json number,title,body,labels > "$CACHE_FILE"
fi
gh search issues "keywords" --repo "$REPO" --limit 20
```

**Duplicate criteria**: title similarity >80%, same error message, identical affected components, created within the last 7 days. **If duplicates found**, offer: comment on the existing issue, reopen if closed, or create new (with justification).

### Phase 3: Codebase Analysis

Use the Task tool to investigate: search for mentioned classes/methods/errors, trace dependencies, find TODOs in affected areas, check test coverage, and extract relevant snippets.

### Phase 4: Label Management

**For detailed labeling rules, read**: `labeling-guide.md`

1. Match existing labels first (fuzzy matching against the repo's set).
2. Create new labels only when justified.
3. Follow naming conventions (lowercase, hyphenated).

### Phase 5: Generate Issue

**For templates, read**: `issue-templates.md`

```bash
# Create a label only if the repo lacks a suitable one
gh label create "new-label" --repo "$REPO" --description "Description" --color "hexcode"

gh issue create --repo "$REPO" \
    --title "Clear, searchable title" \
    --body "Detailed description" \
    --label "label1,label2"
```

## Issue Description Template

```markdown
**Summary**
[Brief problem/request summary]

**Context**
[Background information]

**Steps to Reproduce** (for bugs)
1. Step 1
2. Step 2

**Expected Behavior**
[What should happen]

**Actual Behavior**
[What actually happens]

**Environment** (fill in what's relevant to this project)
- Platform / runtime / version:
- OS / device / browser:
- Build or release:

**Code Analysis**
[Relevant code snippets, file:line references]

**Impact**
[User/system impact]

**Suggested Solutions**
[Potential approaches]

**Acceptance Criteria**
- [ ] Criterion 1
- [ ] Criterion 2

**Related Issues**
- #XXX (related)
```

## Quick Reference

### Common label categories (adapt to your repo)
- **Type**: bug, enhancement, feature, documentation, chore
- **Priority**: critical, high-priority, medium-priority, low-priority
- **Area**: match the repo's existing area/component labels
- **Status**: needs-triage, blocked, in-progress

### When to create a new label
- A technology/area the repo doesn't yet label.
- A recurring category worth tracking.
- Keep names lowercase and hyphenated; prefer reusing existing labels.

## Supporting Files
- `issue-templates.md` — bug/feature/task templates
- `labeling-guide.md` — label conventions and assignment rules
