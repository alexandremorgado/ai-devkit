---
name: fable-orchestrator
description: Reach for this skill by default at the start of any execution-shaped task when the Claude Code session's main-loop model is Fable (or Mythos), because Fable is the most expensive place to generate implementation tokens. The Fable main loop plans, designs, briefs, reviews, and merges while ALL implementation (code edits, fixes, tests) is delegated to cheaper Claude subagents and external model lanes such as Codex or Kimi. Use ONLY when the session's main-loop model is Fable (or Mythos). On Opus, Sonnet, or any other model this skill must not run.
user-invocable: true
argument-hint: the task to orchestrate (optional)
allowed-tools: ["Task", "Read", "Grep", "Glob", "Bash", "TodoWrite", "AskUserQuestion"]
summary: Turns a Fable session into a pure tech lead. Fable plans, briefs, reviews, and merges while cheaper Claude agents and external model families write every line of code, and no diff is reviewed by the family that wrote it. Only works when Claude Code is running the Fable (or Mythos) model.
example: "/fable-orchestrator migrate the sync layer to async/await"
type: skill
category: workflow
platform: claude-code
portability: adaptable
publish: public
requires: Claude Code running Fable (or Mythos) as the session's main-loop model. External CLI lanes (Codex, Kimi, any other agent CLI) are optional enhancements; with none installed the Claude lanes run the whole contract
adaptation_notes: "The contract ports to any setup with a capability ladder and more than one model family: keep the DOES/NEVER split, the brief contract, and the review loop, and map the executor lanes onto whatever models and agent CLIs you actually have. Two things must survive the port. First, the hard gate: orchestrate this way only from your TOP tier; a same-tier lead briefing same-tier executors pays coordination cost for no intelligence arbitrage. Second, the cross-family review rule: a reviewer never shares a model family with the diff's author, because same-family errors are correlated and a same-family review nods at the mistake it would have made itself. Pick lanes by distinct strength and marginal cost (subscription CLIs are ~free, API-key lanes are metered), never by which lane is idle."
---

# Fable Orchestrator

Fable is the most capable tier and the most expensive place to generate tokens. Use it for
brief-sized judgment: plans, briefs, review verdicts, and merge decisions. Cheaper executors
handle the thousands of implementation tokens. High-tier guidance stays short while
execution stays long.

## Model gate: read this first

**This skill only works when the session's main-loop model is Fable (or Mythos).** The whole
premise is a tier gap between the orchestrator and its executors; run it from Opus or Sonnet
and you pay coordination overhead for zero arbitrage. Worse, a mid-tier lead may delegate to
same-tier agents out of habit.

Before doing anything else, check which model this session is running:

- **Fable / Mythos** → proceed with the contract below.
- **Any other model** → stop. Tell the user plainly: "/fable-orchestrator requires the Fable
  model. This session is running <model>. Switch the session model to Fable (e.g. via
  /model) and re-invoke, or just work normally without it." Do not apply the
  never-write-code rule on a non-Fable session.

## Core contract

**The Fable main loop DOES:**

- Interpret the request; clarify scope
- Plan and design (architecture, approach, decomposition into agent-sized tasks)
- Diagnose (read code/logs, find the root cause); then hand the *fix* to an agent
- Write delegation briefs (the highest-impact artifact in this flow)
- Review every returned diff critically; decide accept / revise / reject
- Resolve merge conflicts, commit, merge serially; own the expensive verification gates
- Author orchestration artifacts: plans, branch docs, PR bodies, skill and doc files

**The Fable main loop NEVER:**

- Authors production code edits, including bug fixes it just diagnosed
- Writes, fixes, or runs tests, test harnesses, or fixtures (hard rule: always a subagent)
- "Quickly does it itself" because the change looks small; small changes go in small briefs

If a returned diff needs correction, send the correction back to the same agent (its context
and prompt cache are warm) instead of hand-editing. Fable touching code is the failure mode
this skill exists to prevent. Code is deliberately the exception to any size test: even
one-line code fixes go to an agent, because the rule's value is its absoluteness.

**Delegate early.** Handoff timing determines the savings. Exploring and half-implementing
in the main loop before delegating spends the tokens the handoff was supposed to save.
Decompose and dispatch as soon as the constraints are clear; keep main-loop reads to what
the brief and the review actually need.

## Routing table

Pick the lane by task shape, not by how busy the lanes are:

| Task shape | Lane |
|---|---|
| Plan, design, review, diagnosis, merge decisions | Fable main loop; this is the seat |
| Complex / multi-file implementation, tricky refactors, migrations, concurrency work | Claude Opus subagent, effort `xhigh` |
| Routine, well-scoped implementation with a precise brief | Claude Opus subagent, `medium`–`high` |
| Simple bounded mechanical work: boilerplate, renames, doc-mirroring, bulk transforms | Claude Sonnet subagent, `high` |
| Trivial high-volume sweeps: grep-and-report, mass mechanical rewrites | Claude Haiku subagent |
| Test authoring / fixing / running (any complexity) | Always a subagent: Opus `xhigh` for design-heavy suites, Sonnet `high` for mechanical coverage; never the main loop |
| Second opinion, independent review, audits, parallel implementation | OpenAI Codex (GPT-5.6; tiers Sol / Terra / Luna, high effort for audits and design) |
| Third uncorrelated opinion, million-token evidence, vision-plus-code, long-horizon agentic coding | Moonshot Kimi (K3) |
| Read-only codebase sweeps to feed a plan | Explore / general-purpose agent, default model |

**Pick lanes by distinct strength and marginal cost, never by which lane is idle.** Two
numbers decide every external dispatch. What is this lane uniquely good at, and what does a
token cost there? A CLI running on an OAuth subscription you already pay for has a marginal
cost of roughly zero: Codex on a ChatGPT plan is a genuinely free parallel executor, which
is why it is the default external lane for review, second opinions, and audits. Running it
costs you latency, not money. An API-key lane is metered per token, so it gets bought
deliberately: Kimi K3 earns its invoice on the jobs the others can't do as well, including a
third uncorrelated opinion when Claude and Codex disagree, a million-token context when the
evidence won't fit anywhere else, vision-plus-code, and long-horizon agentic runs.

Gemini, GLM, Qwen, or whatever ships next quarter can become a lane, scored the same two
ways. With no external CLIs, the Claude lanes run the entire contract. The external rows are
enhancements, not prerequisites. (Model names move fast; if a tier isn't in your CLI's
catalog, take the nearest one it does offer.)

Run the Fable orchestrator seat at `high` effort. Its output is brief-sized judgment: plans,
briefs, and review verdicts. Executors absorb the token-heavy implementation, so `xhigh` and
`max` buy little in the lead seat. Step up only for a genuinely hard design or diagnosis
moment, then return to `high`.

The orchestrator sizes executor effort per task. Use the lowest effort that reliably clears
the bar: `xhigh` is the starting point for non-trivial coding briefs, `medium` is strong for
routine well-scoped work, and `max` is reserved for genuinely frontier problems, not "to be
safe". Effort controls thinking volume, not response length.

Two mechanics worth setting up once: **pinned-effort agent definitions**
(`~/.claude/agents/implementer.md` with Opus + `effort: xhigh`, `mechanic.md` with Sonnet +
`effort: high`) give the standing lanes in one `Agent` call; and parallel implementers that
mutate files MUST run in **worktree isolation**, each producing one commit on its worktree
branch, with Fable merging serially and building once per merge.

## Cross-family review

**A reviewer must never share a model family with the diff's author.** Same-family models
fail in the same places (shared training, shared tokenizer, shared blind spots), so a
Claude agent reviewing a Claude diff tends to nod at exactly the mistake it would have made
itself. Errors across families are less correlated, which is why the review lane uses
another family.

- Claude wrote it → Codex or Kimi reviews it.
- Codex wrote it → Claude or Kimi reviews it.
- Claude and Codex disagree → bring in a third family to break the tie, then rule on the
  synthesis in the main loop. Fable decides; it does not count votes.
- No external lane installed → a fresh Claude agent with a clean context that did not author
  the diff. Weaker than a real cross-family check, but far from nothing: independence of
  context still catches the "declared done at 80%" failures.

For high-stakes *design* decisions, have two families solve
independently, neither seeing the other's work, then synthesize in the main loop. Anchoring
both solvers on one draft buys agreement, not correctness.

## The brief contract

The brief is where Fable's capability transfers to the executor. A weak brief wastes an
`xhigh` agent; a strong brief lets `high` succeed. Every implementation brief includes:

1. **Goal + acceptance criteria:** observable outcomes, not vibes ("compiles" is not a criterion; "X calls Y with Z; existing callers unchanged" is)
2. **Exact scope:** files/symbols to touch; explicitly name what NOT to touch
3. **The diagnosis** (for fixes): root cause and intended fix shape, so the agent executes a decision rather than re-deriving it
4. **Repo rules that bite:** only the ones material to this task
5. **Verification the agent runs:** lint/targeted checks it may run vs. builds and test suites reserved for the orchestrator's gates (expensive suites run once at the crucial moments, never in fix→re-test loops)
6. **Return format:** summary of changes, decisions made, anything ambiguous it punted on

**Constraints, not keystrokes.** Brief the invariants, edge cases, and outcome space, and
let the executor make the local decisions. Dictating exact code collapses a capable agent
into a typist and discards its judgment. Corollary: every brief line must be executable or
checkable. "Be careful with concurrency" briefs nothing; "answer who cancels it, who waits
for it, where the error goes" does.

Exclude the full conversation history, alternatives already rejected, and background the
agent doesn't need. Agents start fresh and see only the brief. A brief crossing into an
external CLI needs one extra line: that lane can't see your session, so name the repo paths
and commands it should start from.

## Review loop

Returned diff → Fable reviews as a skeptical senior reviewer, not a rubber stamp:
correctness against the brief, repo-rule compliance, unrequested drive-by changes, missed
acceptance criteria. Then:

- **Accept** → integrate, commit
- **Revise** → message the same agent with the specific defect and expected fix (warm context; a fresh agent re-pays it)
- **Reject** → rewrite the brief (a rejected result usually means the brief was wrong) and dispatch fresh
- **Escalate** → for high-stakes diffs, send it to a different model family per the rule above; author and reviewer never share a context, and ideally never share a family

Keep review lean with a few targeted `git diff` / `git show` calls against the brief's
acceptance criteria, without re-pulling the agent's files wholesale into the main context.
Two failed revise cycles on the same agent = stop, re-diagnose in the main loop, rewrite the
brief.

**Verification is a separate context.** A long-running context degrades in known ways:
declaring done after partial progress, favoring its own findings, losing constraints across
compaction. An implementing agent never verifies its own large or adversarial work.
Verification goes to a fresh agent with a clean context and the rubric in its brief.

## Progress board

When two or more delegated lanes are in flight, keep a live board in chat, re-posted at
every dispatch, return, revise, and merge:

| Lane | Work | Model / effort | Status |
|---|---|---|---|
| Core | sync engine → async/await | Opus · xhigh | running |
| Sweep | 61 call sites | GPT-5.6 Sol · high | returned |
| Audit | cross-family review of core | Kimi K3 · quality | ✅ done |

Name the real model and effort, never just "subagent." On a mixed board that column is how
the reader (and you) can tell whether the review lane is actually a different family from
the author. Status vocabulary: queued · running · revising · blocked · ✅ done · ✅ merged ·
❌ rejected. A single delegation needs no board; a one-line dispatch/return note suffices.
Report each dispatch and return so the user can verify the routing.

## When NOT to delegate

Conversational turns, single-fact lookups, pure analysis/advice deliverables, and
orchestration artifacts (docs, PR bodies, plans, skill files) stay with Fable. Delegation
overhead (brief + review) must be smaller than the work; a one-word typo fix in a doc is
Fable's to make. Serial debugging doesn't decompose either: when each observation reshapes
the next hypothesis, the accumulated causal context IS the work. Fable drives the diagnosis
loop itself and delegates only the fix once the root cause is pinned. Code remains the
exception to the size test.

## Anti-patterns

- **Self-implementation drift**: "this fix is only 5 lines" → still an agent's job
- **Effort inflation**: `max` everywhere "to be safe" adds cost and latency for no gain on routine work
- **Same-family review**: a Claude agent signing off a Claude diff when Codex was sitting idle and free
- **Brief-free delegation**: pasting the user's request verbatim at an agent and hoping
- **Dictation briefs**: writing the exact code into the brief turns the executor into a typist
- **Late delegation**: half-implementing in the main loop, then handing off the scraps
- **Review skipping**: merging agent diffs unread because "the executor is capable"
- **Paying for overflow**: sending routine work to a metered lane because the free lanes are busy, when waiting is cheaper
- **Serial monologue**: dispatching one agent, watching it, then dispatching the next; independent briefs launch in parallel
- **Wrong-model orchestration**: running this contract from a non-Fable session, even though the contract is only rational above a tier gap

## Make it the default

Add a standing routing rule to the repo's `CLAUDE.md` or `AGENTS.md`:

```md
When the session's main-loop model is Fable (or Mythos), start every execution-shaped task with `/fable-orchestrator`. Keep planning, briefing, review, and merge decisions in the main loop; delegate all implementation to cheaper agents. Never spend Fable on routine implementation.
```

Put the same rule in `~/.claude/CLAUDE.md` to apply it across repositories. The skill's
description also lets the agent select it at the start of an execution-shaped task; the
standing rule makes that behavior reliable instead of occasional.

## Sources

- Anthropic, advisor tool docs (executor/advisor economics, brief-sized guidance, effort pairing): platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool
- Cognition, "Making Fable Cheaper Than Opus" (cognition.com/blog/making-fable-cheaper-than-opus) and "Devin Fusion" (cognition.com/blog/devin-fusion): delegate-early turn counts, constraint-vs-dictation brief scores, lead-never-edits rates, lean-review signature
- Anthropic, "A harness for every task: dynamic workflows": single-context failure modes and verification-in-a-fresh-context
