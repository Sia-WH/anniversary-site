# Pending Import Review Fixes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task-by-task in the existing implementation chat. User explicitly requires two independent GPT-6 Luna Max chats, not subagents. Independent verification follows implementation. No automatic commits.

**Goal:** Close the pending-payment import review findings without increasing dependencies or enabling automatic expense confirmation.

**Local acceptance:** Implementation and local review complete on 2026-10-10. SQL checks are static evidence, not PostgreSQL integration proof. Database, deployment and iPhone activation remain unverified.

**Architecture:** Keep the existing API, pending inbox and transactional RPCs. Import credentials receive only an acknowledgement; history and receipt text remain available only to the signed-in owner. Suggest an editable category only from consistent, exact merchant matches in that owner's confirmed import history.

**Tech Stack:** Next.js, TypeScript, React, Supabase/PostgreSQL, existing Node test scripts.

**Spec:** `docs/pending-transactions-shortcuts.md` and the independent verifier's review of 2026-10-10.

## Global Constraints

- Keep unconfirmed imports out of formal expenses and finance totals.
- Never infer categories by receipt substrings or silently confirm suggestions.
- No new dependencies, paid OCR service, subagents, commits, push, deployment or live database migration.
- Preserve unrelated working-tree changes and previous finance features.
- Run real parser/handler checks; label mocked database and static SQL evidence honestly.

## Review Focus

- Stable-ID duplicates must not expose previous receipt or expense information to an import-only token.
- Conflicting merchant history or deleted categories must leave the suggestion empty.
- OCR text must render as escaped text, including HTML-like input.
- Invalid calendar dates must produce a reviewable draft, not an exception.
- Opaque IDs must retain case and avoid delimiter collisions; failed writes must not erase request-limit accounting.

### Task 1: Close import response exposure

**Files:** `app/api/pending-transactions/route.ts`, `supabase/pending-transactions.sql`, `scripts/pending-transactions-routes.test.mjs`.

**Interfaces:** Successful import POST returns `{ duplicate: boolean, pending_id: string, status: string }` only. Signed-in inbox GET retains owner-only history fields.

- [x] Add a real-handler regression supplying an RPC row containing raw text and historical duplicate candidates; assert successful token response has only acknowledgement fields, for both creation and duplicate paths.
- [x] Run the regression and record the expected privacy assertion failure.
- [x] Minimize the RPC result and allowlist the API response; adapt the existing app-paste consumer if it depends on the old result.
- [x] Run `node --test scripts/pending-transactions-routes.test.mjs` and verify all response/authentication checks pass.

### Task 2: Reduce review work while preserving evidence

**Files:** `app/components/PendingTransactionsInbox.tsx`, `app/api/pending-transactions/route.ts`, `supabase/pending-transactions.sql`, existing pending test scripts, `docs/pending-transactions-shortcuts.md`.

**Interfaces:** Owner inbox provides an editable category suggestion only when exact normalized merchant history agrees on one currently valid category. Existing explicit saved category takes precedence. Unknown merchants remain unselected.

- [x] Add failing checks for exact confirmed-history suggestion, conflicting history, different merchants, owner isolation and invalid/deleted category.
- [x] Add a rendering check that raw OCR text is present in an accessible native `details`/`summary` disclosure and HTML-like text is not interpreted as markup.
- [x] Implement the smallest owner-scoped suggestion using existing category IDs/history; no generic rule engine or new table. Do not overwrite saved review choices.
- [x] Add escaped raw text disclosure and label any suggestion as editable; preserve required description and explicit confirmation.
- [x] Run both pending test scripts and update the shortcut guide to describe suggestions and first-time manual selection accurately.

### Task 3: Close related correctness edges

**Files:** `app/lib/pending-transactions.ts`, `app/lib/pending-transactions-server.ts`, affected pending API routes, `supabase/pending-transactions.sql`, existing pending test scripts.

**Interfaces:** Invalid dates return `null` with review warnings. Stable dedupe encodes opaque IDs without changing their case. Rate limits account for authenticated failed attempts independently of write rollback. Import, edit, and confirm amount validation accepts exact decimal cents without binary-float equality checks.

- [x] Reproduce invalid ISO/slash dates, case-distinct stable IDs and delimiter-collision inputs before changing production behavior.
- [x] Guard invalid dates before `toISOString`; retain strict calendar round-trip checking.
- [x] Use structured stable-key encoding, preserving opaque ID case; document any old-key migration compatibility requirement.
- [x] Verify the reported rate-counter rollback and fix it through the smallest committed, authenticated limit boundary; avoid adding infrastructure. Add handler tests and document database integration checks still required.
- [x] Replace broad policy deletion with named cleanup where safe; if the migration must exclusively own these new tables' policies, document that contract and detect unexpected policies rather than silently removing them.
- [x] Remove obsolete commented SQL only after verifying it has no compatibility role.
- [x] Run focused regressions, all existing Node test files, TypeScript, targeted lint and whitespace checks. Report unrelated global lint failures by file.
- [x] Add real-handler amount regressions for explicit import, edit, and confirm: accept 1.10 and 0.29; reject 1.001 before the write RPC. Share exact decimal-to-cents validation across handlers.

### Task 4: Independent acceptance

**Files:** All new pending files, including untracked files; no reviewer edits.

- [x] Implementation chat reports each RED/GREEN result, changed files and unresolved integration limits.
- [x] Verification chat completed its initial independent acceptance of the pending-import review changes.
- [x] Main chat checks this follow-up amount-validation patch and fresh verification evidence before claiming local completion.
- [ ] Database migration, deployment and target-iPhone Wallet/OCR tests remain separate activation steps requiring appropriate access and authorization.
