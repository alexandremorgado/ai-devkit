# Development Plan Template

A development plan is a **research-backed hypothesis**, not a contract. Fill the sections with what
you actually learned from the issue and the codebase (see `project-context.md`), and frame all
specifics — directory layout, language, framework, build/test commands — to match *this* repo rather
than any one stack.

## Branch Documentation Template

Create `Docs/branches/feature-[semantic-name].md` (or wherever this repo keeps planning docs) with
this structure:

```markdown
# Feature: [Issue Title]

**Branch**: `feature/[semantic-name]`
**Created**: [Date]
**Status**: Planning Complete
**GitHub Issue**: [#123](<issue URL>)

## Overview
[Full issue description with context and requirements]

## Re-Evaluation Required

**This plan is a starting hypothesis.** Before implementing:

1. **Validate architecture decisions** - Does this still make sense?
2. **Challenge proposed patterns** - Are there better approaches?
3. **Re-examine dependencies** - Have requirements changed?
4. **Update freely** - This document should evolve

**Note**: Detailed test planning happens during implementation, not now.

## Codebase Analysis Summary

### Related Components Found
- [List of relevant files/modules discovered]
- [Existing patterns that apply]
- [Similar features for reference]

### Architecture Fit
- Placement: [where this code lives in the repo's structure]
- Dependencies required: [List]
- Integration points: [Where this connects to existing code]

## Implementation Plan

### Phase 1: Foundation
- [ ] Scaffold the new module/component following the repo's conventions
- [ ] Wire up configuration / dependency injection / routing as the project does it
- [ ] Define core models, types, or interfaces

### Phase 2: Core Implementation
- [ ] Implement the business logic
- [ ] Build the UI / endpoints / public surface
- [ ] Add data-access or service layers as needed

### Phase 3: Integration
- [ ] Connect to existing navigation / routing / app wiring
- [ ] Integrate with existing services
- [ ] Register the new code where the project expects it (manifest, DI container, route table, etc.)

### Phase 4: Pre-PR Validation
- [ ] Add/refresh tests for the new behavior
- [ ] Run the project's test and lint commands; get them green
- [ ] Update documentation as needed

## Technical Notes

### Approach
- [State management / data flow / architectural pattern this follows — match existing code]
- [Error-handling strategy used elsewhere in the repo]

### Dependencies
- `[Dependency]`: [Purpose] — add via the repo's dependency manifest

### Wiring / Registration
- [Note any manifest, config, or registry entries the new code requires]

## Tests
[Describe the testing approach for this work, following the repo's test framework and layout.
Detailed test cases are written during implementation.]

## Acceptance Criteria
- [ ] Core functionality implemented
- [ ] Tests pass (the project's full suite is green)
- [ ] No regressions / performance degradation
- [ ] Code review approved
- [ ] Issue #123 resolved

## Next Steps for Developer
1. Check out the branch: `git fetch && git checkout feature/[semantic-name]`
2. Review this plan and make adjustments
3. Begin implementation following the phases
4. Update checkboxes as you progress
5. Open a PR targeting the repo's integration branch when complete
```

## Task Breakdown Patterns

### For UI Features
1. Design the component/screen hierarchy
2. Build the UI (preview-first, if the framework supports it)
3. Implement state management
4. Connect to the data layer
5. Add navigation/routing integration

### For API / Backend Integration
1. Define the API/data models or schema
2. Create the service/client abstraction
3. Implement the real behavior
4. Add fixtures/mocks for tests
5. Integrate with the higher-level layer

### For Refactoring
1. Document current behavior
2. Add tests pinning that behavior
3. Implement changes incrementally
4. Verify tests still pass
5. Remove deprecated code

## Documentation Standards

- Keep the plan current with the implementation
- Update checkboxes as tasks complete
- Document significant design changes
- Note any deviations from the original plan
