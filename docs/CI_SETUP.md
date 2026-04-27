# CI/CD Setup — Quantum Finance

## Branch Protection (GitHub)

Configure these settings on `main` via **Settings → Branches → Add rule**:

| Setting | Value |
|---|---|
| Branch name pattern | `main` |
| Require status checks | ✅ enabled |
| Required checks | `✅ CI Success` |
| Require branches to be up to date | ✅ enabled |
| Require pull request reviews | ✅ (1 approval) |
| Dismiss stale reviews on push | ✅ enabled |
| Require review from CODEOWNERS | ✅ enabled |
| Restrict force pushes | ✅ enabled |
| Allow deletions | ❌ disabled |

> The single required check `✅ CI Success` gates on all four jobs (lint, typecheck, test, build).
> Deploy to Firebase will not run until this check passes.

---

## Coverage Thresholds — Upgrade Plan

Current thresholds are conservative because most hooks depend on Firebase/React and lack unit tests.

| Quarter | Lines | Functions | Branches | Statements | Notes |
|---|---|---|---|---|---|
| Q2-2026 (now) | 10 | 15 | 5 | 10 | Baseline — prevents catastrophic drops |
| Q3-2026 | 30 | 35 | 20 | 30 | After pure-function extraction phase |
| Q4-2026 | 50 | 55 | 40 | 50 | After hook mocking infrastructure |
| Q1-2027 | 70 | 75 | 60 | 70 | After integration test suite |
| Q2-2027 | 80 | 80 | 70 | 80 | Target — industry standard |

To raise a threshold: update `vite.config.ts` → `test.coverage.thresholds`, verify locally with
`npm run coverage -- --run`, then open a PR.

---

## Running CI Locally

```bash
# All quality gates in sequence (mirrors CI)
npm run lint
npm run typecheck
npm run coverage -- --run
npm run build
```

---

## Troubleshooting

### `✅ CI Success` check not appearing in branch protection dropdown

The check only appears after at least one workflow run that produced it. Push a branch and open a
PR — after the first run the check name becomes selectable.

### Coverage thresholds fail locally but pass in CI (or vice-versa)

Make sure the same files are included. The `include` array in `vite.config.ts` must match what
you expect to measure. Files with no imports (dead code) still count against coverage if included.

### `lewagon/wait-on-check-action` times out

Default timeout is 15 minutes. If CI takes longer, increase `timeout-minutes` in
`.github/workflows/firebase-hosting-merge.yml` → `wait_for_ci` job.

### Firebase deploy fails after CI passes

Check that `FIREBASE_SERVICE_ACCOUNT_QUANTUM_FINANCE_39235` secret is set under
**Settings → Secrets and variables → Actions**.
