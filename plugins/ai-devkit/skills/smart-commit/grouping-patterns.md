# File Grouping Patterns

Directory-based grouping logic for smart-commit. The goal is 2–5 **atomic** commits that each tell one story. Adapt the path patterns to your repo's actual layout — discover it first (`git ls-files | sed 's#/.*##' | sort -u`) rather than assuming.

## Directory → Group matching

Process each changed file from `git status --porcelain` and assign a group + prefix. A reasonable generic ordering:

```bash
declare -A FILE_GROUPS GROUP_PREFIXES
while IFS= read -r line; do
  FILE="${line:3}"
  case "$FILE" in
    # Tests first (so test files never get swept into a feature group)
    */__tests__/*|*_test.*|*.test.*|*.spec.*|*Tests*|test/*|tests/*|spec/*)
        GROUP="Tests"; PREFIX="Test:" ;;
    # Documentation
    *.md|docs/*|README*|CHANGELOG*)
        GROUP="Documentation"; PREFIX="Docs:" ;;
    # Config / build / deps
    *.json|*.yml|*.yaml|*.toml|*.lock|*.gradle|*.xcconfig|Dockerfile|Makefile|*.cfg|*.ini)
        GROUP="Configuration"; PREFIX="Chore:" ;;
    # Source modules — name the group by the module directory under a known source root
    src/*/*|lib/*/*|pkg/*/*|app/*/*|internal/*/*|Sources/*/*)
        MOD=$(printf '%s' "$FILE" | sed -E 's#^(src|lib|pkg|app|internal|Sources)/([^/]+)/.*#\2#')
        GROUP="Module: $MOD"; PREFIX="Feat:" ;;
    *)
        GROUP="Other Changes"; PREFIX="Chore:" ;;
  esac
  FILE_GROUPS["$GROUP"]+="$FILE"$'\n'
  GROUP_PREFIXES["$GROUP"]="$PREFIX"
done < <(git status --porcelain)
```

> **Refine the prefix by intent, not just path.** A change under a module dir might be a `Fix:` or `Refactor:` rather than `Feat:` — read the diff to choose. Path picks the *group*; the diff picks the *prefix*.

## Commit message generation

```bash
generate_commit_message() {     # ($group, $prefix)
  case "$1" in
    "Module: "*) echo "$2 Update ${1#Module: } module" ;;
    "Tests")     echo "$2 Add/update tests" ;;
    "Documentation") echo "$2 Update documentation" ;;
    "Configuration") echo "$2 Update configuration" ;;
    *)           echo "$2 Miscellaneous updates" ;;
  esac
}
```

Prefer a specific subject when the diff makes it obvious (e.g. `Feat: Add CSV export to reports` beats `Feat: Update reports module`).

## Prefix selection rules

| Prefix | When |
|---|---|
| **Feat:** | New features, new endpoints/components |
| **Fix:** | Bug fixes |
| **Perf:** | Performance improvements |
| **Refactor:** | Restructuring with no behavior change |
| **Test:** | Test additions/updates |
| **Docs:** | Documentation only |
| **Chore:** | Maintenance, config, deps |

## Branch-plan path convention (matches issue-to-branch)

- `feature/payment-flow` → `Docs/branches/feature-payment-flow.md`
- `fix/login-redirect` → `Docs/branches/fix-login-redirect.md`

(Slashes in the branch name become hyphens: `${BRANCH//\//-}`.)
