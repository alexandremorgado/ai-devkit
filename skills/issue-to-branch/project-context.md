# Gathering project context for the plan

A good development plan speaks the repo's own language: its directory layout, naming, frameworks,
and conventions. Don't assume a stack — **infer it from the repository's own files** before writing
the plan. This guide explains how an agent should read a repo to understand its architecture and
conventions, regardless of whether it's a web app, backend service, mobile app, library, or CLI.

The goal is to make the generated plan *fit in* — referencing real modules, real commands, and the
patterns already in use — rather than imposing a generic template.

## 1. Read the high-signal entry points first

These files describe the project in the maintainers' own words and usually reveal the stack quickly:

- `README*` — purpose, setup, how to build/test/run, top-level architecture
- `CONTRIBUTING*`, `ARCHITECTURE*`, `docs/`, `Docs/`, any `*.md` design notes
- Agent/assistant guidance: `CLAUDE.md`, `AGENTS.md`, `.cursor/rules`, `.github/copilot-instructions.md`
- `.github/` — PR/issue templates, CODEOWNERS, and CI workflows (`.github/workflows/*.yml`) that
  reveal the canonical build, test, lint, and release commands

## 2. Identify the stack from the dependency manifest

The manifest tells you the language, framework, and tooling. Detect whichever is present:

| Manifest | Ecosystem | Typical build / test |
|----------|-----------|----------------------|
| `package.json` | Node / JS / TS | `npm`/`pnpm`/`yarn`/`bun` scripts (`build`, `test`, `lint`) |
| `pyproject.toml`, `requirements.txt`, `setup.py` | Python | `pytest`, `tox`, `ruff`, `uv`/`poetry` |
| `go.mod` | Go | `go build ./...`, `go test ./...` |
| `Cargo.toml` | Rust | `cargo build`, `cargo test`, `cargo clippy` |
| `pom.xml`, `build.gradle*` | JVM (Java/Kotlin) | `mvn`/`gradle` tasks |
| `*.csproj`, `*.sln` | .NET | `dotnet build`, `dotnet test` |
| `Gemfile` | Ruby | `bundle`, `rspec`, `rake` |
| `composer.json` | PHP | `composer`, `phpunit` |
| `Package.swift`, `*.xcodeproj`, `Podfile` | Swift / Apple | SwiftPM, `xcodebuild` |
| `build.gradle` + `AndroidManifest.xml` | Android | `./gradlew` tasks |
| `pubspec.yaml` | Dart / Flutter | `flutter build`, `flutter test` |

Pull the **actual** scripts/tasks from the manifest (e.g. `package.json` `"scripts"`) rather than
guessing command names. The CI workflow files are the most authoritative source for the commands the
team actually runs.

## 3. Map the directory structure

List the top of the tree to learn how code is organized, then sample representative files:

```bash
git ls-files | sed 's#/.*##' | sort -u           # top-level dirs/files
git ls-files '*/' | awk -F/ '{print $1"/"$2}' | sort -u | head -50   # one level deeper
```

Look for the source root (`src/`, `lib/`, `app/`, `pkg/`, `internal/`, `Sources/`, package
directories, etc.) and how the project modularizes — by layer (controllers/services/models), by
feature/domain, by package, or a monorepo of apps. The new code should slot into that same scheme.

## 4. Infer conventions from existing code

Before proposing where new code goes, find the **closest existing analog** and mirror it:

- Open 2–3 files similar to what the issue asks for. Note structure, naming, and idioms.
- Naming conventions (file casing, class/function naming, test file suffixes like `*_test.go`,
  `*.spec.ts`, `*Tests.swift`, `test_*.py`).
- How dependencies are obtained (DI container, service locator, imports, constructor injection).
- How features are registered/wired (route tables, module registries, plugin manifests, exports).
- How errors, logging, and configuration are handled.
- Test layout and framework (where tests live, how they're named, how they're run).

## 5. Detect git/branch and PR conventions

- Base/integration branch: is it `main`, `develop`, `trunk`? (The skill detects this at runtime.)
- Branch-prefix conventions in existing branches: `git branch -a | sed -E 's#.*/(feature|fix|chore|refactor|docs)/.*#\1#' | sort | uniq -c`
- PR target and template (`.github/pull_request_template.md`), label taxonomy, CODEOWNERS.

## 6. Synthesize into the plan

Translate findings into the `development-plan.md` template so the plan is concrete for *this* repo:

- **Architecture Fit** → the real source path the new code belongs in, and the real modules it touches.
- **Dependencies** → added via the repo's actual manifest.
- **Wiring / Registration** → the real registry/route/manifest entries required.
- **Tests** → the repo's real test framework, location, and run command.
- **Pre-PR Validation** → the repo's real build/test/lint commands (from CI or the manifest scripts).

When the repo is ambiguous or you can't determine a convention, say so in the plan and propose the
most common option for the detected stack rather than inventing repo-specific details.
