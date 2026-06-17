# Detection Patterns (per-language reference)

The full pattern set for the grep-detectable phase. Keep the rows for your stack; the semantic "obvious comments" pass (in SKILL.md) is language-agnostic and matters most.

## Debug prints by language

| Language | Pattern |
|---|---|
| JS/TS | `console\.(log|debug|info)\(` |
| Python | `(^|[^.\w])print\(`, `pprint\(` |
| Go | `fmt\.Print(ln|f)?\(`, `log\.Print` |
| Rust | `println!\(`, `dbg!\(`, `eprintln!\(` |
| Java/Kotlin | `System\.out\.print`, `println\(` |
| Ruby | `\bputs \b`, `\bp \b`, `pp \b` |
| PHP | `var_dump\(`, `error_log\(`, `print_r\(` |
| Swift | `\bprint\(`, `debugPrint\(`, `dump\(`, `NSLog\(`, `os_log\(.*debug` |
| C/C++ | `printf\(`, `std::cout` |

> Distinguish **debug** prints from intentional CLI output. A tool's stdout is not noise — scope this to app/library code, and let `cleanup: intentional` mark deliberate cases.

## Commented-out code

A comment line that wraps a real statement (not prose, not a doc comment):

```
^[[:space:]]*(//|#|--)[[:space:]]*(let|var|const|func|def|class|fn|return|if|for|while|switch|import|use|public|private|fun|val) [A-Za-z]
```

Exclusions: documentation comments (`///`, `/** */`, `##`, `"""…"""`, `=begin`), license headers, and example snippets inside docs.

## Transitional comments

Left-over migration narration that describes history rather than the code:

```
(//|#|--).*(previously|was:|changed from| now |moved to|old:|before:|after:|used to|migrated from|renamed from)
```

These almost always belong in the commit message or PR description, not the source.

## Completed-TODO / dead markers

```
(//|#).*TODO.*(done|completed|fixed|DONE|COMPLETED|FIXED)
(//|#)[[:space:]]*(MARK|region|SECTION):?[[:space:]]*-?[[:space:]]*$
```

## Edge cases & false positives

- **URLs / example strings** inside comments may contain trigger words — verify against the diff before removing.
- **Doc comments** (`///`, `/** */`, docstrings) are documentation — never auto-strip them.
- **Disabled-on-purpose code** kept for a documented reason → tag the line `cleanup: intentional`.
- **Generated files** (lockfiles, build output, vendored deps) → skip entirely.
