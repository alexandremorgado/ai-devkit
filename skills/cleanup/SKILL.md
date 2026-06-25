---
name: cleanup
description: Find and remove code noise before a PR — debug prints/logs, leftover commented-out code, and obvious "what" comments. Use when cleaning up a branch, stripping debug logging, or checking for dead code / comment rot.
user-invocable: true
argument-hint: "[--all, --branch, --quiet, --fix]"
allowed-tools: ["Bash", "Read", "Edit", "Glob", "Grep"]
summary: Detect and optionally remove code noise — debug prints, transitional/obvious comments, and commented-out code — across languages. Pairs with smart-commit.
example: "/cleanup --branch"
type: skill
category: conventions
platform: cross
portability: adaptable
publish: public
adaptation_notes: "The grep-detectable patterns are listed per-language — keep the ones for your stack and drop the rest, or extend the table. The 'obvious comments' semantic-review section (the highest-value part) is fully language-agnostic and ports verbatim. --all paths and the --branch base are auto-detected. Designed to be called by smart-commit as a pre-commit warning; works standalone too."
---

# Cleanup — Remove Code Noise

Detect and optionally remove transitional comments, debug code, obvious comments, and commented-out code. Repository-agnostic: grep patterns cover the common languages, and the high-value pass — judging *obvious* comments — is purely semantic.

## Arguments
$ARGUMENTS

## Flags
- `--all`: check all source files in the repo's source dirs.
- `--branch`: check files changed vs the base branch.
- `--quiet`: only output if issues are found.
- `--fix`: remove detected issues (prompts before each).

**Default** (no scope flag): only check uncommitted changes (staged + unstaged).

**Exception:** a line tagged `cleanup: intentional` is always skipped.

## Detection Patterns (grep-detectable)

| Category | Pattern (extend per language) | Example |
|---|---|---|
| Transitional comments | `previously`, `was:`, `changed from`, ` now `, `moved to`, `old:`, `before:`, `used to` | `// Padding now handled by X` |
| Commented-out code | a comment that wraps a statement: `^\s*(//|#)\s*(let\|var\|const\|func\|def\|class\|fn\|return\|if\|for\|import) ` (excludes doc comments `///`, `##`, `"""`) | `// let x = 5` |
| Debug prints | `console.log(`, `print(`, `println!`, `fmt.Print`, `System.out.print`, `dump(`, `debugPrint(`, `puts ` | `console.log("debug", value)` |
| Logger debug | `log.debug(`, `logger.debug(`, `NSLog(`, `os_log(` with debug text | `logger.debug("state", state)` |
| Completed TODOs | `TODO.*(done\|completed\|fixed)` | `// TODO: done` |
| Empty section markers | `// MARK: -$`, `# region` with nothing after | `// MARK: -` |

## Manual Review: Obvious Comments

Comments that restate what the code already says add no value and become maintenance debt. These need semantic judgment — grep can't find them.

**Remove comments that:**
- Restate the name: `/* Feature for managing coins */` on `class CoinsFeature`
- Describe obvious behavior: `// Set loading to true` above `isLoading = true`
- Echo the type/signature: `/* the user client */` on `userClient: UserClient`
- Narrate self-documenting code: `// Check if user has enough coins` above `if balance >= price`

**Keep comments that explain:**
- **Why**, not what: `// Defer setup to avoid blocking the main thread`
- Non-obvious trade-offs: `// O(n) search is fine — list is always < 50 items`
- External constraints: `// Provider requires this entitlement check before unlock`
- Workarounds: `// Platform bug — force-unwrap is safe here (see TICKET-123)`
- Business rules: `// 20% discount applies to bundle purchases`

## Workflow

### 1. Get files

```bash
# Base branch for --branch (auto-detected)
if git ls-remote --heads origin develop | grep -q .; then BASE_BRANCH=develop
else BASE_BRANCH=$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p'); BASE_BRANCH=${BASE_BRANCH:-main}; fi

# Discover the repo's source roots instead of hardcoding them
SRC_DIRS=$(git ls-files | sed -n 's#^\(src\|lib\|pkg\|app\|internal\|Sources\)/.*#\1#p' | sort -u)

if   echo "$ARGUMENTS" | grep -q -- "--all";    then FILES=$(git ls-files $SRC_DIRS 2>/dev/null)
elif echo "$ARGUMENTS" | grep -q -- "--branch"; then FILES=$(git diff "$BASE_BRANCH..HEAD" --name-only)
else FILES=$({ git diff --name-only; git diff --cached --name-only; } | sort -u)
fi
```

### 2. Phase 1 — grep-detectable

Run the pattern table above over `$FILES`, excluding lines tagged `cleanup: intentional`:

```bash
PATTERNS=(
  '// .*(previously|was:|changed from| now |moved to|old:|before:|used to)'
  '^[[:space:]]*(//|#)[[:space:]]*(let|var|const|func|def|class|fn|return|if|for|import|public|private)[[:space:]]'
  'console\.log\(|[^a-zA-Z]print\(|println!|fmt\.Print|System\.out\.print|debugPrint\(|dump\(|puts '
  '(log|logger)\.debug\(|NSLog\(|os_log\('
  '//[[:space:]]*TODO.*(done|completed|fixed|DONE|COMPLETED|FIXED)'
)
for p in "${PATTERNS[@]}"; do
  grep -rnE "$p" $FILES 2>/dev/null | grep -v "cleanup: intentional"
done
```

### 3. Phase 2 — semantic review (REQUIRED)

After grep, read the actual `git diff` and identify obvious comments using the rules above. List each as `file:line: comment → the code it restates`.

### 4. Report or fix

- `--quiet`: only show the count.
- `--fix`: remove grep-detected issues, then ask about each obvious comment.
- Default: list all issues (grep + semantic), modify nothing.

## Output Format

```
Checking uncommitted changes…

Phase 1 — grep-detectable
  src/checkout/charge.ts:42  console.log("amount", amount)
  src/checkout/charge.ts:88  // old: used the legacy gateway

Phase 2 — obvious comments (semantic)
  src/cart/cart.ts:21  // add item to cart  →  cart.push(item)
  src/cart/cart.ts:55  // the total          →  let total: number

Want me to remove these?
```

## Integration

Called automatically by `smart-commit` as a pre-commit warning: it runs detection (report-only), shows warnings, offers to fix, and lets you continue anyway — **issues are warnings, not blockers**.

## Important
- **Warning only** — never blocks a commit.
- Keep a legitimate transitional comment with `// cleanup: intentional`.
- Default mode reports without modifying; `--fix` applies removals with confirmation.

## Supporting File
- [`detection-patterns.md`](detection-patterns.md) — the full per-language pattern reference and edge cases.
