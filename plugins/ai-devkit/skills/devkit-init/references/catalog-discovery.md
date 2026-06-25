---
title: Catalog discovery, disposition & host paths (reference)
owner: Alexandre Morgado
note: How devkit-init finds the skill catalog, decides what each skill becomes, where it writes, and how it validates what it generated. Phase 6 + Phase 8/9 lean on this — follow it as written.
---

# Catalog discovery, disposition & host paths

`devkit-init` must never classify skills from a hardcoded list — the list drifts and goes
wrong (it has before: buckets that name `smart-commit`/`cleanup` as portable when their frontmatter
says `adaptable`, and that omit `issue-to-branch`/`update-branch-plan` entirely). Always discover the
live catalog and read each skill's **own frontmatter**.

## 1. Catalog discovery (deterministic order)
Find the catalog in this order; stop at the first that resolves, and tell the user which you used:
1. **Sibling installed skills** — the directory where the running agent loaded ai-devkit from
   (Claude: `~/.claude/skills/` or the installed plugin; Codex: `~/.codex/skills/` /
   `~/.codex/prompts/`). This is the source of truth for *what the developer actually has*.
2. **Repo-root `skills/`** — when the skill is being run from inside the ai-devkit repo itself.
3. **Portal catalog** — `https://alexandremorgado.github.io/ai-devkit/catalog.html`, only if the network is reachable
   (gated; needs access). Treat as a cross-check, not primary.
4. **None reachable** → stop and ask the user for a path to the catalog. Do not guess the skill set.

For each discovered skill, read its frontmatter `name`, `portability`, `platform`, `publish`,
`category`, and `adaptation_notes`.

## 2. Scope: which skills are in play
- **In scope:** the dev-process **pipeline skills** — issue → branch → commit → test → PR → review
  → release, plus the helpers that ride along (cleanup, deepthink, update-branch-plan).
- **Out of scope by default:** assets with `publish: private` (internal tools, e.g. an
  internal benchmarking tool) and one-off platform tools. They are not part of a general team
  pipeline; mention them, but don't scaffold them unless the user explicitly asks.

## 3. Disposition matrix (portability × host)
`platform` is `cross` for every skill, so it tells you nothing about host-dependence. Cross the
declared **`portability`** with the **VCS host / tooling you found in Phase 2**:

| Declared `portability` | Host/tool match? | Disposition |
|---|---|---|
| `portable` | host matches (e.g. a `gh` skill on a GitHub repo) | **use as-is** — config-only (repo name, labels, paths) |
| `portable` | host differs (e.g. a `gh` skill on GitLab) | **adapt** — swap the host tool (`gh`→`glab`), keep the workflow |
| `adaptable` | — | **adapt** — keep the workflow, swap build/test/release tooling per `adaptation_notes` |
| `platform-specific` | — | **study-only**, or generate a repo-local equivalent from research |
| (no catalog skill for a stage) | — | **generate** a repo-local conventions skill from what you discovered |

> `create-issue`, `issue-to-branch`, and `finish-branch` are tagged `portable` but are `gh`-bound —
> on a non-GitHub host they fall into the **adapt** row, not use-as-is.

## 4. Host & path matrix (write where THIS agent loads skills)
Detect which agent is running (you know your own identity; if ambiguous, look for `.claude/` vs
`.codex/` in the repo, or ask). **Never silently write `.claude/` files for a Codex user.**

| Host | Use-as-is (portable, host matches) | Adapted / generated (repo-local) |
|---|---|---|
| **Claude Code** | already available via the installed plugin; nothing to write | `.claude/skills/<name>/SKILL.md` (auto-discovered) |
| **Codex** | install the plugin: `codex plugin add ai-devkit@ai-devkit` (then a new thread) | `.codex/skills/<name>/` **if the installed Codex auto-loads project skills** — verify with `codex doctor`; otherwise place under a neutral `.ai-devkit/skills/<name>/` and give load instructions in the handoff |
| **Other / unsure** | — | ask the developer where their agent loads project skills; do not default to `.claude/` |

The process doc (`DEVELOPMENT-PROCESS.md`), the non-activating CI snippet, and the adoption marker
(`.ai-devkit/adoption.json`) are host-neutral and written at the repo root regardless.

## 5. Adoption marker — `.ai-devkit/adoption.json`
Machine source of truth for update-mode (Phase 9). Write it on scaffold; never parse
`DEVELOPMENT-PROCESS.md` as the source of truth (that's the human summary). Shape:

```json
{
  "schemaVersion": 1,
  "adaptedAt": "<ISO-8601 timestamp>",
  "host": "claude-code | codex | other",
  "source": { "repo": "alexandremorgado/ai-devkit", "ref": "<branch-or-tag-if-known>" },
  "monorepoTarget": "<package/dir or null>",
  "skills": [
    { "name": "create-issue", "disposition": "use-as-is", "targetPath": null,
      "sourceHash": "<hash of the upstream SKILL.md you classified>" },
    { "name": "ensure-tests", "disposition": "adapt", "targetPath": ".claude/skills/ensure-tests/SKILL.md",
      "sourceHash": "<hash>" }
  ]
}
```

On re-run, recompute each upstream `sourceHash`; propose only **new** skills and ones whose hash
**changed** since `adaptedAt`. Apply the same three gates to the delta.

## 6. Validate every generated skill (non-destructive)
The repo's mirror validator only checks `name` + `description`. A skill you *generate* into a
developer's repo must meet the fuller content-model bar before you call it done:
- `name` matches its directory.
- Required frontmatter present: `name`, `summary`/`description`, `type`, `category`, `platform`,
  `portability`, `publish`.
- **Destructive skills** (anything that runs `gh`/`git`/release commands) ship with a
  **dry-run/preview default**, a **narrow `allowed-tools`**, and **`disable-model-invocation: true`**
  until the developer has reviewed them.
- **Do not smoke-run a destructive skill to "test" it** — e.g. a generated `create-issue` contains a
  live `gh issue create`. At most, run a skill's dry-run/preview path. Verification is reading +
  `git diff --check`, not execution.
