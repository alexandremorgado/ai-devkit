---
title: Stage tooling map (reference)
owner: Alexandre Morgado
last-reviewed: 2026-06-18
note: Starting hypotheses, not gospel. Verify each tool is current and maintained before relying on it; if you cannot reach the web, present rows as UNVERIFIED.
---

# Stage tooling map

A seed for `devkit-init` Phase 5. For each pipeline stage it lists the **intent** (what stays the same across platforms) and common tooling per ecosystem. Confirm and refresh these with web research and present 2-3 options with sources — never treat this table as settled.

> **Freshness:** last reviewed 2026-06-18. Release/CI tooling moves fast. Re-verify the current, maintained choice for the target stack before recommending it; rows you cannot verify online must be labelled "unverified".

## issue — capture work as a tracked issue
Intent: a well-formed, labeled, de-duplicated issue.

| Ecosystem | Tooling | Source |
|---|---|---|
| any (GitHub) | `gh issue` (GitHub CLI) | https://cli.github.com |
| GitLab | `glab issue` | https://gitlab.com/gitlab-org/cli |
| Jira | Jira CLI / REST API | https://developer.atlassian.com |

## branch — issue → planned branch
Intent: a conventionally-named branch plus a development plan.

| Ecosystem | Tooling | Source |
|---|---|---|
| any git | `git` + `gh` / `glab` | https://git-scm.com |

## commit — clean atomic commits
Intent: grouped, semantically-prefixed commits; nothing pushed without review.

| Ecosystem | Tooling | Source |
|---|---|---|
| any | `git`; Conventional Commits | https://www.conventionalcommits.org |

## test — decide coverage, run, reach green
Intent: run the right tests; fix failures to a green suite.

| Ecosystem | Tooling | Source |
|---|---|---|
| iOS | `xcodebuild test`; XCTest / Swift Testing | https://developer.apple.com/documentation/xcode |
| Android / JVM | Gradle; JUnit, Espresso, Robolectric | https://developer.android.com/training/testing |
| Web / Node | Vitest or Jest; Playwright | https://vitest.dev · https://playwright.dev |
| Go | `go test` | https://pkg.go.dev/testing |
| Python | pytest | https://docs.pytest.org |

## PR — verify readiness, open/update
Intent: confirm the branch is done; open or update the PR against the integration branch.

| Ecosystem | Tooling | Source |
|---|---|---|
| GitHub | `gh pr` | https://cli.github.com |
| GitLab | `glab mr` | https://gitlab.com/gitlab-org/cli |

## review — review with evidence; respond
Intent: evidence-cited review; structured, non-sycophantic responses.

| Ecosystem | Tooling | Source |
|---|---|---|
| any | host code review (e.g. Claude Code / Codex native PR review) | https://cli.github.com |

## release — tag, promote to testers, ship
Intent: version, build, distribute to testers, then to users.

| Ecosystem | Tooling | Source |
|---|---|---|
| iOS | App Store Connect API, Xcode Cloud, TestFlight, Fastlane | https://developer.apple.com/app-store-connect/api · https://fastlane.tools |
| Android | Gradle Play Publisher, Play Console API, Fastlane `supply`, Firebase App Distribution | https://github.com/Triple-T/gradle-play-publisher · https://firebase.google.com/docs/app-distribution |
| Web | semantic-release, Changesets, host deploy (Vercel / Netlify / Cloudflare Pages) | https://semantic-release.gitbook.io · https://github.com/changesets/changesets |
| Library (npm) | `npm publish` + Changesets / semantic-release | https://docs.npmjs.com/cli/commands/npm-publish |
| Go | GoReleaser | https://goreleaser.com |
| Container / service | CI image build + registry + deploy (GitHub Actions, Argo CD) | https://docs.github.com/actions · https://argo-cd.readthedocs.io |

## MCP servers (recommend only — never auto-write `.mcp.json`)
Suggest servers that match the chosen tooling; the developer installs them. Research current availability and maintenance before recommending — e.g. a GitHub/GitLab MCP (issues/PRs), a filesystem MCP, a CI/CD MCP. Prefer official/first-party servers; flag anything unverified.
