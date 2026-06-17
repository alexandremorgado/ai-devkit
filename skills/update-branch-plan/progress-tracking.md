# Progress Tracking Patterns

Logic for matching commits to plan tasks and updating checkboxes. Language-agnostic — it works off commit messages, changed paths, and the plan's own wording.

## Commit-to-Task Matching

For each commit, extract its message + hash, the files it changed, and key terms. Score against each unchecked task:

| Signal | Confidence boost |
|---|---|
| Exact keyword match (task term in commit subject) | +40% |
| A file path named in the task was changed | +30% |
| Semantic similarity (paraphrase of the task) | +20% |
| Same module/area touched | +10% |

Map paths to areas using the repo's own layout (discover with `git ls-files | sed 's#/.*##' | sort -u`), e.g. `src/<module>/`, `lib/`, `pkg/`, `app/<feature>/`, the tests dir, `docs/`.

## Checkbox Update Rules

**Mark complete (`- [x]`) when:**
- The commit message states completion ("Implement X", "Add Y", "Feat: Z"), AND
- the files the task implies were modified, AND
- confidence ≥80%.

**Leave unchecked (`- [ ]`) when:**
- The commit is partial ("WIP", "start", "scaffold").
- Only some of the implied files changed.
- Confidence <80%.

**Flag for review when:** medium confidence (50–80%), unclear completion, or an ambiguous message.

## Phase Status

When **all** tasks in a phase are checked, flip its header emoji: `⏳ In Progress` → `✅ Complete`.

## Semantic Matching

| Pattern | Confidence |
|---|---|
| "Implement X" commit → "Implement X" task | 100% |
| Commit modifies `payments/charge.ts` → task mentions "charge flow" | ~80% |
| "Add" ≈ "Implement" ≈ "Create" | context-dependent |
| "Fix bug in X" ≠ "Implement X" | do **not** mark |

## Ambiguity Handling

- **Multiple matching tasks** → ask which to check.
- **Partial completion** → flag for review, leave unchecked.
- **Contradictory signals** → show interpretations, let the user decide.

## Interactive Mode

```bash
mapfile -t UNCHECKED < <(grep -n '\- \[ \]' "$PLAN_FILE")
for i in "${!UNCHECKED[@]}"; do
  LINE=$(echo "${UNCHECKED[$i]}" | cut -d: -f1)
  TEXT=$(echo "${UNCHECKED[$i]}" | cut -d: -f2-)
  echo "$((i+1)). [line $LINE] $TEXT"
done
# Read the selected numbers; check only those.
```

## Final Mode (`--final`)

For `finish-branch`, handle incomplete tasks:
1. Count remaining: `grep -c '\- \[ \]' "$PLAN_FILE"`.
2. Offer: mark deferred (add a `[Deferred]` prefix) · leave unchecked (for reference) · delete.
3. Append a completion summary (see `plan-templates.md`).
