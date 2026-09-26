# ADR-000: ADR Template

All architectural decisions that shape the platform are recorded here as short,
numbered documents. The master roadmap requires: "every change that violates the
documented principles must be recorded with an ADR."

## Format

```markdown
# ADR-NNN: <title>

## Status
Proposed | Accepted | Superseded by ADR-MMM (date)

## Context
The forces at play: requirements, constraints, risks. What problem forces a
decision now?

## Decision
The choice, stated in present tense, precise enough to be enforced.

## Consequences
What becomes easier, what becomes harder, what we must now do continuously.

## Alternatives considered
Options rejected and the concrete reason for each.
```

## Rules

- ADRs are immutable once Accepted; to change a decision, supersede with a new ADR.
- Numbering is sequential and never reused (ADR-001, ADR-002, ...).
- Every ADR that introduces or changes a boundary must be reflected in
  `docs/architecture/dependency-rules.md` and, where relevant, in code-level lint rules.
