# Access Matrix Template

## Purpose

This document is a template for reviewing access to Quantum Finance systems and operational resources. It must not contain real credentials, personal data, API keys, debug tokens, service account JSON, or private customer information.

Use placeholders when documenting future roles, owners, and review evidence.

## Review Cadence

| Control | Recommended Cadence | Evidence |
|:---|:---|:---|
| Role and permission review | Quarterly | Review record link or ticket ID |
| Emergency access review | After each use | Incident or change ticket ID |
| Service account review | Quarterly | Inventory snapshot ID |
| Offboarding verification | Per offboarding event | Access removal checklist ID |

## Access Matrix

| Resource | Environment | Role / Group | Access Level | Business Justification | Approval Owner | Review Cadence | Notes |
|:---|:---|:---|:---|:---|:---|:---|:---|
| Firebase project | Development | `<role-or-group>` | Viewer / Editor / Admin | `<reason>` | `<owner>` | Quarterly | Use least privilege |
| Firebase project | Production | `<role-or-group>` | Viewer / Editor / Admin | `<reason>` | `<owner>` | Quarterly | Admin access requires explicit approval |
| GitHub repository | All | `<role-or-group>` | Read / Triage / Write / Maintain / Admin | `<reason>` | `<owner>` | Quarterly | Protect main branch |
| CI/CD secrets | All | `<role-or-group>` | Read / Write / Admin | `<reason>` | `<owner>` | Quarterly | No secrets in docs or code |
| Cloud Functions logs | Production | `<role-or-group>` | Viewer | `<reason>` | `<owner>` | Quarterly | Avoid exporting sensitive logs |
| Firestore data console | Production | `<role-or-group>` | Viewer / Editor | `<reason>` | `<owner>` | Quarterly | Prefer read-only access |

## Minimum Expectations

- Grant the minimum access needed for the task.
- Prefer groups or teams over direct user grants.
- Separate development and production privileges.
- Review elevated access after incidents, production changes, and offboarding.
- Document exceptions with an expiration date and an approval reference.

## Exception Register

| Exception ID | Resource | Temporary Access | Reason | Approved By | Expiration Date | Review Outcome |
|:---|:---|:---|:---|:---|:---|:---|
| `<EX-001>` | `<resource>` | `<role>` | `<reason>` | `<owner>` | `<YYYY-MM-DD>` | `<removed / renewed / pending>` |
