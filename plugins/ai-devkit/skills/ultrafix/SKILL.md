---
name: ultrafix
description: Systematically debug a stubborn bug using isolated git worktrees for parallel hypothesis testing plus structured debug logging, converging on a root cause and a verified fix. Works on any repo.
user-invocable: true
argument-hint: Description of the bug (symptoms, when it happens, what you've tried)
allowed-tools: ["Bash", "Read", "Write", "Edit", "Grep", "Glob", "Task"]
summary: Debug a stubborn bug with isolated git worktrees for parallel hypothesis testing plus structured logging — reproduce, isolate, find root cause, verify a minimal fix, clean up. Any repo.
example: "/ultrafix tests flake on ci but pass locally"
type: skill
category: workflow
platform: cross
portability: adaptable
publish: public
adaptation_notes: "Adapt the logging mechanism and the test/reproduce command to your stack (detect the project's test command the same way the rest of the toolkit does). The worktree-per-hypothesis isolation and the evidence-before-fix discipline are portable as-is."
---

# Ultrafix

Hunt down a hard bug methodically instead of guessing. The core idea: **reproduce first, isolate hypotheses in separate git worktrees so you can test several at once without polluting your workspace, add structured logging to see what's actually happening, and only fix once the evidence names a root cause.** Evidence before fix, always.

## Bug Description:
$ARGUMENTS

## Workflow

### Phase 1: Reproduce Reliably

You cannot fix what you can't trigger on demand.

```bash
# Detect the project's test/run command (CI workflow first, then manifest/Makefile) — don't hardcode it.
# Then run the minimal reproduction and capture the exact failure.
$REPRODUCE_CMD 2>&1 | tee /tmp/ultrafix-repro.log
```

Pin down: exact command, environment, frequency (always vs flaky), and the precise error/symptom. If it's intermittent (e.g. "flakes on CI"), note the variables that differ between passing and failing runs (parallelism, ordering, timezone, network, clock, resource limits). **If you cannot reproduce it at all, stop and gather more signal** — a fix you can't verify is a guess.

### Phase 2: Form Hypotheses

From the symptom and a quick read of the suspect code, list **concrete, falsifiable** hypotheses — each one a specific claim you can prove or disprove:

```
H1 — Test order dependency: a shared fixture leaks state between tests.
H2 — Race: an async task isn't awaited, so assertions run before it completes.
H3 — Environment: CI's timezone/locale differs and a date comparison flips.
```

Rank by likelihood × cheapness to test. Use the Task tool to investigate the codebase for evidence supporting or killing each one before spinning up worktrees.

### Phase 3: Isolate Each Hypothesis in a Worktree

Give every non-trivial hypothesis its **own git worktree** so probes (extra logging, a candidate fix, a config tweak) never collide and can run in parallel:

```bash
ROOT=$(git rev-parse --show-toplevel)
BASE=$(git branch --show-current)

for H in h1 h2 h3; do
  git worktree add -b "ultrafix/$H" "../${ROOT##*/}-$H" "$BASE"
done
git worktree list
```

Each worktree is a clean, independent checkout: instrument H1 in one, try a fix for H2 in another, and they don't interfere.

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

### Phase 5: Test Each Hypothesis in Isolation

Run the reproduction in each worktree and read the structured output:

```bash
( cd "../${ROOT##*/}-h2" && $REPRODUCE_CMD 2>&1 | tee /tmp/ultrafix-h2.log )
grep '\[ULTRAFIX h2\]' /tmp/ultrafix-h2.log
```

For flaky bugs, **loop** the run to make the signal statistically real:

```bash
( cd "../${ROOT##*/}-h2"; for i in $(seq 1 20); do $REPRODUCE_CMD >/dev/null 2>&1 && echo "run $i PASS" || echo "run $i FAIL"; done )
```

Each result confirms or kills a hypothesis. Kill the wrong ones explicitly — narrowing is progress.

### Phase 6: Name the Root Cause

Converge on **one** explanation that the evidence supports end-to-end: the logs show the bad state arising, the isolating worktree reproduces it, and removing the cause makes it stop. Write the root cause in one or two sentences — *what* is wrong and *why* it produces the symptom. Don't fix until you can state this.

### Phase 7: Implement a Minimal Fix + Verify

In the winning worktree (or back on `$BASE`), make the **smallest** change that addresses the root cause — no opportunistic refactors riding along.

```bash
# Verify against the original reproduction. For flakes, loop enough to trust it.
$REPRODUCE_CMD 2>&1 | tee /tmp/ultrafix-verify.log
# Flaky case: confirm a long green streak (e.g. 20–50 runs) before believing it.
```

A fix is "verified" only when the reproduction that used to fail now passes repeatedly — not when the code "looks right."

### Phase 8: Clean Up

Remove all debug logging and tear down the scratch worktrees:

```bash
grep -rn 'ULTRAFIX' .        # find every probe you added — remove them all
git worktree remove "../${ROOT##*/}-h1"
git worktree remove "../${ROOT##*/}-h2"
git worktree remove "../${ROOT##*/}-h3"
git branch -D ultrafix/h1 ultrafix/h2 ultrafix/h3 2>/dev/null
git worktree prune
```

Leave only the minimal fix (plus a regression test, if one was missing) on the working branch.

## Quick Reference

### The loop
Reproduce → hypothesize → isolate (worktree) → instrument → test → root cause → minimal fix → verify → clean up.

### Discipline
- **No fix without a reproduction.** If you can't trigger it, you can't verify it.
- **Evidence before fix.** Logs + isolation name the cause; you don't guess it.
- **One hypothesis per worktree.** Parallel probes, zero cross-contamination.
- **Minimal fix.** Address the root cause only; no drive-by refactors.
- **Verify by repetition** for flakes — one green run proves nothing.

### Cheatsheet
- Worktree: `git worktree add -b ultrafix/hN ../repo-hN <base>` → `git worktree remove <path>` → `git worktree prune`.
- Logging: tag every probe (`[ULTRAFIX hN] …`) so it greps cleanly and is trivial to delete; log inputs, branch taken, timing; add timestamps/thread for races.
