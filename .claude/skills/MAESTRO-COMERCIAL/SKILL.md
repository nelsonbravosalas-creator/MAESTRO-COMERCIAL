```markdown
# MAESTRO-COMERCIAL Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill provides guidance on contributing to the MAESTRO-COMERCIAL TypeScript codebase. It covers established coding conventions, documentation workflows, and testing patterns observed in the repository. Use this as a reference for maintaining consistency and quality in your contributions.

## Coding Conventions

### File Naming
- Use **snake_case** for all file names.
  - Example: `user_profile.ts`, `order_service.test.ts`

### Import Style
- Use **relative imports** for internal modules.
  - Example:
    ```typescript
    import { calculateTotal } from './utils/calculate_total';
    ```

### Export Style
- Use **named exports** rather than default exports.
  - Example:
    ```typescript
    // In utils/calculate_total.ts
    export function calculateTotal(items: Item[]): number {
      // ...
    }
    ```

### Commit Messages
- Follow **conventional commit** patterns.
- Use prefixes such as `docs:` for documentation changes.
  - Example: `docs: add remediation plan for high-risk audit finding`

## Workflows

### Add Remediation or Audit Documentation
**Trigger:** When someone needs to document an audit result or a remediation plan for QA findings.  
**Command:** `/add-doc-plan`

1. Create a new documentation file in the `docs/` directory. Use either Markdown (`.md`) or HTML (`.html`) format.
2. Write detailed content about the audit or remediation plan. Include context, findings, actions, and outcomes.
3. Commit the new file with a descriptive message, e.g., `docs: add remediation plan for critical finding`.

**Example:**
```bash
# Create a new Markdown file
touch docs/2024-06-remediation-plan.md

# Edit the file to add your documentation

# Commit with a conventional message
git add docs/2024-06-remediation-plan.md
git commit -m "docs: add remediation plan for critical finding"
git push
```

## Testing Patterns

- **Test files** follow the pattern `*.test.*` (e.g., `user_service.test.ts`).
- **Testing framework** is not explicitly defined; check existing test files for structure and assertions.
- Place test files alongside the code they test or in a dedicated test directory as per project convention.

**Example:**
```typescript
// user_service.test.ts
import { getUser } from './user_service';

describe('getUser', () => {
  it('returns user data for a valid ID', () => {
    // Test implementation
  });
});
```

## Commands

| Command        | Purpose                                                         |
|----------------|-----------------------------------------------------------------|
| /add-doc-plan  | Start the workflow to add QA audit or remediation documentation |
```
