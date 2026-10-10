# Pending transaction imports

An import creates a `pending_transactions` row only. Cash Flow, category totals, balances, and `expenses` change only after the user reviews and confirms the item in Finance Tracker. The workflow does not decide that a payment succeeded based on an Apple Pay notification or receipt text alone.

## Staging preflight and activation

The repository has no DDL for the existing `expenses` and `expense_categories` tables. Before enabling this feature in staging, inspect their columns and types:

```sql
select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('expenses', 'expense_categories')
order by table_name, ordinal_position;
```

The migration requires `expenses.id`, `expenses.user_id`, `expenses.category_id`, and `expense_categories.id`/`user_id` to be UUIDs; expense Dating/Partner columns must be boolean; and `expenses.spent_at` must be a date or timestamp. The migration repeats these checks before creating anything and aborts with an actionable message on a mismatch. Confirm the `amount`, `category`, and `description` columns are compatible with numeric/text values as well.

After reviewing that output in the intended staging project, apply `supabase/pending-transactions.sql` there. Do not use the production project until staging checks pass. The migration removes direct insert/update/delete access on the two pending tables, leaves own-row reads, and exposes restricted owner-checked RPCs for all writes.

Set `SUPABASE_SERVICE_ROLE_KEY` only in the server environment. Never use a `NEXT_PUBLIC_*` name, put the key in a Shortcut, or send it over HTTP. Requests and responses use `Cache-Control: no-store`; server code does not log tokens or raw request bodies.

## One-time setup

1. Open Finance Tracker → Pending Transactions → expand the inbox → New token. Copy it immediately; the plaintext is shown once and only its SHA-256 hash is stored.
2. Tokens expire after 90 days. Before expiry, create a replacement, update the Shortcut's Authorization header, test one import, then revoke the old token. Expired and revoked tokens receive HTTP 401.
3. The app lists token expiry dates and keeps revoked/expired tokens out of the active list.

The import endpoint shown by the app is:

```text
https://<your-site-origin>/api/pending-transactions
```

Send the pairing token only in an `Authorization` header, never in a URL. Import requests are limited per token/user in the database, so limits are shared across server instances. A 429 response includes `Retry-After`; only the rate-limit counter changes, not a pending transaction or expense.

## iOS 26 Wallet and OCR entry points

Use the iOS 26 Wallet transaction automation or Share Sheet OCR entry. Apple documents the Wallet transaction trigger and “When I tap” card selector, but the exact variables exposed on a device are not established by this app. Inspect them on the target iPhone. Do not assume that merchant, amount, status, date, or reference is present.

For screenshot/receipt input, create a normal Shortcut on the iPhone:

1. Enable receiving image input from the Share Sheet.
2. Add `Extract Text from Image` and pass its output to the request. The feature uploads extracted text only; it does not upload the original image.
3. Add `Get Contents of URL` with method `POST`, the endpoint above, and these headers:

   ```text
   Authorization: Bearer <one-time-token>
   Content-Type: application/json
   ```

4. Send the OCR/text variable as JSON:

   ```json
   {
     "text": "Merchant: Kopi House\nTotal: RM 12.50\nDate: 2026-10-08\nRef: AP-123",
     "input_source": "shortcut_ocr"
   }
   ```

If the Wallet trigger exposes a verified event identifier, include it with a provider name:

```json
{
  "text": "optional receipt text",
  "amount": 12.5,
  "currency": "MYR",
  "date": "2026-10-08",
  "merchant": "Kopi House",
  "source": "Apple Pay",
  "reference": "AP-123",
  "event_id": "stable-provider-event-id",
  "input_source": "shortcut_http"
}
```

Only a provider-scoped stable reference or explicit provider event ID is used for hard idempotency. Without one, every import is retained as a separate pending row; a nearby amount/date/merchant match is shown as a possible duplicate so the user can decide. Identical receipt text is never used to discard a payment.

Official Apple references:

- [Receive onscreen items from other apps](https://support.apple.com/en-gb/guide/shortcuts/apd350ce757a/ios)
- [Transaction triggers in Shortcuts](https://support.apple.com/en-mide/guide/shortcuts/apd65c67538a/ios)

## App paste fallback

Expand Pending Transactions in Finance Tracker, paste receipt text, and select `Add to pending inbox`. This path uses the signed-in Supabase session and does not need a Shortcut token. Request bodies are streamed and capped before JSON parsing; text and structured fields also have type and length limits.

## Review and confirmation

The inbox lets the user edit amount, currency, date, description, category, transaction kind, Dating, and Partner. `Save review` persists the edits but leaves the row pending. The confirmation call sends those same fields to an owner-checked, row-locked RPC; an already-confirmed row returns its existing expense ID and cannot create a second expense.

The inbox may suggest a category only when this owner's confirmed import history has one consistent category for the exact normalized merchant and that category is still valid. The suggestion is editable and is never silently confirmed; an already-saved category takes precedence. New merchants, conflicting history, or a missing/deleted category remain for manual selection. Categories are never inferred from receipt text or merchant substrings. The original OCR/receipt text is available in the item's “Original receipt text” disclosure for comparison with the editable fields; it is rendered as text, not interpreted as markup.

A detected top-up or self-transfer stays in that kind with Ignore readily available. A generic transfer or unknown item needs an explicit type selection; changing it to Expense also requires a separate review checkbox.

Unknown or foreign currencies are not treated as RM. For manual conversion, enter the converted amount, set Currency code to `MYR`, and check the confirmation that the amount above is your verified conversion. The database requires that marker before confirmation when the detected currency was not MYR. Ambiguous dates stay blank; failed, declined, pending, processing, and reversed statuses remain `Needs review` rather than becoming expenses automatically.

Possible duplicate hints do not merge or block records. Both records remain available for review, including legitimate repeated payments with the same amount, date, and merchant.

## Staging verification checklist

After applying the migration in staging, test with two separate users and a test Shortcut token:

- User A cannot read, edit, confirm, ignore, create or revoke User B's pending items/tokens.
- Direct PostgREST insert/update/delete on the pending tables is denied; own-row reads still work.
- An invalid, revoked, or expired pairing token returns 401. Revoke and import serialize on the same token row.
- A body over the byte cap returns 413 before a pending row or expense is written. Repeated requests over the configured quota return 429 with `Retry-After`.
- Two identical imports without stable provider IDs create two pending rows; the later row shows a possible duplicate. Repeating a provider/reference or event ID is idempotent.
- A CNY receipt stays unconfirmed until a converted MYR amount and explicit manual-conversion check are saved.
- A failed/pending receipt and generic transfer stay out of expenses until an explicit review; a top-up/self-transfer does not become an expense by default.
- Confirm once and then retry: exactly one expense exists and both responses reference the same expense ID.

The repository tests exercise parser and HTTP handler behavior. They do not replace this staging database/RLS/RPC check; no staging or live database has been modified by this implementation.
