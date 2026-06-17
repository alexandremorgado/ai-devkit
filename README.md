# ai-devkit

**Teach your AI coding agent a proven dev loop.** ai-devkit is a toolbox you install into an AI coding agent — Claude Code or Codex. One install teaches the agent a battle-tested daily loop: turn a sentence into a GitHub issue, an issue into a planned branch, messy changes into clean commits, and a finished branch into a PR — in **any** repo you work on, in any language.

It is two things at once:
1. **An asset repo** — versioned, reusable agent *skills*, discoverable and adaptable to any stack.
2. **A knowledge portal** — **[alexandremorgado.github.io/ai-devkit](https://alexandremorgado.github.io/ai-devkit/)**, generated from the assets in this repo so it never drifts from source.

> **New to AI coding agents?** An agent is a program that runs in your terminal: you type what you want in plain English, and it reads your code, edits files, and runs commands — showing its work and asking before anything risky. The portal's **[Start here guide](https://alexandremorgado.github.io/ai-devkit/getting-started.html)** assumes zero AI experience.

## Quickstart

### 1. Get an agent

| Agent | Install | Run |
|---|---|---|
| **Claude Code** (Anthropic) | `npm install -g @anthropic-ai/claude-code` | `claude` inside a repo — [docs](https://code.claude.com/docs) |
| **Codex** (OpenAI) | `npm install -g @openai/codex` | `codex` inside a repo — [docs](https://developers.openai.com/codex) |

### 2. Install ai-devkit (two commands)

**Claude Code** — inside a session, type:
```
/plugin marketplace add alexandremorgado/ai-devkit
/plugin install ai-devkit@ai-devkit
```
The skills are available immediately, in every repo. Prefer a single skill instead of the whole plugin? Drop its `SKILL.md` (with any `references/`) into `~/.claude/skills/<name>/`.

**Codex** — in your shell:
```
codex plugin marketplace add alexandremorgado/ai-devkit
codex plugin add ai-devkit@ai-devkit
```
Start a new Codex thread afterwards so the skills load.

**Updating** — plugins don't auto-pull new commits, so refresh when the repo ships changes:
- **Claude Code:** `/plugin marketplace update ai-devkit`, then re-run `/plugin install ai-devkit@ai-devkit`, then `/reload-plugins` (or start a new conversation).
- **Codex:** `codex plugin marketplace upgrade`, then `codex plugin add ai-devkit@ai-devkit` (then start a new Codex thread).

### 3. Use it — the daily loop

A skill is invoked by typing `/its-name` in Claude Code, or `$its-name` in Codex, plus plain words — no other syntax to learn. The skills chain into one loop, from "someone found a bug" to "PR opened" (the table shows the Claude Code form):

| Moment in your day | You type | What happens |
|---|---|---|
| Someone reports a bug, or you have an idea | `/create-issue …one sentence…` | Well-formed issue: type, labels, repro steps, duplicate check |
| You pick up an issue | `/issue-to-branch #482` | Branch (or worktree) + a development plan built from your repo |
| Starting without an issue | `/create-branch …a sentence…` | A well-named branch from your changes or a short description |
| Your branch fell behind main | `/update-from-branch main` | Merge/rebase from main, auto-stashing dirty work, conflicts surfaced |
| The working tree is messy | `/smart-commit` | 2–5 atomic commits, plan shown first, never pushes |
| Before you push | `/ensure-tests` | Decides what needs tests, runs the suite, fixes failures to 100% |
| Time to review | `/pr-partner 482` | Metadata + CI + code-risk + comment triage → a merge verdict |
| The work feels done | `/finish-branch` | Readiness checks, plan archived, PR opened or updated |
| Anytime, before review | `/cleanup --branch` | Finds debug prints, leftover comments, commented-out code |
| Stuck on something hard | `/deepthink …the problem…` | Structured extended reasoning → an implementation strategy |
| A bug won't reproduce or won't die | `/ultrafix …the symptom…` | Isolated worktrees + structured logging → root cause + verified fix |
| The plan drifted from reality | `/update-branch-plan` | Conservatively syncs plan checkboxes with your commits |

## The core idea: adapt, don't install

A skill is a *workflow + conventions*, not a binary. A skill written for one stack rarely runs as-is on another — but its **intent and structure** transfer. So instead of copying, you **read it and have your agent regenerate an adapted version** for your stack.

Every skill in the catalog is tagged for portability and ships an **"Adapt to your platform" prompt** you paste into Claude or Codex:

- **Portable** — transfers directly with config changes (e.g. `gh`/git workflows like `create-issue`).
- **Adaptable** — concept transfers, implementation differs (e.g. testing/review/debugging workflows).
- **Platform-specific** — instructive, but tied to one stack (read it for the pattern).

## What the plugin installs

Exactly the contents of `skills/` — twelve `SKILL.md` playbooks, no hooks, agents, or background processes:

| Skill | What it does |
|---|---|
| `create-issue` | Create a well-structured GitHub issue with inferred type, labels, and duplicate detection. |
| `issue-to-branch` | Create a branch (or worktree) from an issue with a project-aware plan. |
| `create-branch` | Create a branch from your current changes or a one-line description. |
| `update-from-branch` | Sync the current branch from main (merge/rebase), preserving dirty work. |
| `smart-commit` | Group changes into atomic, semantically-prefixed commits. |
| `ensure-tests` | Decide whether tests are needed, run the suite, fix failures, annotate the plan. |
| `pr-partner` | Review a PR end to end — metadata, CI, code-risk, comment triage, merge verdict. |
| `finish-branch` | Validate readiness, run tests/build, finalize the plan, open/update the PR. |
| `cleanup` | Detect transitional comments, debug code, and commented-out code. |
| `update-branch-plan` | Update branch-plan checkboxes from recent work. |
| `deepthink` | Extended reasoning for complex problems. |
| `ultrafix` | Debug a stubborn bug with isolated worktrees and structured logging. |

The live **[Catalog](https://alexandremorgado.github.io/ai-devkit/catalog.html)** is the always-current list, with a copy-paste example and the full playbook on every skill's page.

## No agent? Read the skills directly

A skill is just a markdown file — no AI required. Clone the repo and read any `skills/<name>/SKILL.md`: it's a step-by-step playbook you can follow by hand or paste into any LLM.

```bash
gh repo clone alexandremorgado/ai-devkit && cd ai-devkit
node site/build.mjs            # optional — regenerate the static site into dist/ (no dependencies)
```

## Repository layout

```
skills/            # agent skills (each is a SKILL.md + optional references/ and demo.html)
tutorials/         # step-by-step guides   (content type; currently empty)
tools/             # standalone runnable tools  (content type; currently empty)
cases/             # real worked examples  (content type; currently empty)
best-practices/    # authoring/prompting conventions  (content type; currently empty)
docs/              # content model + authoring guidance
site/              # portal generator (design system + build.mjs) -> dist/
plugins/ai-devkit/ # marketplace install root — byte-for-byte mirror of skills/ + the plugin manifests
scripts/           # sync-codex-plugin.mjs regenerates the mirror; validate-codex-plugin.mjs guards it (npm test)
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). One rule up front: **never commit secrets** — tokens and keys are supplied via environment variables, never files, and never reach any build.

One mechanical rule: root `skills/` and the root plugin manifests are **canonical**; the marketplaces install from `plugins/ai-devkit/`, a byte-for-byte mirror. After editing skills or manifests, run `npm run sync:plugin` to regenerate the mirror — `npm test` fails on drift.

## License

[MIT](LICENSE) © Alexandre Morgado.
