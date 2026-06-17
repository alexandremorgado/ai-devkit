---
name: pr-partner
description: Review a pull request end-to-end — metadata and CI checks, code-risk analysis of the diff, triage of existing review comments, and a clear merge-readiness verdict (Ready / Needs work / Blocked). Works on any GitHub repo.
user-invocable: true
argument-hint: PR number or URL (defaults to the PR for the current branch)
allowed-tools: ["Bash", "Read", "Grep", "Glob", "Task", "WebFetch"]
summary: Review a PR end-to-end via gh — metadata/CI checks, diff risk analysis, review-comment triage, and a Ready / Needs work / Blocked verdict with rationale. Any GitHub repo.
example: "/pr-partner 482"
type: skill
category: workflow
platform: cross
portability: adaptable
publish: public
adaptation_notes: "Adapt the risk checklist and the required-checks list to your stack and CI. The gh-based metadata, diff, checks, and comment-triage steps are portable. The verdict thresholds (size bands, required green checks) are conventions — tune them to your team's PR norms."
---

# PR Partner

Review a pull request the way a thorough teammate would: confirm the metadata and CI are sane, read the diff for real risk, triage what reviewers have already raised, then deliver an honest merge-readiness verdict with reasons. Repository-agnostic — it operates on whatever GitHub repo you're in.

## Target PR (optional):
$ARGUMENTS

## Workflow

### Phase 1: Load the PR

```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# PR number from the argument, else the PR open for the current branch.
PR="$ARGUMENTS"
[ -z "$PR" ] && PR=$(gh pr view --json number -q .number 2>/dev/null)
[ -z "$PR" ] && { echo "No PR specified and none open for this branch."; exit 1; }

gh pr view "$PR" --repo "$REPO" \
  --json number,title,body,author,baseRefName,headRefName,additions,deletions,changedFiles,labels,isDraft,mergeable,reviewDecision
```

### Phase 2: Metadata Assessment

Judge the framing before the code:
- **Title** — clear, specific, conventionally prefixed? Vague titles ("fixes", "updates") are a smell.
- **Description** — explains *what* and *why*; reproduction or before/after where relevant.
- **Linked issue** — does the body reference one (`Fixes #NN` / `Closes #NN`)? Flag if none and the change is non-trivial.
- **Size** — small PRs review better. Band it:

```bash
# Total churn from the JSON above (additions + deletions).
# < 200 lines: small · 200–600: medium · > 600: large (consider splitting / extra scrutiny)
```

- **Draft / mergeable** — a draft is not for final verdict; `mergeable: CONFLICTING` is an automatic blocker.

### Phase 3: CI / Checks

```bash
gh pr checks "$PR" --repo "$REPO"        # status of every check run
```

- All required checks green → good. Any **failing** required check → **Blocked** until fixed.
- Pending/queued → note it; the verdict is provisional until they finish.
- Adapt *which* checks are required to your CI (lint, tests, build, type-check, security scan).

### Phase 4: Diff Risk Analysis

```bash
gh pr diff "$PR" --repo "$REPO"          # the full diff
gh pr diff "$PR" --repo "$REPO" --name-only | sort   # touched files at a glance
```

Read the diff against a risk checklist (adapt to your stack):
- **Correctness** — logic that looks wrong, off-by-one, unhandled `null`/error/empty cases, mismatched types.
- **Tests** — does new/changed behavior come with tests? Are edge cases covered, or only the happy path?
- **Security** — secrets or tokens committed, unvalidated input, injection surface, broadened auth/permissions, unsafe deserialization.
- **Scope creep** — unrelated changes bundled in; drive-by refactors mixed with the feature; touched files outside the PR's stated purpose.
- **Maintainability** — dead code, copy-paste, leftover debug output, `TODO`/`FIXME` introduced, public API changed without docs.
- **Migrations / breaking changes** — schema/contract/config changes that need coordination, backfill, or a rollout note.

```bash
# Quick scans on the diff (language-agnostic signals):
gh pr diff "$PR" --repo "$REPO" | grep -nE 'TODO|FIXME|XXX|HACK'
gh pr diff "$PR" --repo "$REPO" | grep -niE 'password|secret|api[_-]?key|token|BEGIN [A-Z]+ PRIVATE KEY'
```

For anything that needs codebase context (does this caller exist? is this pattern used elsewhere?), use the Task tool to investigate rather than guessing from the diff alone.

### Phase 5: Triage Existing Review Threads

```bash
# Unresolved review comments + their state.
gh api "repos/$REPO/pulls/$PR/comments" --jq '.[] | {path, line, user: .user.login, body}'
gh pr view "$PR" --repo "$REPO" --json reviews -q '.reviews[] | {user: .author.login, state: .state}'
```

Bucket each open thread:
- **Must-fix** — correctness/security/test gap raised by a reviewer and still open.
- **Should-address** — style/maintainability worth resolving but not blocking.
- **Resolved / answered** — already handled; note so the verdict doesn't double-count it.
- **Stale** — outdated by later commits; flag for the author to resolve.

### Phase 6: Verdict

Synthesize everything into one of three calls, **with rationale** — never just a label:

```
┌──────────────────────────────────────────────────────────────┐
│ PR #482 · "Add rate limiting to the API client"               │
├──────────────────────────────────────────────────────────────┤
│ VERDICT   🟡 Needs work                                       │
│ SIZE      medium (+310 / −44, 9 files)                        │
│ CI        ✅ all required checks green                        │
│ RISK      ⚠️ no tests for the 429-retry path                  │
│ THREADS   2 must-fix · 1 should-address · 3 resolved          │
│ ISSUE     ✅ Fixes #455                                       │
└──────────────────────────────────────────────────────────────┘
```

Verdict rules:
- **🟢 Ready** — required checks green, no must-fix risks, tests cover the change, no unresolved blocking threads, no conflicts.
- **🟡 Needs work** — mergeable in principle but has fixable gaps (missing tests, open should/must-fix threads, scope creep to trim). List each item concretely.
- **🔴 Blocked** — failing required checks, merge conflicts, a correctness/security defect, or a missing prerequisite. State the blocker explicitly.

Close with a short, prioritized action list ("To reach Ready: 1) …, 2) …"). This skill **reviews and advises** — it does not merge.

## Quick Reference

### Verdict at a glance
| Verdict | Meaning |
|---|---|
| 🟢 Ready | Green CI, tested, no blocking threads, no conflicts |
| 🟡 Needs work | Mergeable but has fixable gaps — list them |
| 🔴 Blocked | Failing checks, conflicts, or a real defect |

### Risk checklist (adapt to your stack)
Correctness · Tests · Security · Scope creep · Maintainability · Migrations/breaking changes.

### Handy `gh`
`gh pr view <n> --json …` (metadata) · `gh pr checks <n>` (CI) · `gh pr diff <n>` (`--name-only` for files) · `gh api repos/OWNER/REPO/pulls/<n>/comments` (review threads).
