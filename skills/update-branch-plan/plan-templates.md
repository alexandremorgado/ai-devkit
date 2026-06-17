# Plan Templates

Output formats and documentation templates for branch-plan updates.

## Proposed Changes Output

```
📝 Proposed Branch Plan Updates
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on N commits since the last update:

TASK UPDATES (M):

1. ☑️ Phase 1 · line 123
   FROM: - [ ] Add payment-intent creation
   TO:   - [x] Add payment-intent creation
   WHY:  commit abc1234 "Feat: Implement payment-intent creation" changed
         payments/intent.ts. High confidence.

PHASE STATUS (K):

1. Phase 1 — Checkout
   FROM: ⏳ In Progress
   TO:   ✅ Complete
   WHY:  all tasks in this phase are now checked.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Update Summary

```
📊 Summary:
  - Tasks marked complete: N
  - Phases completed: M
  - Commits analyzed: K

Review: git show HEAD
```

## Completion Summary (`--final`)

Append to the plan file:

```markdown
---

## Branch Completion Summary

**Completed**: YYYY-MM-DD
**Tasks Completed**: Y / Z (P%)
**Commits**: N
**Files Changed**: M

**Key Achievements:**
- [generated from completed tasks]

**Deferred Items:**
- [unchecked tasks marked deferred]
```

## Error Messages

**No branch plan found:**
```
ℹ️  No branch plan at Docs/branches/<branch>.md
This skill only works with branches that keep a plan doc.
```

**No recent commits:**
```
ℹ️  No commits since the last plan update — the plan is up to date.
```

**Parsing issue:**
```
⚠️ Could not parse the checkbox on line 123 (expected "- [ ]" or "- [x]"). Skipping; check it manually.
```

**Ambiguous match:**
```
🤔 Commit a7f3d2 "Add video support" could match:
  1. line 89  - [ ] Add player implementation
  2. line 145 - [ ] Integrate player with billing
Which should be marked complete? (1 / 2 / neither / both)
```
