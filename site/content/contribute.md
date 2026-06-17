## Share an asset

Built a skill, tool, tutorial, case, or best-practice another team could learn from? Contribute it so they can find and adapt it. You don't need to be an AI expert — a skill is just a markdown file describing a workflow step by step, and the agent does the rest.

1. Create a directory under the right content type: `skills/`, `tools/`, `tutorials/`, `cases/`, or `best-practices/`.
2. Add the markdown with frontmatter per the [content model](https://github.com/alexandremorgado/ai-devkit/blob/main/docs/content-model.md). For a **skill** the file is `SKILL.md` (add the portal fields to its existing frontmatter); for other types, any `*.md`.
3. For a skill or tool, set `portability` honestly (`portable` / `adaptable` / `platform-specific`) and write `adaptation_notes` with concrete swap hints — this is what lets another team regenerate it for their stack. Add an `example:` line too — the literal invocation shown on the catalog card and the page's *How to use it* box.
4. Optional but loved: give your skill an animated **"What a run looks like" terminal** by adding a session to `SESSIONS` in `site/build.mjs`, and/or a `demo.html` step-machine (both are described in the content model).
5. List the asset in `site/public-allowlist.json` so the public build includes it, preview your page locally, then open a PR:

```
npm run build:public        # writes dist/ — open it to preview your page
```

CODEOWNERS review the PR; CI runs the build, the plugin-mirror check, and the secret scan.

## Two rules up front

- **Never commit secrets.** Tokens, keys, and credentials are supplied via **environment variables** only — never files. The secret scan fails any PR that contains one.
- **`publish: public` puts an asset on the site.** An asset appears on the generated site only when it is `publish: public` **and** on the reviewed allowlist (`site/public-allowlist.json`). The default is `publish: private`, so a new asset stays off the site until you opt it in — useful if you fork this repo and want to keep some skills private.

See the full guide in [CONTRIBUTING.md](https://github.com/alexandremorgado/ai-devkit/blob/main/CONTRIBUTING.md).
