---
name: kimi-buddy
description: Bring in Moonshot's Kimi Code CLI for an independent review, diagnosis, plan, audit, test analysis, refactor, or delegated implementation. Use Kimi deliberately for a third uncorrelated opinion, very large diffs or logs, vision-plus-code reasoning, and long-horizon coding.
user-invocable: true
argument-hint: What you want Kimi to do (e.g., 'review this branch', 'diagnose this failure', 'audit this design')
allowed-tools: ["Bash", "Read", "Grep", "Glob", "AskUserQuestion", "Task"]
summary: Use Kimi Code for a deliberate third opinion, huge-context analysis, vision-plus-code reasoning, or long-horizon coding, with project context gathered first and every result cross-checked.
example: "/kimi-buddy review this branch"
type: skill
category: workflow
platform: cross
portability: adaptable
publish: public
adaptation_notes: "Built on the Kimi Code CLI (`kimi`). To adapt this to another second-agent CLI, replace the binary plus its model, effort, session, and permission-profile controls; map read-only and write-capable tools explicitly; keep the mode table, context gathering, enriched prompt, deliberate model selection, and critical evaluation of every result."
---

# Kimi Buddy

Your primary agent stays responsible for the task. It gathers the relevant project context, briefs **Moonshot's Kimi Code CLI**, runs it with an explicit permission boundary, and checks the result before presenting it.

Choose Kimi for its distinct strengths: a third, uncorrelated opinion when two other model families disagree; very large context windows for huge diffs and logs; vision-plus-code reasoning; and long-horizon agentic coding. API-backed Kimi runs are typically metered per token, so use it deliberately instead of treating it as default overflow.

## What you want done
$ARGUMENTS

## When to use it

- Two model families disagree and you want a third opinion with different failure modes.
- A review or diagnosis needs an unusually large diff, log set, trace, or architecture packet.
- The task combines screenshots, diagrams, or other visual evidence with source code.
- A focused implementation needs sustained navigation and work across many files.

Skip it for a small task the primary agent can finish directly, and always respect "don't use Kimi."

## Modes

| Mode | You're asking Kimi to… | Touches files? |
|------|-------------------------|----------------|
| `review` | review, check, or give another opinion | No |
| `diagnose` | investigate a failure or explain a symptom | No |
| `implement` | implement, fix, or apply a change | **Yes** |
| `plan` | design an approach or implementation plan | No |
| `audit` | inspect security, privacy, or trust boundaries | No |
| `test-analysis` | find missing coverage or weak assertions | No |
| `refactor` | suggest or apply a restructuring | No when suggesting; **yes** when applying |

**Read-only is the default.** A combined request such as "review and fix" is write-capable and routes to `implement`.

## Workflow

### 1. Pick the mode, model, and effort

Map the request to one mode above. Select a model from the user's Kimi catalog with `--model <model>`, and configure `<effort>` through the model or provider controls that installation exposes.

- Bias effort up for `plan` and `audit`.
- Prefer the stronger long-context or vision-capable option when the task depends on huge evidence sets or images.
- Use normal effort for routine review, diagnosis, test analysis, and bounded implementation.

Do not invent a model name, alias, or effort setting. If the user has not chosen and the available catalog does not make the choice clear, ask once.

### 2. Gather context

Collect evidence that helps Kimi reason about this task:

- **Always:** current branch, `git diff --stat`, and the repository's agent instructions.
- **review:** the actual diff and the closest existing implementation pattern.
- **diagnose:** the full error, reproduction steps, failing source, and related tests.
- **plan / audit:** architecture notes, trust boundaries, input surfaces, and data flow.
- **test-analysis:** source under test, existing tests, and the project's test conventions.
- **implement / refactor:** target files, dependent code, tests, and validation commands.
- **vision-plus-code:** exact image or screenshot paths and the code that renders or consumes them.

Kimi can absorb a large evidence packet, but keep secrets, credentials, generated output, and unrelated vendor trees out of the prompt.

### 3. Craft an enriched prompt

Give Kimi a concrete task and the rules that materially affect it:

```text
<task>
Goal, mode, success criteria, and required output.
</task>

<project_context>
Relevant architecture, conventions, changed files, evidence, and test commands.
</project_context>

<constraints>
Permission boundary, files that must not change, and validation required.
</constraints>
```

For a third-opinion run, include the competing conclusions and their evidence without telling Kimi which one to favor.

### 4. Set the permission boundary

Use two explicit Kimi agent profiles:

- `<read-only-agent>` exposes read/search tools and statically denies `Write`, `Edit`, `Bash`, and every write-capable MCP or custom tool.
- `<write-agent>` exposes only the write and execution tools required for the implementation.

Kimi's read-only controls may be enforced by its application permission layer rather than an operating-system sandbox. Treat access to write-capable tools as the real boundary. A prompt that says "do not edit" is not a boundary.

Non-interactive `--prompt` mode handles approvals automatically while preserving static deny rules. Do not combine `--prompt` with `--auto`, `--yolo`, or `--plan`.

### 5. Run Kimi

Read-only modes:

```bash
STDERR_LOG=$(mktemp)
kimi \
  --agent <read-only-agent> \
  --model <model> \
  --prompt "<enriched prompt>" 2>"$STDERR_LOG"
```

Write-capable modes:

```bash
STDERR_LOG=$(mktemp)
kimi \
  --agent <write-agent> \
  --model <model> \
  --prompt "<enriched prompt>" 2>"$STDERR_LOG"
```

Keep stderr: it contains progress and error diagnostics. For an expected long run, use the host agent's background execution mechanism. Add `--add-dir <path>` only when the task genuinely needs another workspace, and grant that path the same care as the primary checkout.

To challenge a finding, continue the same session:

```bash
kimi --continue --prompt \
  "Reconsider <finding> against this evidence: <evidence>" 2>"$STDERR_LOG"
```

### 6. Critically evaluate the output

1. Cross-check each claim against the repository and the supplied evidence.
2. Filter suggestions that conflict with established project conventions.
3. Verify changed files and validation output after a write-capable run.
4. Mark disagreements clearly and explain which evidence supports each side.
5. Check that Kimi addressed the full scope rather than the easiest part.

Kimi is a colleague, not an authority.

### 7. Present results

Report:

- **Kimi's findings:** the useful claims or changes, with evidence.
- **Your assessment:** confirmed points, false positives, gaps, and disagreements.
- **Next steps:** the smallest sensible actions, including any validation still needed.

Clean up the temporary stderr log when finished.

## Setup

- Install Kimi Code CLI using Moonshot's current instructions, then authenticate with `kimi login`.
- Define separate read-only and write-capable agent profiles before using this skill.
- Confirm the selected model and account path before sending a large context packet.

## Boundaries

- Read-only analysis uses the read-only agent profile.
- Write access requires explicit user intent and a recoverable working tree.
- Do not widen the workspace with `--add-dir` unless the task requires it.
- Do not send secrets, credentials, or private source to a provider that is not approved for them.
- "Don't use Kimi" always wins.
