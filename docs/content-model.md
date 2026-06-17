# Content model

Every asset (skill, tool, tutorial, case, best-practice) is a directory under its content-type folder containing a markdown file with **YAML frontmatter**. The portal generator (`site/build.mjs`) reads this frontmatter to build the catalog and the per-asset pages, so the fields must be accurate.

## Frontmatter fields

| Field | Required | Values | Notes |
|---|---|---|---|
| `name` | yes | kebab-case | Matches the directory name. |
| `summary` | recommended | one line | Shown on catalog cards and in the adaptation prompt. Falls back to `description` if absent. |
| `example` | recommended (skills/tools) | one line | A literal copy-paste invocation (e.g. `/create-issue the list flashes when filtering`). Shown on the catalog card, the page's "How to use it" block, and the install list. |
| `type` | yes | `skill` \| `tool` \| `tutorial` \| `case` \| `best-practice` | Drives which template renders it. |
| `category` | yes | e.g. `workflow`, `testing`, `architecture`, `conventions`, `performance` | Catalog filter. |
| `platform` | yes | `ios` \| `android` \| `backend` \| `web` \| `cross` | Origin platform (`cross` for stack-agnostic). |
| `portability` | for skills/tools | `portable` \| `adaptable` \| `platform-specific` | Drives the adaptation prompt and filtering. |
| `publish` | yes | `public` \| `private` | **Default `private`.** Only `public` assets on the allowlist reach the generated site. |
| `adaptation_notes` | recommended | free text | Concrete swap hints (e.g. "replace the build tool; keep the `gh` flow"). Feeds the adaptation prompt. |

> Two source-of-truth rules:
> - For **skills**, the canonical content is the existing `SKILL.md` (Claude Code reads it directly). Portal-only fields (`summary`, `example`, `category`, `platform`, `portability`, `publish`, `adaptation_notes`) are added to that same frontmatter — they are ignored by Claude Code and consumed by the portal.
> - For other types, the markdown body is the content; the same frontmatter applies.

## Native Claude Code fields (skills/tools)

A `SKILL.md` also carries the fields Claude Code itself reads. The portal ignores them, but they govern how the skill behaves once installed:

| Field | Notes |
|---|---|
| `description` | What the skill does; Claude Code uses it to decide when to invoke. The portal falls back to it when `summary` is absent. |
| `user-invocable` | `true` lets a developer call the skill directly. |
| `argument-hint` | Example arguments shown when invoking. |
| `allowed-tools` | Tools the skill may use (e.g. `["Bash","Read"]`). |
| `disable-model-invocation` | `true` for orchestration-only skills the model should not auto-invoke. |

## Portability taxonomy

- **portable** — transfers directly with config changes only (repo name, labels, paths). Adaptation prompt asks for a near-verbatim port.
- **adaptable** — the workflow/intent transfers but the implementation (build/test/run tooling, language) differs. Adaptation prompt asks the agent to keep the structure and swap the tooling per `adaptation_notes`.
- **platform-specific** — bound to one stack; shared as a *learning reference*, not for direct reuse. Adaptation prompt is replaced by a "study this pattern" note.

## Animated terminal sessions (optional, recommended for skills)

Every skill/tool page can open with a **"What a run looks like" terminal** — a mock session animated by `site/assets/terminal.js` (commands typed character by character, output revealed line by line, replay button, reduced-motion/no-JS safe). Sessions are **trusted template data** in the `SESSIONS` map in `site/build.mjs`, keyed by asset slug — they are authored in code review, never derived from frontmatter or markdown. Line kinds: `sh` (typed shell command), `cmd` (typed agent input), `out` (dim ⏺ line), `txt` (dim plain line), `ok` (green ✓ line), `blank`. Keep sessions free of secrets and real metrics.

Markdown pages (`site/content/*.md` and asset bodies) can embed two markers, each on its own line:

- `{{TERMINAL:key}}` — renders the animated terminal for `SESSIONS[key]`; "Copy as Markdown" gets a plain fenced session instead.
- `{{DETAILS:Title|optional sub}} … {{/DETAILS}}` — renders a collapsed `<details>` section; the copyable markdown gets a `###` heading instead.

## Skill demos (optional `demo.html`)

A **skill** directory may include a `demo.html` — a small animated visualization rendered as a "See it in action" section at the top of the skill's page (above the adaptation prompt). It exists to *show* what the skill does, not just describe it.

- **Trust boundary.** `demo.html` is the only first-party HTML injected raw (the markdown body stays escaped). The build (`site/build.mjs`) validates it: **HTML + CSS only** — no `<script>`, no inline `on…=` handlers, no network/media elements or attributes, no `javascript:`, no CSS `url()`/`@import`. A violation fails the build. Behavior lives in the shared `site/assets/demo.js`; shared chrome in `site/assets/demo.css`.
- **Step machine.** Author the demo as `<div class="demo-seq" data-steps="N">…</div>` and style each `data-step="0..N"` (CSS transitions). `demo.js` auto-plays the steps, wires the Replay/Step controls, and — for `prefers-reduced-motion` — jumps straight to the final, meaningful frame with no motion.
- **Theme-aware.** Use only theme.css custom properties (so it inverts in dark/light). `demo.css`/`demo.js` are copied into every public build regardless of the per-skill allowlist.

## Publish-safety

This repo is public, so two simple rules govern what ships:

- **Secrets — never, anywhere.** Tokens, keys, and credentials are env-var only and are never committed or built into `dist/` (CI secret-scans both the tree and the build). This rule has no exceptions.
- **`publish` controls the site.** `publish: private` is the **default**; the generator excludes private assets from the build and never emits their full bodies. An asset reaches the generated site only when it is `publish: public` **and** on the reviewed allowlist (`site/public-allowlist.json`).

Everything shipped here is public. The private/allowlist mechanism stays available so you can fork the repo and keep some skills off your own published site (a one-line opt-in per asset, fail-closed by default).
