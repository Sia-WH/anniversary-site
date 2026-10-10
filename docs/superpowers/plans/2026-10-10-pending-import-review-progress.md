# SDD ledger — plan: docs/superpowers/plans/2026-10-10-pending-import-review-fixes.md

## Setup

- Plan and referenced spec read in full; required ponytail, engineering-discipline, executing-plans, receiving-code-review, systematic-debugging, test-driven-development, writing-good-tests, and verification-before-completion instructions read in full.
- Existing shared checkout retained. Initial status contains the Pending Transactions implementation files as untracked and `app/components/FinanceTracker.tsx` modified by the prior finance feature; preserve both scopes.
- No `package.json` or lockfile changes; no database connection/migration, deployment, push, or commit.
- Ruling: use the user's existing shared checkout rather than create an isolated worktree — the user explicitly authorized this exact workspace and required preserving current changes — cost if wrong: unrelated local work shares the checkout; mitigate by limiting edits to plan files and reviewing status.
- Ruling: leave independent acceptance to the main chat; user explicitly prohibits subagents and says the main chat will dispatch verification — cost if wrong: no fresh review occurs in this implementation chat; main chat owns that gate.

## Tasks

- Task 1: complete — import response allowlist / privacy regression.
- Task 2: complete — owner-scoped exact-merchant category suggestion and escaped raw-text disclosure.
- Task 3: complete — invalid dates, opaque IDs, rate-limit rollback, policy cleanup.
- Task 4: local acceptance complete — independent review and targeted amount follow-up verification completed. Database/deployment/iPhone activation remains pending.

## Final local acceptance

- Main chat independently reran the restored final state: five Node scripts passed 89/89; TypeScript, amount-patch ESLint and standalone diff whitespace check exited 0.
- Independent verifier accepted the amount fix on 2026-10-10: pending scripts passed 47/47; three real handlers accept 1.10/0.29 and reject 1.001 before the write RPC. Shortcut documentation is aligned.
- A stale implementation summary briefly caused the amount follow-up to be withdrawn; the exact patch was restored and final verification was rerun. No unrelated finance source changes were found.
- No outstanding Critical/Important finding remains in this local review. PostgreSQL integration, migration/concurrency, deployment and target-iPhone behavior remain unverified; no push or live migration was performed.

## RED/GREEN evidence

- Task 1 — API handler RED: `node --test --test-name-pattern="new import acknowledgement|duplicate import acknowledgement" scripts/pending-transactions-routes.test.mjs` failed both tests because the route returned the full `pending` row, including `raw_text` and `possible_duplicates`.
- Task 1 — SQL contract RED: `node --test --test-name-pattern="create RPC returns acknowledgement fields" scripts/pending-transactions.test.mjs` failed because `create_pending_transaction` returned `to_jsonb(existing_row/pending_row)`.
- Task 1 — API handler GREEN: rerunning the route command passed 2/2 after the response allowlist was added.
- Task 1 — SQL contract GREEN: rerunning the SQL contract command passed 1/1 after the RPC returned only `duplicate`, `pending_id`, and `status`.
- Task 2 — behavior RED: `node --test --test-name-pattern="pending draft uses a merchant suggestion|original receipt text is rendered|merchant category suggestions are owner-scoped" scripts/pending-transactions.test.mjs` failed 3/3 because the suggestion, disclosure component, and secure suggestion RPC did not exist.
- Task 2 — route RED: `node --test --test-name-pattern="pending GET attaches category suggestions" scripts/pending-transactions-routes.test.mjs` failed because GET returned no suggested category.
- Task 2 — GREEN: rerunning the behavior command passed 3/3; rerunning the route command passed 1/1. The first disclosure GREEN attempt exposed an over-strict test assumption about the `<details>` class attribute; after correcting that assertion, React SSR confirmed escaped text and both commands passed.
- Task 3 — parser and SQL-contract RED: `node --test --test-name-pattern="invalid calendar dates|opaque provider IDs|authenticated edit and confirm retain rate-limit hits|policy cleanup rejects unexpected policies|obsolete commented legacy RPC bodies" scripts/pending-transactions.test.mjs` failed 5/5. Observed causes include `RangeError: Invalid time value`, lowercased/delimiter-concatenated opaque IDs, no subtransaction failure-code return, broad policy deletion, and the obsolete commented bodies.
- Task 3 — API RED: `node --test --test-name-pattern="authenticated edit business failures|authenticated confirm business failures" scripts/pending-transactions-routes.test.mjs` failed 2/2 because RPC `{failure_code: '22023'}` was returned as success (HTTP 200) rather than mapped to a safe 400.
- Task 3 — existing-ID re-key RED: after adding a regression assertion, `node --test --test-name-pattern="opaque provider IDs preserve case" scripts/pending-transactions.test.mjs` failed because the migration had no backfill to the case-preserving structured key yet.
- Task 3 — legacy compatibility check: before removing the commented SQL bodies, a repository search found no app/docs runtime callers of either legacy RPC; only the migration's explicit `DROP FUNCTION IF EXISTS` statements remain, alongside a regression assertion.
- Task 3 — focused GREEN: rerunning the parser/SQL contract command passed 5/5; rerunning `node --test --test-name-pattern="provider reference and event IDs keep|authenticated edit business failures|authenticated confirm business failures" scripts/pending-transactions-routes.test.mjs` passed 3/3; the route ID forwarding subset passed 3/3 after updating its mock to the new SQL acknowledgement shape.
- Task 3 — existing-ID backfill GREEN: rerunning `node --test --test-name-pattern="opaque provider IDs preserve case" scripts/pending-transactions.test.mjs` passed 1/1 after adding a case-preserving structured-key backfill for existing rows.
- Amount follow-up — handler RED: `node --test --test-name-pattern="explicit import POST accepts|pending PATCH accepts|confirm POST accepts|rejects fractional cents" scripts/pending-transactions-routes.test.mjs` ran after `npm ci` and failed 6/9 acceptance cases because valid 1.10/0.29 values were rejected by binary floating-point equality; the three 1.001 rejection cases already passed.
- Amount follow-up — handler GREEN: after adding shared exact decimal-to-integer-cents parsing and using it in all three write handlers, focused actual-handler runs passed: `node --test --test-name-pattern="explicit import POST" scripts/pending-transactions-routes.test.mjs` (3/3), `node --test --test-name-pattern="pending PATCH" scripts/pending-transactions-routes.test.mjs` (3/3), and `node --test --test-name-pattern="confirm POST" scripts/pending-transactions-routes.test.mjs` (3/3). Each accepts 1.10/0.29 and rejects 1.001 before its RPC.
- Amount follow-up — documentation: shortcut guide now describes the exact-merchant confirmed-history suggestion, editable/manual cases, saved-category precedence, and original OCR text disclosure; plan status distinguishes completed initial independent acceptance from main-chat review of this patch.
- Final Node tests after the amount follow-up: `node --test scripts/expense-page-cache.test.mjs scripts/finance-calculations.test.mjs scripts/password-reset.test.mjs scripts/pending-transactions-routes.test.mjs scripts/pending-transactions.test.mjs` passed 89/89.
- Final typecheck: `npx tsc --noEmit` exited 0.
- Final targeted lint: `npx eslint app/api/pending-transactions/route.ts app/api/pending-transactions/confirm/route.ts app/components/PendingTransactionsInbox.tsx app/lib/pending-transactions-server.ts app/lib/pending-transactions.ts scripts/pending-transactions.test.mjs scripts/pending-transactions-routes.test.mjs` exited 0 after the amount follow-up.
- Final whitespace: `git diff --check` exited 0; explicit scan of task files found no trailing whitespace. Git emitted only the pre-existing CRLF normalization warning for `app/components/FinanceTracker.tsx`.
- Full lint: `npm run lint` exited 1 on pre-existing `app/login/page.tsx:98` (`no-explicit-any`); 8 other warnings were reported, and no task file was flagged.
- Build: `npm run build` compiled and passed its TypeScript phase, then failed during static prerender of `/expenses` because required Supabase environment variables are absent. No migration/live database test was run; `psql` is unavailable and no local database was used, so SQL behavior has static contract coverage only.
