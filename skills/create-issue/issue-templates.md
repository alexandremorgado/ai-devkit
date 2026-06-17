# Issue Templates

Templates for different issue types.

## Bug Report Template

```markdown
## Bug: [Clear, specific title]

### Summary
[One sentence describing the bug]

### Environment
(Fill in what's relevant to this project)
- **Platform / runtime / version**: [e.g., browser, Node 20, Python 3.12, iOS 17, Android 14]
- **OS / device**: [e.g., macOS 14, Ubuntu, iPhone 15 Pro, all devices]
- **App / package version**: [e.g., 2.1.4]
- **Build / environment**: [e.g., staging, production, local]

### Steps to Reproduce
1. [First step]
2. [Second step]
3. [...]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]
[Include error messages, screenshots if applicable]

### Frequency
[Always / Sometimes (X% of time) / Once]

### Code Analysis
[If applicable]
- File: `path/to/file:123`
- Potential cause: [explanation]

```
// Relevant code snippet
```

### Impact
- **Severity**: [Critical / High / Medium / Low]
- **Users Affected**: [All users / Specific flow / Edge case]
- **Workaround**: [If any]

### Suggested Fix
[Optional: potential solution approach]

### Acceptance Criteria
- [ ] Bug no longer occurs
- [ ] Tests added to prevent regression
- [ ] No performance degradation
```

## Feature Request Template

```markdown
## Feature: [Clear, specific title]

### Summary
[One sentence describing the feature]

### User Story
As a [type of user], I want [goal] so that [benefit].

### Motivation
[Why this feature is needed]
[User feedback, business case, technical need]

### Proposed Solution
[Detailed description of the feature]

### Technical Considerations
- **Affected Modules**: [list the repo's modules/components this touches]
- **Dependencies**: [external services, libraries]
- **Architecture Notes**: [patterns to follow, data flow]

### Mockups/Design
[Links to designs, screenshots, wireframes]

### Acceptance Criteria
- [ ] [Specific, testable criterion]
- [ ] [Specific, testable criterion]
- [ ] Tests cover new functionality
- [ ] Documentation updated

### Out of Scope
[What this feature explicitly does NOT include]

### Related Issues
- #XXX (similar feature)
- #XXX (depends on)
```

## Task Template

```markdown
## Task: [Clear, specific title]

### Summary
[One sentence describing the task]

### Context
[Background, why this task is needed]

### Requirements
- [ ] [Specific requirement]
- [ ] [Specific requirement]

### Implementation Notes
[Technical guidance, approach suggestions]

### Acceptance Criteria
- [ ] [Testable criterion]
- [ ] Code reviewed
- [ ] Tests passing
```

## Duplicate Detection Logic

### Exact Duplicate Criteria
- Title similarity >80% (fuzzy matching)
- Same error message or stack trace
- Identical affected files/components
- Created within last 7 days

### Related Issue Criteria
- Title similarity 40-80%
- Overlapping keywords (>50% match)
- Same module or feature area
- Similar error patterns

### User Decision Points

**Exact duplicate detected:**
```
Issue #X appears to be the same. Options:
a) Add comment to existing issue with new details
b) Reopen if closed
c) Create new anyway (justify why different)
```

**Related issues found:**
```
Found X related issues. Options:
a) Create new issue and link all related
b) Update most relevant existing issue
c) Show details for review
```

## Historical Learning

When related issues found:
1. Analyze associated PRs: `gh pr list --search "linked:issue-X"`
2. Review solutions: `gh pr view X --comments`
3. Extract patterns and lessons
4. Include in new issue:
   - "Previous attempt in PR #X used approach Y"
   - "Issue #Z was resolved by implementing..."
