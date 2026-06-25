---
title: Scaffold safety checklist (reference)
owner: Alexandre Morgado
note: Run every item before devkit-init writes any file into a developer's repo.
---

# Scaffold safety checklist

`devkit-init` may write files into a developer's own repository (Phase 8). Writing into someone's project is high-trust — run this checklist **every** time, even when the skill was invoked explicitly. `disable-model-invocation` only prevents auto-triggering; it is not a write guard.

Scaffolding has two gates: **Gate 2** cuts an isolated branch (the first repo mutation), then **Gate 3** writes each file. Analysis (Phases 1-7) precedes both and changes nothing.

## Gate 2 — cut the isolated branch first
- [ ] **Clean tree, or isolate.** Capture `git status --short`. Scaffolding must land on an isolated branch (or a **git worktree** cut from the base), never on the integration branch. If the tree is dirty, prefer a worktree, or have the developer stash/commit first. Writing on the current branch is allowed **only** as an explicit, labelled **non-isolated** opt-in.
- [ ] **Show before cutting.** Display repo root (`git rev-parse --show-toplevel`), the base/integration branch, and the proposed branch name (default `chore/adopt-ai-devkit`; honor the repo's discovered prefix). Cut only on approval.
- [ ] **Unset upstream** after cutting, so a stray push can't land on the integration branch.

## Before any write
- [ ] **Repo root confirmed.** You are at the intended repo root (not a parent, not `$HOME`). Re-derive with `git rev-parse --show-toplevel` and show it to the user.
- [ ] **Clean-tree snapshot.** Capture `git status --short`. If a target path has uncommitted changes, warn and require explicit confirmation, or abort.
- [ ] **Monorepo target chosen.** If the repo has multiple packages/modules, the user has picked which one receives the skills.
- [ ] **Path allowlist.** The only writable paths are: the **host-aware skill dir** (`.claude/skills/<name>/**` for Claude; the host's equivalent for Codex — see `catalog-discovery.md`), one CI snippet at a user-named path, the process doc (`DEVELOPMENT-PROCESS.md`), and the adoption marker (`.ai-devkit/adoption.json`). No edits to existing source, build config, lockfiles, or CI already in place — propose a snippet and let the human merge it. Write the CI snippet as a non-activating file (e.g. `*.snippet.yml`) so it can't run until wired in.

## Per file (Gate 3)
- [ ] **Collision check.** If the path exists, show a diff against current content and require an explicit per-file approve/skip. NEVER overwrite silently — a collision always forces an explicit decision, even under "approve all remaining". With an approver, you may write under a distinct name (suffix the context, e.g. `release-web`) instead of overwriting; with **no** approver, **skip the file** — never overwrite and never synthesize an unapproved alternate.
- [ ] **Preview.** Show the full proposed content (new) or a diff (replacement). Offer All / Pick / Skip; "approve all remaining" may batch the *new-file* writes after the developer has seen them, but secret-scan and collision checks still run on every file.
- [ ] **Secret scan.** Reject the file if it contains anything resembling a token, key, credential, private hostname, or connection string. Secrets belong in the environment, never in generated files.

## After writing
- [ ] **`git diff --check`** for whitespace/conflict errors.
- [ ] **Summary.** Report exactly what was created, what was skipped, and the next step (review the diff, then commit). Do NOT commit or push — leave that to the developer (or their commit skill).

## Non-interactive / headless runs
If you cannot reach a human for approval (a delegated or automated run), do **not** cut a branch and do **not** scaffold — stop at the Phase 7 adoption plan. Never auto-approve your own writes or your own branch creation. On any collision, **skip** — never block on a prompt, never overwrite, and never synthesize an alternate name without approval.

## If anything is uncertain
Stop and ask. The Phase 7 advice doc is already a complete, useful deliverable — scaffolding is a bonus, not a requirement. When in doubt, write less.
