# Labeling Guide

Rules for intelligent label management.

## Label Matching Strategy

### Priority Order
1. **Exact match** (case-insensitive)
2. **Partial match** (e.g., "payment" → "payments")
3. **Synonym match** (e.g., "auth" → "authentication")
4. **Concept grouping** (e.g., "SwiftUI bug" → "swiftui" + "bug")

### When to Use Existing Labels
- Always prefer existing labels when adequate
- Combine multiple labels rather than creating narrow ones
- Use broader categories (e.g., "ui") over specific ones (e.g., "button-color")

## When to Create New Labels

### Justified New Labels
| Scenario | Example |
|----------|---------|
| New technology stack | "webrtc", "stripe-sdk" |
| Major new feature | "ai-recommendations", "offline-mode" |
| Platform versions | "api-v2", "node-22" |
| External integrations | "firebase-auth", "mixpanel" |

### Unjustified (Don't Create)
| Bad Label | Use Instead |
|-----------|-------------|
| "login-bug" | "authentication" + "bug" |
| "very-urgent" | "critical" or "high-priority" |
| "checkout-freeze-issue" | "checkout" + "bug" |

## Label Creation Rules

### Naming Conventions
- Lowercase with hyphens (e.g., "video-player")
- Be specific but not overly narrow
- Follow existing patterns in repository
- Avoid redundancy with existing labels

### Required Properties
```bash
# Operate on the current repo (inferred from the local git remote)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

gh label create "new-label" \
    --repo "$REPO" \
    --description "Clear, reusable description" \
    --color "hexcode"
```

### Color Coding
| Color | Category | Hex |
|-------|----------|-----|
| Red shades | Bugs, critical | #d73a4a |
| Green shades | Features, enhancements | #0e8a16 |
| Blue shades | Platform/tech specific | #0366d6 |
| Yellow shades | Priority, attention | #fbca04 |
| Gray shades | Status, workflow | #e1e4e8 |

## Common Repository Labels

**Always discover the repo's actual labels first** and prefer them over this list:
```bash
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)
gh label list --repo "$REPO" --json name,description
```
The categories below are common conventions to recognize and adapt — not a fixed taxonomy to impose.

### Issue Types
- `bug` - Something isn't working
- `enhancement` - Improvement to existing feature
- `feature` - New feature request
- `documentation` - Documentation updates
- `refactor` - Code restructuring
- `security` - Security related
- `technical-debt` - Code quality improvement

### Priority Levels
- `critical` - Must fix immediately
- `high-priority` - Fix this sprint
- `medium-priority` - Fix soon
- `low-priority` - Nice to have

### Feature / Area Labels (repo-specific)
These name the product areas or components of *this* repo — read them from the label list above.
Examples (yours will differ): `authentication`, `payments`, `search`, `notifications`,
`api`, `web`, `mobile`. Prefer broad area labels over narrow per-bug ones.

### Platform / Tech (repo-specific)
Stack-specific labels the repo may use, e.g. `frontend`, `backend`, `ios`, `android`, `ci`,
`database`, or a framework/SDK name. Match what already exists rather than inventing new ones.

### Status/Workflow
- `in-progress` - Being worked on
- `ready-for-review` - Ready for review
- `blocked` - Blocked by something
- `needs-design` - Needs design input
- `needs-reproduction` - Can't reproduce

### Effort Size
- `size-small` - Quick fix
- `size-medium` - Day or two
- `size-large` - Week or more

## Correlation Labels

For issue relationships:
- `has-duplicates` - Has potential duplicates
- `related-issues` - Linked to other issues
- `meta-issue` - Tracking multiple related problems
- `follow-up` - Continues previous work
