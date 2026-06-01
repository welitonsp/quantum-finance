# ADR 005: Future Retention and Deletion Policy

## Status

Proposed

## Context

Quantum Finance currently prioritizes financial integrity, auditability, and recoverability. Firestore Rules block physical deletion of financial transactions and require audit/history records for sensitive changes.

This ADR documents a future retention and deletion direction only. It does not implement Cloud Functions triggers, change Firestore Rules, alter transaction schemas, or introduce new deletion behavior.

## Decision

Future retention and deletion work should follow these principles:

- Keep financial records auditable by default.
- Prefer soft deletion for user-facing financial records where historical integrity is required.
- Use explicit retention classes before implementing automated deletion.
- Require a separate implementation phase and test plan for any physical deletion workflow.
- Avoid storing personal data in operational docs, logs, tickets, and examples.

## Proposed Retention Classes

| Data Class | Examples | Default Direction | Notes |
|:---|:---|:---|:---|
| Financial records | Transactions, transaction history, account balances | Retain while the user account is active | Physical deletion requires a dedicated design review |
| Audit records | Transaction history, system/audit logs | Retain for integrity and troubleshooting | Must remain append-only unless a future policy explicitly changes this |
| Import artifacts | Parsed file metadata, import hashes, import diagnostics | Retain only as long as needed for deduplication and support | Future policy should separate metadata from uploaded source files |
| Operational logs | Function logs, CI logs, security scan output | Time-bound retention | Logs must avoid secrets and unnecessary personal data |
| User profile metadata | Auth-linked app profile fields | Delete or anonymize on verified account deletion | Future implementation should define ownership and retries |

## Future Implementation Requirements

Before implementing account deletion, retention jobs, or `auth.user().onDelete`, a future phase must define:

- Data inventory and ownership per collection.
- Required retention period per data class.
- Legal, product, and support requirements.
- Recovery and backup expectations.
- Idempotent deletion or anonymization workflow.
- Observability, retry behavior, and failure handling.
- Emulator and integration tests proving that financial integrity is preserved.

## Non-Goals

- This ADR does not add `auth.user().onDelete`.
- This ADR does not change `firestore.rules`.
- This ADR does not change business callables, imports, parsers, AI flows, recurring transactions, account schemas, or transaction schemas.
- This ADR does not authorize immediate physical deletion of financial history.

## Consequences

This keeps the current system conservative and auditable while creating a governance placeholder for future privacy and lifecycle work. Any implementation must be shipped as a separate scoped phase.
