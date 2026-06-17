---
name: smart-commit
description: Automated commit organization — groups uncommitted changes into 2–5 atomic, semantically-prefixed commits by module, presents a plan, and commits on approval. Never auto-pushes. Any language.
argument-hint: Optional flags (--interactive/-i, --think, --no-plan, --no-cleanup, --max-commits N, --dry-run)
allowed-tools: ["Bash", "Read", "Grep", "Edit", "Glob", "AskUserQuestion"]
summary: Group uncommitted changes into 2–5 atomic, semantically-prefixed commits by module, present a plan, and commit on approval — never auto-pushes. Any language.
example: "/smart-commit"
type: skill
category: workflow
platform: cross
portability: adaptable
publish: public
adaptation_notes: "Grouping is directory-based — adapt the path patterns in grouping-patterns.md to your repo's top-level source/module dirs, tests dir, docs, and config globs. Semantic prefixes (Feat/Fix/Perf/Refactor/Test/Docs/Chore) are generic. The inline hygiene check and optional branch-plan update map to the sibling cleanup and update-branch-plan skills; if those aren't installed, the inline logic still runs. Flags preserved: -i/--think/--no-plan/--no-cleanup/--max-commits N/--dry-run. Never pushes."
---

# Smart Commit — Automated Commit Organization

Analyze uncommitted changes and create well-organized, semantically meaningful commits. Repository-agnostic: it groups by your repo's directory structure, not a fixed module layout.

## Arguments:
$ARGUMENTS

## Default Behavior

Fully automated workflow:
1. **Cleanup check** — detect code-hygiene issues.
2. **Scope validation** — verify the work matches the branch plan (if one exists).
3. **Staging strategy** — handle mixed staged/unstaged changes.
4. **Analyze & group** — into 2–5 logical commits by directory/module.
5. **Present plan** — show the proposed commits.
6. **Execute** — create commits (with approval).
7. **Update branch plan** — conservatively, if a plan exists.
8. **Summary** — results with plan status.
9. **NEVER pushes automatically.**

## CLI Flags

| Flag | Effect |
|---|---|
| `--interactive`, `-i` | Approve each commit individually |
| `--think` | Extended reasoning for complex changesets |
| `--no-plan` | Skip branch-plan update AND scope validation |
| `--no-cleanup` | Skip the cleanup check |
| `--max-commits N` | Limit to N commits (default 5) |
| `--dry-run` | Preview without committing |

## Workflow

### Phase 0: Pre-Commit Checks

**0a — Cleanup check** (unless `--no-cleanup`). Detect hygiene issues in the changed files using language-agnostic patterns. If the `cleanup` skill is installed, delegate to it; otherwise inline:

```bash
FILES=$({ git diff --name-only; git diff --cached --name-only; } | sort -u)

# Debug prints across languages
grep -nE 'console\.log\(|[^a-zA-Z]print\(|println!|fmt\.Print|System\.out\.print|debugPrint\(|dump\(|puts ' $FILES 2>/dev/null
# Leftover markers
grep -nE 'TODO|FIXME|XXX|HACK' $FILES 2>/dev/null
# Commented-out code (a line that is a comment wrapping a statement)
grep -nE '^\s*(//|#)\s*(let|var|const|func|def|class|fn|public|private|return|if|for) ' $FILES 2>/dev/null
```

If issues are found, offer: **Continue anyway** / **Cancel and fix first**. (Hygiene is a warning, not a blocker. A line tagged `cleanup: intentional` is skipped.)

**0b — Scope validation** (unless `--no-plan`). If `Docs/branches/<branch>.md` exists, check whether the changed top-level modules are mentioned in it; warn (don't block) on out-of-scope work.

**0c — Staging strategy** (if staged and unstaged are mixed). Ask (Header "Staging"): **Respect current staging (Recommended)** / **Reorganize all changes**.

### Phase 1: Analyze Changes

```bash
git status --porcelain        # the full set of changes
```

### Phase 2: File Grouping

Group by the repo's directory structure. **See [`grouping-patterns.md`](grouping-patterns.md)** for the matching logic.

**High-level grouping (adapt to your layout):**
- top-level source/module dir (`src/<module>/`, `lib/`, `pkg/`, `app/<feature>/`) → "Feature/Module: X"
- tests dir (`test/`, `tests/`, `__tests__/`, `*_test.*`, `*Tests*`) → "Tests"
- docs (`docs/`, `*.md`, `README`) → "Documentation"
- config (`.json`, `.yml`, `.toml`, build files, lockfiles) → "Configuration"

### Phase 3: Generate Commit Messages

Use semantic prefixes: **Feat:** new features · **Fix:** bug fixes · **Perf:** performance · **Refactor:** restructuring · **Test:** tests · **Docs:** documentation · **Chore:** maintenance/config.

### Phase 4: Present Plan

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Smart Commit Plan
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Commit #1 · Feat: Update auth module
  src/auth/login.ts
  src/auth/session.ts

Commit #2 · Test: Add/update tests
  src/auth/__tests__/login.test.ts

Commit #3 · Docs: Update README
  README.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Phase 5: Execute

Prompt: **Execute all as planned** / **Review each individually** / **Single combined commit** / **Cancel**. **See [`execution-scripts.md`](execution-scripts.md)** for the implementation.

### Phase 6: Summary

```
## ✅ Created N commits

| Hash | Message | Files |
|------|---------|-------|
| abc123 | Feat: Add feature X | 5 |

📋 Branch plan: [Updated | No plan | Skipped]
⚠️ COMMITS ARE LOCAL — review before pushing:  git log -N --oneline
When ready:  git push
```

### Phase 7: Update Branch Plan

Unless `--no-plan`, conservatively update `Docs/branches/<branch>.md` if it exists: match commits to unchecked tasks, mark complete only at ≥80% confidence, and commit the plan change in its **own** commit. If the `update-branch-plan` skill is installed, delegate to it (`--auto`).

## Smart Interruptions

Only interrupt when necessary: staged+unstaged mix · potential secrets detected · too many categories · interactive mode · clearly out-of-scope work.

## Important Notes

- **Never commits without approval.**
- **Never pushes automatically.**
- **Directory-aware** grouping — works on any repo's layout.
- Updates branch plans conservatively, in a separate commit.

## Supporting Files
- [`grouping-patterns.md`](grouping-patterns.md) — directory→group matching, message generation, prefix rules, plan-path convention.
- [`execution-scripts.md`](execution-scripts.md) — commit execution (all / individual / combined), summary, scope validation.
