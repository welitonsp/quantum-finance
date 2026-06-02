# ADR 005: Future Retention and Deletion Policy

## Status

Proposed

## Context

Quantum Finance currently prioritizes financial integrity, auditability, and recoverability. Firestore Rules block physical deletion of transactions and require history records for sensitive financial changes.

There is no total account deletion workflow implemented yet. In particular, this ADR does not add `auth.user().onDelete`, Cloud Functions triggers, Admin SDK deletion jobs, Firestore Rules changes, transaction schema changes, or new client behavior.

Firestore parent document deletion does not automatically remove subcollections. A future account deletion design must account for orphaned subcollections such as transaction history, account history, recurring task history, audit logs, system logs, usage documents, and other nested user data.

## Decision

Future retention and deletion work should follow these principles:

- Keep financial records auditable by default.
- Prefer soft deletion for financial records where historical integrity is required.
- Use explicit retention classes before implementing automated deletion.
- Implement physical deletion only through server-side, privileged workflows such as Cloud Functions using the Admin SDK.
- Treat total account deletion as a separate product, security, legal, and reliability project.
- Avoid storing personal data, secrets, raw import hashes, financial descriptions, real amounts, or before/after payloads in operational docs, logs, tickets, and examples.

## Current Behavior To Preserve

- `transactions` use soft delete for user-facing removal and preserve `history`.
- Transaction `history` is append-only from the client perspective and must remain protected from client update/delete.
- `accounts` and `recurringTasks` may support hard delete of the root document when Rules require paired history.
- Account and recurring task `history` must not be deletable by the client.
- `audit_logs` and `system_logs` are append-only from the client perspective.
- `usage/ai_calls` is not a deletion mechanism; it is usage state and should be reviewed separately for TTL or anonymization.

## Proposed Retention Classes

| Data Class | Examples | Default Direction | Notes |
|:---|:---|:---|:---|
| Financial records | Transactions, account records, recurring tasks | Retain while the user account is active | Transactions should remain soft-deleted rather than physically deleted during normal app use |
| Financial history | Transaction history, account history, recurring task history | Retain for auditability | Client-side update/delete must remain blocked |
| Audit records | `audit_logs`, integrity events, import/bulk/recurring audit records | Retain for integrity and troubleshooting | Future retention window requires legal/product review |
| Operational logs | `system_logs`, Function logs, CI logs, security scan output | Time-bound retention after review | Logs must remain sanitized and avoid secrets or personal financial payloads |
| Usage records | `usage/ai_calls`, rate limit counters, AI usage state | TTL, reset, or anonymize after review | Must not store prompts, responses, tokens, or raw transaction payloads |
| User profile metadata | `users/{uid}` root profile/container metadata | Delete or anonymize only in verified total account deletion | Must consider all nested subcollections |
| User configuration | Budgets, category rules, categories, credit cards, simulations | Review per data type | Deletion policy must consider historical references and financial meaning |

## Future Total Account Deletion Requirements

Any future total account deletion or physical purge must include:

- Dry-run mode that reports counts and planned paths without deleting data.
- Secure export or backup before destructive operations.
- Sanitized logs that avoid UIDs, raw import hashes, real amounts, real descriptions, secrets, and payload snapshots.
- Firestore Rules tests covering user access, blocked client deletes, and preserved append-only guarantees.
- A Cloud Function or equivalent server-side job using Admin SDK privileges.
- A rollback plan with restore criteria, failure modes, and partial-completion handling.
- LGPD validation covering lawful basis, retention obligations, user communication, and audit evidence.
- Explicit traversal of subcollections to avoid orphaned Firestore data.
- Idempotency, retry behavior, and observability for partial failures.

## Non-Goals

- This ADR does not implement total account deletion.
- This ADR does not add `auth.user().onDelete`.
- This ADR does not change `firestore.rules`.
- This ADR does not change Cloud Functions, frontend code, imports, parsers, AI flows, recurring transaction behavior, account schemas, or transaction schemas.
- This ADR does not authorize immediate physical deletion of financial history.
- This ADR does not promise that retention, TTL, anonymization, export, backup, or rollback workflows already exist.

## Consequences

This keeps the current system conservative and auditable while documenting a safer future path for privacy and lifecycle work. The main tradeoff is that user-facing deletion and physical deletion remain intentionally different concepts until a dedicated server-side deletion project is designed, tested, and approved.

The next implementation phase should start from `docs/DATA_INVENTORY.md`, confirm data ownership and legal requirements, and only then design destructive workflows.
