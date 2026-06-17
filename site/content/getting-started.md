This page assumes **zero experience with AI tools**. If you can use a terminal, you'll be productive in about ten minutes — it walks you from "what even is an AI coding agent?" to running these workflows in your own repo. Already set up? Jump to step 3 or browse the **Catalog** tab above.

## 1. What is an AI coding agent?

An AI coding agent is a program that runs **in your terminal**, inside any repo. You type what you want in plain English; the agent reads your code, edits files, and runs commands to get it done — showing you everything it does and asking before anything risky. Think of it as a fast pair programmer that never gets tired of the boring parts.

A session looks like this:

{{TERMINAL:onboarding}}

ai-devkit works with two popular agents. Both work the same way, and everything on this site works with both:

| Agent | Made by | Install | Run |
|---|---|---|---|
| **Claude Code** | Anthropic | `npm install -g @anthropic-ai/claude-code` | `claude` inside a repo — [docs](https://code.claude.com/docs) |
| **Codex** | OpenAI | `npm install -g @openai/codex` | `codex` inside a repo — [docs](https://developers.openai.com/codex) |

Both need an account or license to sign in on first run.

## 2. What is ai-devkit, and why install it?

Out of the box, an agent is a capable generalist — but it doesn't know *your* conventions: how you like to write issues, name branches, group commits, or decide when a branch is ready for a PR.

**ai-devkit is a plugin: a bundle of skills that teaches the agent a proven daily loop.** A *skill* is a written playbook (a markdown file) the agent follows step by step. After one install, in **every** repo you work on, you can type things like:

- `/create-issue the favorites list flashes when filtering by date` — and get a well-formed GitHub issue with the right labels, repro steps, and a duplicate check.
- `/smart-commit` — and your messy working tree becomes 2–5 clean, atomic commits (you approve the plan first; it never pushes).
- `/finish-branch` — and the agent verifies the branch is actually done, runs the tests, and opens the PR.

(That's the Claude Code form — in Codex the same skills are invoked with a `$`, e.g. `$create-issue`, or by simply naming them in a sentence.)

The skills are versioned in the [alexandremorgado/ai-devkit repo](https://github.com/alexandremorgado/ai-devkit) — this site is generated from that repo, so what you read here is exactly what installs.

## 3. Install ai-devkit (two commands)

### Claude Code

Run `claude` anywhere, then type these two commands at its prompt:

```
/plugin marketplace add alexandremorgado/ai-devkit
/plugin install ai-devkit@ai-devkit
```

That's it — the skills are available immediately, in every repo. (The first command points Claude Code at the repo, the second installs the bundle.)

### Codex

In your shell (not inside a session):

```
codex plugin marketplace add alexandremorgado/ai-devkit
codex plugin add ai-devkit@ai-devkit
```

Then start a **new** Codex session so the freshly installed skills load.

### Check it worked

In Claude Code, type `/` — `create-issue`, `smart-commit`, and the rest should appear in the command list. In Codex, just ask: *"what skills do you have from ai-devkit?"*

### Keeping it updated

Plugins don't auto-pull new commits, so refresh when the repo ships changes:

**Claude Code**
```
/plugin marketplace update ai-devkit
/plugin install ai-devkit@ai-devkit
/reload-plugins                       # or just start a new conversation
```

**Codex** — in your shell, then start a new Codex session:
```
codex plugin marketplace upgrade
codex plugin add ai-devkit@ai-devkit
```

## 4. Your first five minutes

Try these in a repo you actually work on. A skill is invoked by typing `/its-name` in Claude Code, or `$its-name` in Codex, followed by your input in plain words — there is no other syntax to learn. (In Codex you can also just name the skill in a sentence.) The examples below use the Claude Code form.

**Turn one sentence into a GitHub issue:**

```
/create-issue the favorites list flashes when you filter by date
```

The agent checks for duplicates, infers the type and labels from your repo's own label set, writes repro steps and acceptance criteria, and shows you the draft before creating anything.

**Turn an issue into a planned branch:**

```
/issue-to-branch #482
```

You get a branch named by your conventions plus a *branch plan* — a markdown checklist of the work, which the other skills keep updated as you go.

**Clean up a messy working tree:**

```
/smart-commit
```

The agent groups your uncommitted changes into 2–5 atomic commits with semantic prefixes (`Fix:`, `Feat:`, …), shows you the plan, and only commits after you approve. It **never** pushes.

## 5. The daily loop

The skills chain into one loop — from "someone found a bug" to "PR opened". Use any step on its own; they also hand off to each other automatically.

| Moment in your day | You type | What happens |
|---|---|---|
| Someone reports a bug, or you have an idea | `/create-issue …one sentence…` | Well-formed issue: type, labels, repro steps, duplicate check |
| You pick up an issue | `/issue-to-branch #482` | Branch (or worktree) + a development plan built from your repo |
| Starting without an issue | `/create-branch …a sentence…` | A well-named branch from your changes or a short description |
| Your branch fell behind main | `/update-from-branch main` | Merge/rebase from main, auto-stashing dirty work, conflicts surfaced |
| You've been coding and the tree is messy | `/smart-commit` | 2–5 atomic commits, plan shown first, never pushes |
| Before you push | `/ensure-tests` | Decides what needs tests, runs the suite, fixes failures to 100% |
| The work feels done | `/finish-branch` | Readiness checks, plan archived, PR opened or updated |
| Anytime, before review | `/cleanup --branch` | Finds debug prints, leftover comments, commented-out code |
| Stuck on something genuinely hard | `/deepthink …the problem…` | Structured extended reasoning → an implementation strategy |
| A bug won't reproduce or won't die | `/ultrafix …the symptom…` | Isolated worktrees + structured logging → root cause + verified fix |
| Want a second agent's take | `/codex-buddy review this branch` | Codex reviews or debugs independently; Claude cross-checks the findings |
| The plan drifted from reality | `/update-branch-plan` | Conservatively syncs plan checkboxes with your commits |

The "You type" column shows the Claude Code form — in Codex, type `$the-name` instead (e.g. `$smart-commit`), or just name the skill in plain words.

## 6. Everything the plugin installs

Exactly these skills — nothing else, no hooks, agents, or background processes:

{{INSTALLED_SKILLS}}

## 7. Words you'll see around here

| Word | What it means here |
|---|---|
| **agent** | The AI program in your terminal — Claude Code or Codex. |
| **skill** | A markdown playbook that teaches the agent one workflow. Run one by typing `/its-name`. |
| **plugin** | A bundle of skills installed together. `ai-devkit` is one plugin carrying the whole set. |
| **marketplace** | Where an agent looks for plugins. Adding this repo as a marketplace is install step one. |
| **branch plan** | The markdown checklist `issue-to-branch` creates for a branch; other skills keep it honest. |
| **portability** | How well a skill travels: *portable* (works as-is), *adaptable* (same idea, swap the tooling), *platform-specific* (read it for the pattern). |
| **adaptation prompt** | A ready-made prompt on every skill page that makes *your* agent rewrite the skill for *your* stack. |

## 8. When a skill doesn't fit your stack: adapt it

A skill is a playbook, not a binary — so you never port one by hand. Open any skill in the **Catalog**, copy its **Adapt to your platform** prompt, fill in your stack and conventions, and paste it into Claude or Codex. The agent reads the skill and produces an adapted version (markdown plus any scripts) for your project. If you ship that adaptation, consider contributing it back as a case so others see the worked example.

## 9. No agent? Read the skills directly

A skill is just a markdown file — you don't need an agent to benefit. Clone the repo and read any `skills/<name>/SKILL.md`: it's a step-by-step playbook you can follow by hand, or paste into any LLM.

```
gh repo clone alexandremorgado/ai-devkit
cd ai-devkit
```

This site is generated from those same files (`npm run build` writes `dist/`), so the catalog never drifts from the source.

## 10. Questions, ideas, contributions

Found a rough edge in a skill, or built a workflow worth sharing? A skill is just a markdown file — contributing one is a single PR. See the **Contribute** tab above, or open an issue on [alexandremorgado/ai-devkit](https://github.com/alexandremorgado/ai-devkit/issues).
