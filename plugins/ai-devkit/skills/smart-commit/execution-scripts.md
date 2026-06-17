# Execution Scripts

Commit execution logic. These are plain git plumbing and work on any repo. Load this when actually creating commits.

## Present the plan

```bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Smart Commit Plan"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
N=1
for GROUP in "${!FILE_GROUPS[@]}"; do
  MESSAGE=$(generate_commit_message "$GROUP" "${GROUP_PREFIXES[$GROUP]}")
  COUNT=$(printf '%s' "${FILE_GROUPS[$GROUP]}" | grep -c .)
  echo "Commit #$N · $MESSAGE  ($COUNT files)"
  printf '%s' "${FILE_GROUPS[$GROUP]}" | grep . | sed 's/^/    /'
  echo ""; ((N++))
done
```

## Option 1 — Execute all

```bash
[ "$STAGING_STRATEGY" != "respect" ] && git reset HEAD >/dev/null 2>&1 || true
for GROUP in "${!FILE_GROUPS[@]}"; do
  MESSAGE=$(generate_commit_message "$GROUP" "${GROUP_PREFIXES[$GROUP]}")
  printf '%s' "${FILE_GROUPS[$GROUP]}" | grep . | while read -r FILE; do git add -- "$FILE"; done
  git commit -m "$MESSAGE"
  echo "✅ $MESSAGE"
done
```

## Option 2 — Review each individually

```bash
for GROUP in "${!FILE_GROUPS[@]}"; do
  MESSAGE=$(generate_commit_message "$GROUP" "${GROUP_PREFIXES[$GROUP]}")
  echo "Proposed: $MESSAGE"
  printf '%s' "${FILE_GROUPS[$GROUP]}" | grep . | sed 's/^/  /'
  # AskUserQuestion: Create this commit? → Yes / Edit message / Skip
  # On Yes/Edit: git add the files, then git commit -m "$MESSAGE_OR_CUSTOM"
done
```

## Option 3 — Single combined commit

```bash
git add -A
git commit -m "${USER_MESSAGE:-Chore: Update multiple components}"
```

## Post-commit summary

```bash
echo "## ✅ Created $COMMIT_COUNT commits"
git log --oneline -"$COMMIT_COUNT" | sed 's/^/| /;s/$/ |/'
echo ""
echo "📋 Branch plan: $PLAN_UPDATE_RESULT"
echo "⚠️ COMMITS ARE LOCAL — review before pushing:  git log -$COMMIT_COUNT --oneline"
echo "When ready:  git push"
```

## Pre-commit: scope validation (generic)

```bash
BRANCH=$(git branch --show-current)
PLAN_FILE="Docs/branches/${BRANCH//\//-}.md"
if [ -f "$PLAN_FILE" ]; then
  PLAN=$(cat "$PLAN_FILE")
  git status --porcelain | awk '{print $2}' | while read -r FILE; do
    MOD=$(printf '%s' "$FILE" | sed -nE 's#^(src|lib|pkg|app|internal|Sources)/([^/]+)/.*#\2#p')
    [ -n "$MOD" ] && ! printf '%s' "$PLAN" | grep -qi "$MOD" && echo "  out-of-scope: $FILE (module: $MOD)"
  done
fi
# Warn only — never block.
```

## Examples

**Feature work:**
```
src/voting/VotingService.ts, src/voting/index.ts, src/voting/__tests__/voting.test.ts
→ Feat: Update voting module
→ Test: Add/update tests
```

**Mixed:**
```
src/voting/VotingService.ts, src/api/client.ts, README.md, package.json
→ Feat: Update voting module
→ Refactor: Update api module
→ Docs: Update documentation
→ Chore: Update configuration
```
