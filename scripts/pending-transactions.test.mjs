import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'
import ts from 'typescript'

async function loadPendingTransactions() {
    const sourcePath = join(process.cwd(), 'app/lib/pending-transactions.ts')
    const source = readFileSync(sourcePath, 'utf8')
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.ES2022,
            target: ts.ScriptTarget.ES2020,
        },
    }).outputText
    const moduleUrl = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`
    return import(moduleUrl)
}

function loadDraftFor() {
    const sourcePath = join(process.cwd(), 'app/components/PendingTransactionsInbox.tsx')
    const source = `${readFileSync(sourcePath, 'utf8')}\nexports.draftFor = draftFor;`
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            jsx: ts.JsxEmit.ReactJSX,
        },
    }).outputText
    const testModule = { exports: {} }
    const requireFromTests = createRequire(import.meta.url)
    const fakeRequire = (specifier) => {
        if (specifier === '@/app/lib/supabase-browser') return { supabaseBrowser: () => ({}) }
        return requireFromTests(specifier)
    }
    new Function('require', 'module', 'exports', transpiled)(fakeRequire, testModule, testModule.exports)
    return testModule.exports.draftFor
}

function loadOriginalReceiptText() {
    const sourcePath = join(process.cwd(), 'app/components/PendingTransactionsInbox.tsx')
    const source = `${readFileSync(sourcePath, 'utf8')}\nexports.OriginalReceiptText = typeof OriginalReceiptText === 'undefined' ? undefined : OriginalReceiptText;`
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
            jsx: ts.JsxEmit.ReactJSX,
        },
    }).outputText
    const testModule = { exports: {} }
    const requireFromTests = createRequire(import.meta.url)
    const fakeRequire = (specifier) => {
        if (specifier === '@/app/lib/supabase-browser') return { supabaseBrowser: () => ({}) }
        return requireFromTests(specifier)
    }
    new Function('require', 'module', 'exports', transpiled)(fakeRequire, testModule, testModule.exports)
    return testModule.exports.OriginalReceiptText
}

test('receipt parser keeps explicit RM amount, ISO date, merchant, and reference', async () => {
    const { parsePendingTransactionInput } = await loadPendingTransactions()

    assert.deepEqual(
        parsePendingTransactionInput({
            text: 'Merchant: Kopi House\nTotal: RM 12.50\nDate: 2026-10-08\nRef: AP-123',
            source: 'Apple Pay',
        }),
        {
            amount: 12.5,
            currency: 'MYR',
            date: '2026-10-08',
            merchant: 'Kopi House',
            source: 'Apple Pay',
            reference: 'AP-123',
            event_id: null,
            kind: 'expense',
            warning: null,
        }
    )
})

test('receipt parser leaves amount/date blank when receipt values are ambiguous', async () => {
    const { parsePendingTransactionInput } = await loadPendingTransactions()

    const parsed = parsePendingTransactionInput('RM 12.50\nRM 15.00\nDate: 10/11/2026')
    assert.equal(parsed.amount, null)
    assert.equal(parsed.date, null)
    assert.equal(parsed.warning, 'ambiguous_amount_and_date,ambiguous_date')
})

test('receipt parser refuses to treat non-RM currency as RM and detects non-expense flows', async () => {
    const { parsePendingTransactionInput } = await loadPendingTransactions()

    assert.deepEqual(
        parsePendingTransactionInput('Merchant: Wallet\nTotal: USD 4.00\nwallet top up'),
        {
            amount: null,
            currency: 'USD',
            date: null,
            merchant: 'Wallet',
            source: null,
            reference: null,
            event_id: null,
            kind: 'wallet_topup',
            warning: 'unsupported_currency',
        }
    )
})

test('receipt parser preserves an unknown ISO currency instead of treating the amount as RM', async () => {
    const { parsePendingTransactionInput } = await loadPendingTransactions()

    const parsed = parsePendingTransactionInput('Total: 10.00 CNY\nDate: 2026-10-08')
    assert.equal(parsed.amount, null)
    assert.equal(parsed.currency, 'CNY')
    assert.equal(parsed.warning, 'unsupported_currency')
})

test('receipt parser leaves the date empty when multiple transaction dates are present', async () => {
    const { parsePendingTransactionInput } = await loadPendingTransactions()

    const parsed = parsePendingTransactionInput('Total: RM 10.00\nPurchase: 2026-10-08\nSettlement: 2026-10-09')
    assert.equal(parsed.date, null)
    assert.equal(parsed.warning, 'ambiguous_date')
})

test('receipt parser does not classify failed or pending payments as expenses', async () => {
    const { parsePendingTransactionInput } = await loadPendingTransactions()

    assert.equal(parsePendingTransactionInput('Payment failed: RM 10.00').kind, 'unknown')
    assert.equal(parsePendingTransactionInput('Payment pending: RM 10.00').kind, 'unknown')
})

test('receipt parser distinguishes self transfers from payments to another person', async () => {
    const { parsePendingTransactionInput } = await loadPendingTransactions()

    assert.equal(parsePendingTransactionInput('Transfer between my own accounts RM 10.00').kind, 'self_transfer')
    assert.equal(parsePendingTransactionInput('Transfer to Alex RM 10.00').kind, 'payment_to_other')
    assert.equal(parsePendingTransactionInput('Transfer RM 10.00').kind, 'unknown')
})

test('receipt parser retains the provider-scoped reference and explicit event ID for database idempotency', async () => {
    const { parsePendingTransactionInput } = await loadPendingTransactions()

    const parsed = parsePendingTransactionInput({
        text: 'Total: RM 10.00',
        source: '  Apple   Pay ',
        reference: ' AP-123 ',
        event_id: ' EVT-123 ',
    })
    assert.equal(parsed.source, 'Apple Pay')
    assert.equal(parsed.reference, 'AP-123')
    assert.equal(parsed.event_id, 'EVT-123')
})

test('invalid calendar dates become a null date warning instead of throwing', async () => {
    const { parsePendingTransactionInput } = await loadPendingTransactions()

    for (const invalidDate of ['2026-13-01', '2026-02-30']) {
        const parsed = parsePendingTransactionInput({ text: 'RM 10.00', date: invalidDate })
        assert.equal(parsed.date, null)
        assert.ok(parsed.warning?.split(',').includes('ambiguous_date'))
    }
})

test('pending draft does not silently choose a substring category or turn unknown into an expense', () => {
    const draftFor = loadDraftFor()
    const draft = draftFor({
        parsed_amount: null,
        parsed_currency: null,
        selected_currency: null,
        manual_conversion: false,
        parsed_date: null,
        parsed_merchant: 'Seafood market',
        parsed_type: 'unknown',
        description: null,
        category_id: null,
        is_dating: false,
        is_for_partner: false,
    })

    assert.equal(draft.categoryId, '')
    assert.equal(draft.kind, 'unknown')
    assert.equal(draft.currency, '')
})

test('pending draft uses a merchant suggestion only when no saved category exists', () => {
    const draftFor = loadDraftFor()
    const row = {
        parsed_amount: 12,
        parsed_currency: 'MYR',
        selected_currency: 'MYR',
        manual_conversion: false,
        parsed_date: '2026-10-08',
        parsed_merchant: 'Kopi House',
        parsed_type: 'expense',
        description: 'Kopi House',
        category_id: null,
        suggested_category_id: 'suggested-category',
        is_dating: false,
        is_for_partner: false,
    }

    assert.equal(draftFor(row).categoryId, 'suggested-category')
    assert.equal(draftFor({ ...row, category_id: 'saved-category' }).categoryId, 'saved-category')
})

test('original receipt text is rendered as escaped content inside native disclosure', () => {
    const OriginalReceiptText = loadOriginalReceiptText()
    assert.equal(typeof OriginalReceiptText, 'function')
    const requireFromTests = createRequire(import.meta.url)
    const React = requireFromTests('react')
    const { renderToStaticMarkup } = requireFromTests('react-dom/server')
    const markup = renderToStaticMarkup(React.createElement(OriginalReceiptText, {
        text: '<img src=x onerror=alert(1)>',
    }))

    assert.match(markup, /<details(?:\s|>)/)
    assert.match(markup, /<summary(?:\s[^>]*)?>Original receipt text<\/summary>/)
    assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/)
    assert.doesNotMatch(markup, /<img src=x/)
})

test('pending migration declares read-only table access, stable-ID dedupe, expiry, and owner-checked RPC writes', () => {
    const source = readFileSync(join(process.cwd(), 'supabase/pending-transactions.sql'), 'utf8')
    const sql = source.replace(/\/\*[\s\S]*?\*\//g, '')

    assert.match(sql, /create table if not exists public\.pending_import_tokens/i)
    assert.match(sql, /token_hash text not null unique/i)
    assert.doesNotMatch(sql, /\btoken\s+text\b/i)
    assert.match(sql, /alter table public\.pending_import_tokens enable row level security/i)
    assert.match(sql, /alter table public\.pending_transactions enable row level security/i)
    assert.match(sql, /using \(\(select auth\.uid\(\)\) = user_id\)/i)
    assert.match(sql, /revoke all on public\.pending_transactions from public, anon, authenticated, service_role/i)
    assert.match(sql, /revoke all on public\.pending_import_tokens from public, anon, authenticated, service_role/i)
    assert.doesNotMatch(sql, /create policy [^;]+for (insert|update|delete)/i)
    assert.match(sql, /expires_at timestamptz not null default \(now\(\) \+ interval '90 days'\)/i)
    assert.match(sql, /create unique index if not exists pending_transactions_user_dedupe_key_idx[\s\S]*where dedupe_key is not null/i)
    assert.match(sql, /stable_key := null/i)
    assert.match(sql, /create or replace function public\.create_pending_transaction[\s\S]*?for update/i)
    assert.match(sql, /insert into public\.expenses/i)
    assert.match(sql, /status = 'confirmed'/i)
    assert.match(sql, /confirmed_expense_id = expense_id/i)
    assert.match(sql, /if pending_row\.status = 'confirmed'/i)
    assert.match(sql, /create or replace function public\.bump_pending_transaction_rate_limit/i)
})

test('create RPC returns acknowledgement fields without serializing pending rows', () => {
    const source = readFileSync(join(process.cwd(), 'supabase/pending-transactions.sql'), 'utf8')
    const start = source.indexOf('create or replace function public.create_pending_transaction(')
    const end = source.indexOf('$function$;', source.indexOf('$function$', start) + '$function$'.length)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const functionSql = source.slice(start, end)

    assert.match(functionSql, /jsonb_build_object\('duplicate',\s*(?:true|false),\s*'pending_id',\s*(?:existing_row|pending_row)\.id,\s*'status',\s*(?:existing_row|pending_row)\.status\)/i)
    assert.doesNotMatch(functionSql, /to_jsonb\((?:existing_row|pending_row)\)/i)
})

test('merchant category suggestions are owner-scoped, exact, unambiguous, and currently valid', () => {
    const source = readFileSync(join(process.cwd(), 'supabase/pending-transactions.sql'), 'utf8')
    const start = source.indexOf('create or replace function public.suggest_pending_transaction_categories(')
    const end = source.indexOf('$function$;', source.indexOf('$function$', start) + '$function$'.length)
    assert.notEqual(start, -1)
    assert.notEqual(end, -1)
    const functionSql = source.slice(start, end)

    assert.match(functionSql, /security definer/i)
    assert.match(functionSql, /p\.user_id\s*=\s*auth\.uid\(\)/i)
    assert.match(functionSql, /history\.user_id\s*=\s*auth\.uid\(\)/i)
    assert.match(functionSql, /pending_merchants\.merchant_key\s*=\s*consistent_categories\.merchant_key/i)
    assert.match(functionSql, /having count\(\*\)\s*=\s*1/i)
    assert.match(functionSql, /join public\.expense_categories[\s\S]*?category\.id\s*=\s*consistent_categories\.category_id[\s\S]*?category\.user_id is null or category\.user_id\s*=\s*auth\.uid\(\)/i)
})

test('opaque provider IDs preserve case and use structured dedupe keys', () => {
    const source = readFileSync(join(process.cwd(), 'supabase/pending-transactions.sql'), 'utf8')
    const start = source.indexOf('create or replace function public.create_pending_transaction(')
    const end = source.indexOf('$function$;', source.indexOf('$function$', start) + '$function$'.length)
    const functionSql = source.slice(start, end)

    assert.match(functionSql, /stable_reference := trim\(coalesce\(p_reference, ''\)\)/i)
    assert.match(functionSql, /stable_event_id := trim\(coalesce\(p_event_id, ''\)\)/i)
    assert.doesNotMatch(functionSql, /stable_(?:reference|event_id) := lower\(/i)
    assert.match(functionSql, /jsonb_build_array\('event',\s*stable_provider,\s*stable_event_id\)::text/i)
    assert.match(functionSql, /jsonb_build_array\('reference',\s*stable_provider,\s*stable_reference\)::text/i)

    const backfillStart = source.indexOf('update public.pending_transactions as pending\nset dedupe_key = encode(digest(')
    assert.notEqual(backfillStart, -1, 'existing provider IDs must be re-keyed to the case-preserving structured format')
    const backfillEnd = source.indexOf(';', backfillStart)
    const backfillSql = source.slice(backfillStart, backfillEnd)
    assert.match(backfillSql, /jsonb_build_array\([\s\S]*pending\.parsed_event_id[\s\S]*pending\.parsed_reference/i)
})

test('authenticated edit and confirm retain rate-limit hits when business logic fails', () => {
    const source = readFileSync(join(process.cwd(), 'supabase/pending-transactions.sql'), 'utf8')
    const editStart = source.indexOf('create or replace function public.edit_pending_transaction(')
    const confirmStart = source.indexOf('create or replace function public.confirm_pending_transaction(')
    const ignoreStart = source.indexOf('create or replace function public.ignore_pending_transaction(')
    const editSql = source.slice(editStart, confirmStart)
    const confirmSql = source.slice(confirmStart, ignoreStart)
    const failureHandler = /exception\s+when others then\s+return jsonb_build_object\('failure_code',\s*SQLSTATE\);/i

    assert.match(editSql, /retry_after := public\.bump_pending_transaction_rate_limit\([^;]+;[\s\S]*?begin\s+if p_kind/i)
    assert.match(editSql, failureHandler)
    assert.match(confirmSql, /retry_after := public\.bump_pending_transaction_rate_limit\([^;]+;[\s\S]*?begin\s+if pending_row\.status = 'ignored'/i)
    assert.match(confirmSql, failureHandler)
})

test('policy cleanup rejects unexpected policies rather than dropping them', () => {
    const source = readFileSync(join(process.cwd(), 'supabase/pending-transactions.sql'), 'utf8')
    const cleanup = source.match(/do \$policy_cleanup\$([\s\S]*?)\$policy_cleanup\$;/i)?.[1] ?? ''

    assert.match(cleanup, /raise exception[^;]*unexpected policy/i)
    assert.match(cleanup, /pending_import_tokens_select_own/i)
    assert.match(cleanup, /pending_transactions_select_own/i)
    assert.match(cleanup, /execute format\('drop policy if exists %I on %I\.%I'/i)
})

test('obsolete commented legacy RPC bodies are removed while explicit drops remain', () => {
    const source = readFileSync(join(process.cwd(), 'supabase/pending-transactions.sql'), 'utf8')

    assert.doesNotMatch(source, /Legacy function bodies are retained here only as migration history/i)
    assert.match(source, /drop function if exists public\.confirm_pending_transaction_legacy\(/i)
    assert.match(source, /drop function if exists public\.ignore_pending_transaction_legacy\(/i)
})
