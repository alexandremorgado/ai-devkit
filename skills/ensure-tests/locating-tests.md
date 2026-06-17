# Locating Tests

Where tests live, how they're discovered or registered, and how to fix "test not found" — per ecosystem. Don't assume; confirm against the repo's actual layout, then mirror the closest existing test.

## Where tests live & how they're discovered

| Stack | Conventional location | Discovery / registration |
|---|---|---|
| Node | `__tests__/`, `*.test.ts`, `*.spec.ts` (next to source or under `test/`) | Test runner glob in `jest.config`/`vitest.config`/`package.json` |
| Python | `tests/`, `test_*.py` / `*_test.py` | pytest auto-discovery (`testpaths`, `python_files` in `pyproject.toml`/`pytest.ini`) |
| Go | `*_test.go` **beside** the code under test | `go test` auto-discovers `Test*` funcs in the package |
| Rust | `#[cfg(test)] mod tests` inline, plus `tests/` for integration | Cargo discovers `#[test]` fns; `tests/` files are separate crates |
| Java/Kotlin | `src/test/java` / `src/test/kotlin` mirroring `src/main` | Gradle/Maven Surefire pattern (`*Test`, `*Tests`) |
| .NET | a `*.Tests` project | test SDK + `[Fact]`/`[Test]` discovery |
| Ruby | `spec/` (`*_spec.rb`) or `test/` | RSpec/Minitest load paths |
| PHP | `tests/` | `phpunit.xml` `<testsuites>` |
| Swift (SwiftPM) | `Tests/<Module>Tests/` | a `.testTarget(...)` entry in `Package.swift` (must list the module + its deps) |
| Apple (Xcode) | a test target in the project, optionally a `.xctestplan` | target membership + the scheme's test plan |
| Dart/Flutter | `test/`, `*_test.dart` | `flutter test` auto-discovery |

## Adding a new test file — the checklist

1. **Put it where the runner already looks** (mirror a neighboring test's path and naming).
2. **Register it if the ecosystem requires it** — the usual gotchas:
   - Swift SwiftPM: add/extend the `.testTarget` in `Package.swift` and list the module + every dependency it imports.
   - JVM: ensure it's under `src/test/...` and matches the Surefire/Gradle name pattern (`*Test`).
   - .NET: the file must belong to a test project that references the project under test.
   - Node: confirm it matches the configured `testMatch`/`include` glob.
3. **Import the unit under test** the way the repo does (`@testable import` in Swift, relative import in TS/Python, same-package in Go).
4. **Run just that file/test first** (see `test-patterns.md`) to confirm it's discovered before running the whole suite.

## "Test not found" / "no such module" — quick fixes

- **Not discovered:** wrong directory or filename — match the runner's glob/pattern exactly; check `testpaths`/`testMatch`/Surefire config.
- **Module/import not found:** the test target doesn't depend on the module (SwiftPM `Package.swift`, JVM build file) — add the dependency; for Swift use `@testable import`.
- **Stale build / cache:** clear the build cache (`go clean -testcache`, delete `~/Library/Developer/Xcode/DerivedData/*`, `cargo clean`, remove `node_modules/.cache`) and re-run.
- **Runs locally, not in CI (or vice-versa):** you're using a different command than CI — copy CI's exact invocation, including the test plan/filters and working directory.
