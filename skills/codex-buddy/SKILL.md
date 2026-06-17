---
name: codex-buddy
description: Bring in a second AI agent — OpenAI's Codex — for an independent review, a second opinion, deeper debugging, a security audit, or a delegated implementation. Your primary agent gathers repo context, runs Codex non-interactively, then critically cross-checks what comes back. Works on any repo.
user-invocable: true
argument-hint: What you want the second agent to do (e.g., 'review my changes on this branch', 'second opinion on this design', 'debug this failing test')
allowed-tools: ["Bash", "Read", "Grep", "Glob", "AskUserQuestion", "Task"]
summary: Use a second AI agent (Codex) for review, a second opinion, debugging, an audit, or delegated implementation — context-enriched, run non-interactively, and cross-checked rather than trusted blindly. Any repo.
example: "/codex-buddy review my changes on this branch"
type: skill
category: workflow
platform: cross
portability: adaptable
publish: public
adaptation_notes: "Built on the Codex CLI (`codex exec` / `codex review`). The pattern — primary agent enriches a prompt with repo context, runs a second agent read-only for analysis or write-capable for changes, then cross-checks the output — ports to any second-agent CLI or MCP. Swap the binary and its model/effort/sandbox flags; keep the enrich → run → critically-evaluate loop and the read-only-by-default safety."
---

# Codex Buddy

Two agents are better than one. Your primary agent stays in the driver's seat; when you want an independent check, it hands a context-rich prompt to a **second agent — OpenAI's Codex** — runs it non-interactively, then **critically evaluates** the result instead of taking it as gospel. Use it for a second opinion, a code review, a deeper debugging pass, a security audit, a test-gap analysis, or to delegate a focused implementation.

This is the opposite of "let one model do everything." The value comes from a *different* model with *fresh eyes*, with the findings filtered by an agent that actually knows your repo. **Codex is a colleague, not an authority.**

## What you want done
$ARGUMENTS

## When to use it

- You say "ask codex", "get a second opinion", "have codex review this", "let codex debug it", or "delegate this to codex".
- The primary agent is stuck, wants an adversarial second pass, or wants a higher-reasoning model on a hard problem.
- Before merging something risky — an independent reviewer that hasn't been staring at the same code.

Skip it for trivial tasks the primary agent can finish in one step, and always respect "don't use codex".

## Modes — pick by intent

| Mode | You're asking to… | Touches files? |
|------|-------------------|----------------|
| `review` | review / check / "second opinion" | No (read-only) |
| `diagnose` | debug / investigate / "why is this failing" | No |
| `plan` | design / architect / "how should we" | No |
| `audit` | security / adversarial / find vulnerabilities | No |
| `test-analysis` | find test gaps / missing coverage | No |
| `refactor` | suggest a restructuring | No (suggest) |
| `implement` | implement / fix / apply changes | **Yes (write)** |

**Read-only is the default.** Only `implement` (and an explicit "apply this refactor") may write. When a request combines read **and** write — "review *and fix*", "check *and update*" — the write intent wins: route to `implement`.

## Workflow

### 1. Pick the mode and reasoning depth
Map the request to a mode above. Choose a model and reasoning effort — bias to **higher effort for `plan` and `audit`** (architecture and security reward deep reasoning), normal effort for the rest. If the user didn't specify, ask once with `AskUserQuestion` rather than guessing.

### 2. Gather context (keep it lightweight)
Curated context beats dumping the whole repo. Collect only what the mode needs:

- **Always:** the current branch and `git diff --stat` (use `git diff --stat <base>...HEAD` for a branch review).
- **review / diagnose:** the actual diff, plus the failing test or error output.
- **plan / audit:** the relevant architecture notes; the trust boundaries, input surfaces, and auth/data-flow paths.
- **implement / refactor:** the target files and their tests.

Point Codex at the conventions the changed code touches — your dependency-injection approach, your test framework, your data layer — so it reviews against *your* patterns, not generic ones.

### 3. Craft an enriched prompt
Give Codex a concrete `<task>` and a short `<project_context>` (conventions, patterns, any house rules). A few targeted sentences of context are the difference between a generic review and one that fits your codebase.

### 4. Run Codex non-interactively

Read-only modes (`review`, `diagnose`, `plan`, `audit`, `test-analysis`, refactor-suggest):

```bash
STDERR_LOG=$(mktemp)
codex exec \
  -m <model> \
  --config model_reasoning_effort="<effort>" \
  --sandbox read-only \
  --skip-git-repo-check \
  "<enriched prompt>" < /dev/null 2>"$STDERR_LOG"
```

There's also a built-in review entry point — `codex review` runs a code review non-interactively.

Write-capable modes (`implement`, refactor-apply) — opt in explicitly with `--full-auto` (it bundles `--sandbox workspace-write`):

```bash
codex exec \
  -m <model> \
  --config model_reasoning_effort="<effort>" \
  --full-auto \
  --skip-git-repo-check \
  "<enriched prompt>" < /dev/null 2>"$STDERR_LOG"
```

Rules that keep it reliable:

- **Always** pass `--skip-git-repo-check` and pipe `< /dev/null` so Codex never blocks waiting on stdin (essential for background runs).
- **Never discard stderr** (`2>"$STDERR_LOG"`, not `2>/dev/null`): it carries noisy thinking *and* the real error diagnostics. On failure, read it.
- Add `--full-auto` **only** for write modes. Read-only modes stay on `--sandbox read-only`.
- For a long run (expected over ~2 minutes), run it in the background.
- For a large prompt (big diffs, a whole plan file), pass it on stdin with the `-` sentinel instead of as an argument.

### 5. Critically evaluate the output
This is the step that makes the pattern worth it:

1. **Cross-check** against what you already know — flag anything that contradicts the repo's patterns.
2. **Filter false positives** — a second model doesn't know your conventions; some "issues" are just house style.
3. **Flag disagreements with evidence** — "Codex suggests X, but this repo does Y because Z."
4. **Check currency and completeness** — did it miss a recent change, or only address half the scope?

To argue a point, resume the same Codex session instead of starting fresh:

```bash
codex exec --skip-git-repo-check resume --last \
  "Following up — I disagree with [X] because [evidence]. Reconsider." < /dev/null 2>"$STDERR_LOG"
```

### 6. Present results
Report three things: **Codex's findings**, **your assessment** (cross-checks, filtered false positives, disagreements), and **suggested next steps** — then let the user choose what to act on. Clean up the temp log when done (`rm -f "$STDERR_LOG"`).

## Setup

- Install: `npm install -g @openai/codex`. Sign in: `!codex login` (the `!` runs it in your own terminal).
- If a model isn't available to your account, fall back to another one in your Codex catalog.

## Boundaries

- Explicit `/codex:*` slash commands belong to the official Codex plugin — this skill is for natural-language "ask codex" requests.
- Don't over-delegate: if the primary agent can finish it quickly and correctly, just do it.
- "Don't use codex" always wins.
