# Contributing to ai-devkit

Share a skill, tool, tutorial, case, or best-practice so other teams can learn from and adapt it.

## Before you start — two hard rules

1. **Never commit secrets.** Tokens, keys, and credentials are supplied via **environment variables** only — never files, and never built into `dist/`. The CI secret-scan will fail a PR that contains one. This rule has no exceptions.
2. **`publish: public` controls what's on the site.** This repo is public, and an asset reaches the generated site only when it is `publish: public` **and** listed in the reviewed allowlist (`site/public-allowlist.json`). The default is `publish: private`, so a new asset stays off the site until you opt it in — handy if you fork this repo and want to keep some skills private.

## Add an asset

1. Create a directory under the right content type: `skills/`, `tools/`, `tutorials/`, `cases/`, or `best-practices/`.
2. Add the markdown file with frontmatter per [docs/content-model.md](docs/content-model.md). For a **skill**, the file is `SKILL.md` (add the portal fields to its existing frontmatter); for other types, any `*.md`.
3. If your asset is a skill or tool, set `portability` honestly and write `adaptation_notes` with concrete swap hints — this is what makes another team able to adapt it. Add an `example:` line too — the literal invocation shown on its catalog card and the page's *How to use it* box.
4. Add the asset to `site/public-allowlist.json` so the public build includes it.
5. If you touched `skills/` (or the plugin manifests in `.codex-plugin/` / `.claude-plugin/plugin.json`), regenerate the marketplace mirror — root files are canonical, and `plugins/ai-devkit/` is the byte-for-byte copy the Claude Code and Codex marketplaces actually install:
   ```bash
   npm run sync:plugin
   ```
6. Run the portal locally to preview your page:
   ```bash
   npm run build:public      # writes dist/ (no dependencies to install — uses only Node built-ins)
   ```
7. Open a PR. CODEOWNERS will review. CI runs the public build (which enforces the publish allowlist), the mirror-drift check, and the secret scan.

## Adapting someone else's skill to your platform

This is the main consumption path. On any skill's portal page, copy the **"Adapt to your platform"** prompt, fill in your stack, and paste it into Claude or Codex. It will read the skill and produce an adapted `SKILL.md` (+ scripts) for your project. If you ship that adaptation, consider contributing it back as a `case/` so others see the worked example.

## Optional: an animated terminal session

Every skill page can open with a **"What a run looks like" terminal** — an animated mock session (commands typed out, output revealed line by line). Sessions are trusted template data: add one keyed by your skill's slug to `SESSIONS` in `site/build.mjs` (see the existing entries for the line kinds: `sh`, `cmd`, `out`, `txt`, `ok`, `blank`). Keep sessions free of secrets and real metrics. Markdown content pages can also embed `{{TERMINAL:key}}` and collapsed `{{DETAILS:Title|sub}} … {{/DETAILS}}` sections — see [docs/content-model.md](docs/content-model.md).

## Optional: an animated demo

A skill directory may include a `demo.html` — a small, self-contained animated visualization shown as a "See it in action" section at the top of its portal page. It is the one place raw HTML is injected (the markdown body is always escaped), so it is **build-validated**: HTML + CSS only — no scripts, no inline event handlers, no network/media, no `url()`/`@import`. Behavior (the Replay/Step controls) is driven by the shared `site/assets/demo.js`; shared styling lives in `site/assets/demo.css`. Requirements:

- **Theme-aware.** Use only the theme.css custom properties (`var(--accent)`, `var(--surface-2)`, `var(--green)`, …) so the demo inverts in dark/light.
- **Reduced-motion safe.** Build the demo as a step machine: a `<div class="demo-seq" data-steps="N">` whose CSS renders each `data-step="0..N"`. `demo.js` jumps `prefers-reduced-motion` users straight to the final (meaningful) step with no motion.

## Templates

Use the matching template under `.github/` (issue/PR) and the per-type frontmatter in `docs/content-model.md`. Keep `SKILL.md` bodies focused — large reference material goes in `references/`.

## Governance

- PRs target `main`; protect `main` with branch protection and CODEOWNERS review.
- The portal build uses only Node built-ins — there are no dependencies to install, and `node site/build.mjs --public` must stay green.
- A skill/tool that hits a network service must read its credentials from the environment and document the required scope.
