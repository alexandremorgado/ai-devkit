# Test Patterns (multi-stack)

How to run tests, write them, mock dependencies, and control non-determinism — across the common ecosystems. Use the row that matches your project; keep the *structure* (success / failure / async, controlled time + IDs) regardless of language.

## Run the whole suite / one test

| Stack | Whole suite | Single test |
|---|---|---|
| Node (Jest/Vitest) | `npm test` / `pnpm test` | `npx jest -t "name"` · `vitest run -t "name"` |
| Python (pytest) | `pytest -q` | `pytest -k "name"` · `pytest path::test_fn` |
| Go | `go test ./...` | `go test ./pkg -run TestName` |
| Rust | `cargo test` | `cargo test test_name` |
| Java/Kotlin (Gradle) | `./gradlew test` | `./gradlew test --tests '*ClassName.method'` |
| Java (Maven) | `mvn test` | `mvn -Dtest=ClassName#method test` |
| .NET | `dotnet test` | `dotnet test --filter FullyQualifiedName~Name` |
| Ruby (RSpec) | `bundle exec rspec` | `bundle exec rspec path:line` |
| PHP (PHPUnit) | `vendor/bin/phpunit` | `vendor/bin/phpunit --filter methodName` |
| Swift (SwiftPM) | `swift test` | `swift test --filter ModuleTests.testName` |
| Apple (Xcode) | `xcodebuild test -scheme S -destination '…'` | add `-only-testing:Target/Class/method` |
| Dart/Flutter | `flutter test` | `flutter test test/foo_test.dart -n "name"` |

> Always prefer the exact command your **CI workflow** runs — it encodes the right flags, environment, and test plan.

## Structure: success / failure / async

The same three-shape coverage works everywhere. Two illustrative dialects:

**TypeScript (Jest/Vitest):**
```ts
import { loadUser } from "../user";

test("loadUser returns a user on success", async () => {
  const api = { get: vi.fn().mockResolvedValue({ id: "1", name: "Ada" }) };
  const user = await loadUser(api, "1");
  expect(user.name).toBe("Ada");
});

test("loadUser surfaces an error on failure", async () => {
  const api = { get: vi.fn().mockRejectedValue(new Error("network")) };
  await expect(loadUser(api, "1")).rejects.toThrow("network");
});
```

**Python (pytest):**
```python
import pytest

def test_load_user_success(monkeypatch):
    api = FakeApi(result={"id": "1", "name": "Ada"})
    assert load_user(api, "1").name == "Ada"

def test_load_user_failure():
    api = FakeApi(error=RuntimeError("network"))
    with pytest.raises(RuntimeError, match="network"):
        load_user(api, "1")

@pytest.mark.asyncio
async def test_fetch_is_awaited():
    assert await fetch_async() == "ok"
```

## Mock dependencies

Inject collaborators (HTTP clients, DBs, clocks) rather than reaching for globals — then a test can substitute a fake.

- **Node:** `vi.fn()` / `jest.fn()`, or pass a stub object. Avoid mocking what you don't own; wrap it.
- **Python:** `monkeypatch`, `unittest.mock`, or a hand-written fake passed in.
- **Go:** accept an interface; pass a fake implementation in the test.
- **Rust:** trait objects / generics; a test impl of the trait.
- **JVM:** Mockito or a hand-rolled fake behind an interface.
- **Swift:** dependency-injection (e.g. swift-dependencies `withDependencies { … }`), protocol witnesses, or an injected struct of closures.

## Control non-determinism (the #1 source of flakiness)

Make time, IDs, and randomness injectable, then pin them in tests:

```ts
// Inject a clock and an id generator instead of calling Date.now()/uuid() directly.
const clock = () => new Date("2020-01-01T00:00:00Z");
const ids = (() => { let n = 0; return () => `id-${n++}`; })();
const svc = makeService({ clock, ids });
```

Equivalents: pytest `freezegun`/fixed `monkeypatch`; Go inject a `Clock` interface; Rust pass a `now: fn() -> Instant`; Swift `withDependencies { $0.date = .constant(...); $0.uuid = .incrementing }`.

## Async & concurrency

- Always `await`/join async work before asserting; don't assert on a fire-and-forget.
- For concurrent code, test the observable end state, not internal timing.
- Replace real sleeps with a controllable clock / immediate scheduler where the framework allows.

## Parameterized tests

- Node: `test.each([...])` · Python: `@pytest.mark.parametrize` · Go: table-driven `for _, tc := range cases` · Rust: a loop or `rstest` · JVM: `@ParameterizedTest` · Swift: `@Test(arguments: [...])`.
