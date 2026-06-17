---
name: ensure-tests
description: Smart test analysis and validation — analyzes branch scope, decides whether new tests are needed, runs the project's test suite, fixes failures until 100% pass, then conservatively annotates the branch plan's Test Plan. Works on any stack.
user-invocable: true
argument-hint: Optional specific feature/module to test (defaults to current work from git status)
allowed-tools: ["*"]
summary: Analyze a branch's scope, run the test suite, fix failures to 100% pass, then conservatively annotate the branch plan's test section — on any stack.
example: "/ensure-tests"
type: skill
category: testing
platform: cross
portability: adaptable
publish: public
adaptation_notes: "Replace the example test command with your project's — auto-detect it from the CI workflow, then package.json/pyproject/go.mod/Cargo.toml/Gradle, or a Makefile. Keep the VALIDATION-vs-EXPANSION decision gate, the regression-check-against-the-base-branch-first diagnosis, the iterate-to-100% loop, and the conservative append-only branch-plan annotation. Swap the Swift/Jest examples in test-patterns.md for your framework's idioms. Base branch and the plan-file path are auto-detected. The sibling skill update-branch-plan is optional — if it isn't installed, the inline annotation step still runs."
---

# Ensure Tests — Comprehensive Testing Workflow

Execute a complete testing lifecycle for the current branch, achieving a 100% pass rate, then record what was actually verified. Repository-agnostic: it detects your stack's test command and your repo's base branch instead of assuming one.

## Target Feature/Module:
$ARGUMENTS

> If no argument is provided, analyze `git status`/`git diff` to identify the current work.

## Mission

1. Analyze the **entire** branch's work (plan + all commits since the base branch).
2. Run tests with the project's own test command; diagnose failures.
3. Distinguish test bugs from code regressions (check the base branch first).
4. Add tests only for genuine coverage gaps.
5. Iterate until 100% pass.
6. Conservatively annotate the branch plan's Test Plan with the verified outcome.

## When to Use

- ✅ Before creating a PR
- ✅ After an explicit request ("add tests for X")
- ✅ When CI tests fail
- ❌ NOT during initial planning
- ❌ NOT during active feature development (unless a test is needed to drive it)

## Phase 0: Detect Stack, Base Branch & Scope

```bash
# Base branch — auto-detect, don't hardcode. Prefer an explicit integration branch, else the
# remote's default branch, else main.
if git ls-remote --heads origin develop | grep -q .; then BASE_BRANCH=develop
else BASE_BRANCH=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p'); BASE_BRANCH=${BASE_BRANCH:-main}; fi

# Branch delta from the base
git diff "$BASE_BRANCH...HEAD" --stat
git diff "$BASE_BRANCH...HEAD" --name-only

# Branch plan, if this repo keeps one (same convention as issue-to-branch)
BRANCH=$(git branch --show-current)
PLAN_FILE="Docs/branches/${BRANCH//\//-}.md"
[ -f "$PLAN_FILE" ] && cat "$PLAN_FILE"
```

**Detect the test command** (don't assume — confirm it). Look in this order:
1. The CI workflow (`.github/workflows/*`, `.gitlab-ci.yml`, etc.) — the authoritative command the team actually runs.
2. The package manifest: `package.json` scripts (`npm test`/`pnpm test`/`yarn test`), `pyproject.toml`/`pytest`, `go test ./...`, `Cargo.toml`/`cargo test`, `pom.xml`/`build.gradle` (`mvn test`/`./gradlew test`), `Package.swift`/`.xcworkspace` (`swift test`/`xcodebuild test`), `Gemfile`/`rspec`, `composer.json`/`phpunit`, `pubspec.yaml`/`flutter test`.
3. A `Makefile` target (`make test`).

> **See [`test-patterns.md`](test-patterns.md)** for per-stack test command + framework examples, and **[`locating-tests.md`](locating-tests.md)** for where tests live and how they're registered/discovered.

**Decision Gate:**
- Modified functions that already have updated tests: X/Y ratio.
- New functions that already have new tests: A/B ratio.
- IF both ≥ 90%: **VALIDATION MODE** (skip to Phase 3).
- ELSE: **EXPANSION MODE** (continue to Phase 1).

## Phase 1: Discovery & Context (Expansion Mode)

Find the tests related to the changed code. Use the repo's own conventions (see `locating-tests.md`):

```bash
# Examples — adapt the pattern/paths to your stack:
#   git grep -l "FeatureName"           # find source + sibling tests by symbol
#   find . -path '*test*' -iname '*FeatureName*'   # find test files by name
```

## Phase 2: Coverage Analysis (Expansion Mode)

Check for missing tests:
- [ ] New functionality not tested
- [ ] Edge cases (empty inputs, nil/null, boundaries)
- [ ] Error scenarios (network failures, API errors, timeouts)
- [ ] Async/concurrent behavior
- [ ] Domain-critical logic for this change

## Phase 3: Test Execution

Run the detected command. Capture the full output (pass/fail counts and failure details):

```bash
# Replace with the command detected in Phase 0. Examples:
#   npm test
#   pytest -q
#   go test ./...
#   cargo test
#   ./gradlew test
#   xcodebuild test -scheme MyScheme -destination 'platform=iOS Simulator,name=iPhone 15' -testPlan MyTests
$TEST_CMD
```

To run a single failing test, use your framework's filter (see `test-patterns.md`): `-run`, `-k`, `--testNamePattern`, `--filter`, `-only-testing:`, etc.

## Phase 4: Deep Failure Analysis

**Regression check FIRST** — was this test passing on the base branch?

```bash
# Use a throwaway worktree so your working tree (and untracked files) are never disturbed.
WT=$(mktemp -d)
git worktree add -q "$WT" "$BASE_BRANCH"
( cd "$WT" && $TEST_CMD )   # re-run the specific failing test on the base branch
git worktree remove --force "$WT"
```

- **Passed on `$BASE_BRANCH`, fails now → presume a CODE REGRESSION** (fix the code, not the test).

**Root-cause questions:**
1. Is the test correct (expectations match requirements)?
2. Is the code correct (logic matches requirements)?
3. Is it a mocking/fixture issue (dependency not stubbed)?
4. Is it a concurrency/ordering issue (flaky, shared state)?
5. Is it an environment issue (wrong path/flags, missing service)?

**Categorize each failure:** regression · test bug · code bug · missing mock · concurrency · environment.

## Phase 5: Remediation

**Priority order:**
1. **Regressions** — fix the code first.
2. **Infrastructure** — build/workspace/deps.
3. **Test quality** — mocking, isolation, determinism.
4. **Code issues** — logic, concurrency.
5. **Missing tests** — new coverage (Expansion mode only).

## Phase 6: Verification Loop

Re-run the suite and track progress:

```
Iteration 1: 45/53 (85%)
Iteration 2: 50/53 (94%) [PROGRESS]
Iteration 3: 53/53 (100%) [SUCCESS]
```

**Stopping conditions:**
- ✅ **Success**: 100% pass → Phase 7
- 🔄 **Progress**: improving → repeat
- ⚠️ **Blocked**: no progress for 2 iterations → report what's stuck and why

## Phase 7: Final Report

```markdown
# Test Suite Status ✅

## Summary
- Branch: feature/example
- Total tests: 53
- Pass rate: 100%
- Iterations: 3

## Fixes Applied
### Regressions Fixed
1. `FeatureTests.testMethod` — code regression fixed

### Tests Added
1. `testEdgeCaseEmpty` — coverage gap

## Success Criteria Met
- [ ] All tests pass (100%)
- [ ] All branch changes have coverage
- [ ] Branch plan Test Plan annotated (conservative)
```

## Phase 8: Annotate Branch Plan (Conservative)

Run **only after a 100% pass** (skip on blocked/partial outcomes). If `$PLAN_FILE` does not exist, skip silently.

Update the plan's **Test Plan** / test checklist with the Edit tool, applying conservative principles (act only at ≥80% confidence):

1. **Check a box only if this run actually validated its stated scope.** Never blanket-check the Test Plan just because the suite is green — match each box to the tests that exercise it. When unsure, leave it unchecked.
2. **Always append a dated, evidence-bearing coverage note** (safe even mid-development):
   `- Verified <YYYY-MM-DD>: <N> tests pass for <scope> (<key test names>).`
   An append-only note never makes a false "done" claim, unlike flipping a box prematurely.
3. **Do NOT commit here.** `ensure-tests` often runs mid-development; leave the edited plan for the next `smart-commit` or `finish-branch` (which finalize and commit the plan). Surface the edit in the Phase 7 report so it isn't lost.

> If the sibling `update-branch-plan` skill is installed, you may delegate this step to it (`--auto`); otherwise the inline logic above is sufficient. Rationale: this closes the gap where `ensure-tests` reads the plan (Phase 0) but never writes back, while keeping the conservative, append-only default that prevents premature "tested ✓" claims during iteration.

## Quality Standards (adapt to your framework)

- Prefer the project's standard test framework and assertion style — don't introduce a second one.
- Mock external dependencies; **control non-determinism** (time, UUIDs, randomness, clocks) so tests are repeatable.
- Cover the three shapes: success, failure, and async/edge behavior.
- Keep tests isolated (no shared mutable state, no order dependence).

## Supporting Files
- [`test-patterns.md`](test-patterns.md) — per-stack test commands, framework idioms, dependency mocking, controlling time/UUID.
- [`locating-tests.md`](locating-tests.md) — where tests live per ecosystem, how they're discovered/registered, common "test not found" fixes.
