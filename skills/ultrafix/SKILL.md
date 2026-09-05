---
name: ultrafix
description: Debug a stubborn bug with bounded diagnosis and a minimal verified fix; use isolated git worktrees for parallel hypotheses only when useful and authorized, with focused debug logging. Works on any repo.
user-invocable: true
argument-hint: Description of the bug (symptoms, when it happens, what you've tried)
allowed-tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "Task"]
summary: Debug a stubborn bug with bounded diagnosis and a minimal verified fix — reproduce or inspect, optionally isolate, identify the root cause, validate within scope, and clean up. Any repo.
example: "/ultrafix tests flake on ci but pass locally"
type: skill
category: workflow
platform: cross
portability: adaptable
publish: public
adaptation_notes: "Adapt the logging mechanism and reproduction probe to your stack. Use worktree-per-hypothesis isolation only when multiple hypotheses need it and the user authorizes that scope; preserve the evidence-before-fix discipline."
---

# Ultrafix

Diagnose a stubborn bug from reproducible or inspectable evidence, then implement one minimal fix. Use isolated worktrees only when competing hypotheses need parallel investigation within the authorized scope.

## Bug Description:
$ARGUMENTS

## Validation and Test Scope

Test commands and test creation require explicit user authorization in the current session or an active test-owning skill (`ensure-tests`, `finish-branch`, `generating-tests`, `modernize-tests`). If that authority is absent, use manual, runtime, log, or static evidence and report skipped test validation.

**Writing tests is banned by default (HARD).** Never create, extend, or rewrite test files unless I explicitly ask in the session or a test-owning skill is running (`ensure-tests`, `finish-branch`, `generating-tests`, `modernize-tests`). If a session surfaces a genuine test opportunity (coverage gap on validated behavior, stale test, regression worth pinning), propose it and ask permission with `request_user_input`, naming what would be tested and why; write only after I approve. When a change breaks an existing test, fix the code; rewrite the test only when I say the test was wrong. Running tests follows the same gate: no runs during iteration, no fix→re-test loops. Delegation briefs carry the ban verbatim.

## Workflow

### Phase 1: Reproduce or Gather Evidence

Choose the smallest reproduction or diagnostic probe that fits the authorized scope. Prefer a manual, runtime, log, or static probe when no test authority is active. If `$REPRODUCE_CMD` is a test command, run it only at an authorized validation checkpoint.

```bash
# Detect the project's run or diagnostic command (CI workflow first, then manifest/Makefile) — don't hardcode it.
# At an authorized validation checkpoint, capture the exact failure:
$REPRODUCE_CMD 2>&1 | tee /tmp/ultrafix-repro.log
```

Pin down the exact command, environment, frequency (always vs flaky), and precise error or symptom. If the issue is intermittent, note variables that differ between passing and failing runs (parallelism, ordering, timezone, network, clock, resource limits). If reproduction is unavailable, gather enough signal to state or reject a root cause; if the cause remains unclear, stop and report the blocker instead of guessing.

### Phase 2: Form Hypotheses

From the symptom and a quick read of the suspect code, list **concrete, falsifiable** hypotheses — each one a specific claim you can prove or disprove:

```
H1 — Test order dependency: a shared fixture leaks state between tests.
H2 — Race: an async task isn't awaited, so assertions run before it completes.
H3 — Environment: CI's timezone/locale differs and a date comparison flips.
```

Rank by likelihood × cheapness to investigate. Use the Task tool only when parallel investigation is useful and the user has authorized that scope; otherwise inspect the evidence directly before any worktree is created.

### Phase 3: Isolate Hypotheses When Useful

If the root cause is already clear, skip hypothesis fanout and implement one minimal fix in the current branch or one authorized isolated worktree. When multiple independent hypotheses need isolation and the user has authorized parallel work, give each selected hypothesis its own git worktree:

```bash
ROOT=$(git rev-parse --show-toplevel)
BASE=$(git branch --show-current)

# Keep the set bounded; add worktrees only for useful, authorized probes.
for H in h1 h2; do
  git worktree add -b "ultrafix/$H" "../${ROOT##*/}-$H" "$BASE"
done
git worktree list
```

Each authorized worktree is a clean, independent checkout: instrument one selected hypothesis, try a candidate fix in another when useful, and keep probes from colliding.

### Phase 4: Add Structured Debug Logging

In the relevant worktree, add **structured, greppable** log lines (not bare prints) at decision points around the suspect path — adapt the mechanism to your stack's logger:

```
# Tag lines so you can filter them out of noise and find them again to remove.
LOG "[ULTRAFIX h2] entering retry loop attempt=$n state=$state elapsed_ms=$dt"
```

Conventions that pay off:
- A consistent prefix/tag (`[ULTRAFIX hN]`) per hypothesis → easy `grep`, easy cleanup.
- Log **inputs, branch taken, and timing** at each fork — enough to reconstruct the actual execution order.
- For races/flakes, log timestamps and which task/thread emitted the line.

### Phase 5: Bounded Validation of Selected Hypotheses

Use the smallest appropriate probe for each selected hypothesis and read the structured output. Test or reproduction commands that exercise tests require the authorization described above; otherwise use non-test evidence and record the skipped test validation:

```bash
# At an explicitly authorized validation checkpoint:
( cd "../${ROOT##*/}-h2" && $REPRODUCE_CMD 2>&1 | tee /tmp/ultrafix-h2.log )
grep '\[ULTRAFIX h2\]' /tmp/ultrafix-h2.log
```

For flaky bugs, repeat a run only when the user explicitly authorizes that validation checkpoint. Do not run tests during iteration or start automatic fix → re-test loops.

Each result confirms or kills a hypothesis. Kill the wrong ones explicitly — narrowing is progress. Report any skipped validation and remaining uncertainty.

### Phase 6: Name the Root Cause

Converge on one explanation supported end-to-end by the available evidence. Logs and isolation when used should show the bad state and why it produces the symptom; static or runtime evidence may be sufficient when the cause is clear. Write the root cause in one or two sentences. Do not fix until you can state what is wrong and why it produces the symptom.

### Phase 7: Implement One Minimal Fix + Report Evidence

In the winning worktree (or back on `$BASE`), make the **smallest** change that addresses the root cause — no opportunistic refactors riding along. Validate at an explicitly authorized checkpoint when test authority exists; otherwise use non-test evidence and report the skipped test validation:

```bash
# At an explicitly authorized validation checkpoint:
$REPRODUCE_CMD 2>&1 | tee /tmp/ultrafix-verify.log
```

Treat the fix as verified only to the level supported by the available evidence. Do not run automatic fix → re-test loops or claim stronger validation than was performed.

### Phase 8: Clean Up

**First make sure the winning fix is on your working branch** — if it only lives on a hypothesis branch, bring it over (cherry-pick or merge) before deleting anything.

```bash
# 1) Salvage check: any commit listed here is UNIQUE to a scratch branch — move it to your
#    working branch before cleanup, or you will lose it.
for h in h1 h2; do git log --oneline "$BASE..ultrafix/$h" 2>/dev/null; done

# 2) Remove every debug probe you added.
grep -rn 'ULTRAFIX' .

# 3) Tear down only scratch worktrees created by this invocation, then delete their branches with -d (NOT -D). Leave unrelated or pre-existing worktrees alone.
#    -d refuses to delete a branch with unmerged commits, so it can't silently drop the fix.
git worktree remove "../${ROOT##*/}-h1"
git worktree remove "../${ROOT##*/}-h2"
git branch -d ultrafix/h1 ultrafix/h2   # errors here = unsalvaged commits; review before forcing
```

Only fall back to `git branch -D` after you have confirmed the branch's unique commits are already on your working branch. Leave only the minimal fix and any explicitly authorized test work on the working branch.

## Quick Reference

### The loop
Reproduce or inspect → hypothesize → optionally isolate (worktree) → instrument → bounded validation → root cause → one minimal fix → report evidence → clean up.

### Discipline
- **No fix without evidence.** A reproducible failure is preferred; if it is unavailable, static, log, or runtime evidence must support the root cause.
- **Evidence before fix.** Logs + isolation name the cause; you don't guess it.
- **One hypothesis per authorized worktree.** Parallel probes are optional and must have useful, authorized scope.
- **Minimal fix.** Address the root cause only; no drive-by refactors.
- **Repeat validation only when explicitly authorized** for flakes; one run may be insufficient, and skipped validation must be reported.

### Cheatsheet
- Worktree: `git worktree add -b ultrafix/hN ../repo-hN <base>` → `git worktree remove <path>`.
- Logging: tag every probe (`[ULTRAFIX hN] …`) so it greps cleanly and is trivial to delete; log inputs, branch taken, timing; add timestamps/thread for races.
