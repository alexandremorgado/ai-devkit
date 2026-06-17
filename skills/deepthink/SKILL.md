---
name: deepthink
description: Deep analytical thinking for complex problems requiring extended reasoning
user-invocable: true
argument-hint: Detailed description of the complex problem or challenge
allowed-tools: ["*"]
disable-model-invocation: true
summary: A structured extended-reasoning framework — decompose, explore options, analyze deeply, apply patterns, assess risk, and produce an implementation strategy — for any stack.
example: "/deepthink how should we cache images app-wide without unbounded memory growth?"
type: skill
category: workflow
platform: cross
portability: portable
publish: public
adaptation_notes: "Nearly framework-only and stack-agnostic — the six-step framework and extended-thinking guidelines port verbatim. The only thing to localize is the 'Project-Specific Considerations' section: replace the placeholder prompts with your own architecture, performance targets, security model, and platform constraints (or let the agent infer them from the repo). Base branch is auto-detected; the sibling skill ensure-tests is referenced only for test timing and is optional."
---

# DeepThink — Extended Reasoning Mode

A complex challenge that deserves careful analysis and extended thinking. Repository-agnostic: the framework is universal; the "Project-Specific Considerations" section is where you (or the agent, from repo context) plug in this codebase's realities.

## Challenge Description:
$ARGUMENTS

## Analytical Framework

### 1. Problem Decomposition
- Break the problem into smaller, manageable components.
- Identify core requirements and constraints.
- Map dependencies between the parts.
- Clarify ambiguous requirements before proceeding.

### 2. Solution Exploration
- Consider multiple approaches and their trade-offs.
- Evaluate feasibility of each.
- Compare against the project's constraints.
- Think through implementation complexity.

### 3. Deep Analysis
- Use step-by-step reasoning through each component.
- Document assumptions and validate them.
- Consider edge cases and failure modes.
- Analyze performance implications.
- Review security and privacy considerations.

### 4. Architecture & Design Patterns
- Apply patterns that already exist in this codebase (find the closest analog and mirror it).
- Respect the project's module boundaries and dependency direction.
- Follow the established dependency-injection / wiring approach.
- Consider scalability and maintainability.
- Keep concurrency/threading rules intact (isolation, ownership, immutability).

### 5. Risk Assessment
- Identify technical risks.
- Consider backwards-compatibility impact.
- Evaluate the blast radius on existing features.
- Plan mitigation strategies.
- Call out anything that affects the current top-priority effort.

### 6. Implementation Strategy
- Define clear implementation phases.
- Prioritize by dependency and risk.
- Create testable milestones.
- Plan for iterative refinement.
- Target the repo's base branch (auto-detect it: prefer `origin/develop`, else the remote's default branch, else `main`).

## Project-Specific Considerations

> Replace these prompts with this project's realities — or infer them from the repo (README, ARCHITECTURE, CLAUDE.md/AGENTS.md, CI config, dependency manifests). The point is to ground the reasoning in *this* system, not a generic one.

- **Architecture**: What is the module/layer structure? Which direction do dependencies flow? Where does new code of this kind belong?
- **Data & integrations**: External services, persistence, third-party SDKs, and the failure/recovery behavior each demands.
- **Performance targets**: The latency/memory/throughput/startup budgets this change must respect.
- **Concurrency model**: Threading/async rules, isolation boundaries, shared-state hazards.
- **Security & privacy**: Trust boundaries, secret handling, authn/authz, data-handling obligations.
- **Platform constraints**: Minimum OS/runtime versions, UI conventions, accessibility, offline behavior.
- **Product priorities**: The current top-priority initiative this work must align with or avoid disrupting.

## Extended Thinking Guidelines
- Explore all angles before committing to one.
- Challenge initial assumptions.
- Weigh immediate vs long-term implications.
- Balance the ideal solution against practical constraints.
- Document reasoning for future reference.
- Keep user experience in view.

## Test Timing Guidance
- Deep analysis focuses on architecture, design, and implementation strategy.
- Detailed test planning happens during implementation, not in initial analysis.
- Use the `ensure-tests` skill (if installed) before a PR to validate coverage and quality.
- Only mention tests here if they're a critical constraint (e.g. "must maintain a 100% pass rate").

## Critical Reminders
- **Base branch**: auto-detect — don't assume `main` vs `develop`.
- **Never commit** without user approval.
- **Follow this repo's existing patterns** for any new code.
- **Security**: handle secrets and sensitive data per the project's model.
- **Documentation**: if the repo keeps branch plans, record the chosen approach there (e.g. `Docs/branches/<branch>.md`).

Now engage in extended analytical thinking to deliver a thorough, well-reasoned solution.
