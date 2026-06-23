import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

async function loadFinanceCalculations() {
    const sourcePath = join(process.cwd(), 'app/lib/finance-calculations.ts')
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

test('personal totals exclude partner expenses and deduct only monthly-income savings from cash flow', async () => {
    const { calculateFinanceTotals } = await loadFinanceCalculations()

    const totals = calculateFinanceTotals({
        userId: 'user-a',
        expenses: [
            { user_id: 'user-a', amount: 2000 },
            { user_id: 'user-b', amount: 500 },
        ],
        incomes: [{ user_id: 'user-a', amount: 4000 }],
        savings: [
            { user_id: 'user-a', amount: 1000, type: 'deposit', source: 'monthly_income' },
            { user_id: 'user-a', amount: 500, type: 'deposit', source: 'existing_money' },
            { user_id: 'user-a', amount: 200, type: 'withdrawal', source: 'other' },
        ],
    })

    assert.equal(totals.expenses, 2000)
    assert.equal(totals.income, 4000)
    assert.equal(totals.savedFromIncome, 1000)
    assert.equal(totals.cashFlow, 1000)
    assert.equal(totals.savingsDeposits, 1500)
    assert.equal(totals.savingsWithdrawals, 200)
    assert.equal(totals.monthlySavings, 1300)
})

test('savings balance is deposits minus withdrawals, grouped by account and never displayed below zero', async () => {
    const { calculateSavingsBalance, calculateSavingsAccountBalances } = await loadFinanceCalculations()

    const rows = [
        { user_id: 'user-a', account_id: 'emergency', amount: 1000, type: 'deposit', source: 'monthly_income' },
        { user_id: 'user-a', account_id: 'emergency', amount: 1000, type: 'withdrawal', source: 'other' },
        { user_id: 'user-a', account_id: 'travel', amount: 300, type: 'withdrawal', source: 'other' },
        { user_id: 'user-b', account_id: 'emergency', amount: 999, type: 'deposit', source: 'monthly_income' },
    ]

    assert.equal(calculateSavingsBalance(rows, { userId: 'user-a' }), 0)
    assert.deepEqual(calculateSavingsAccountBalances(rows, 'user-a'), {
        emergency: 0,
        travel: 0,
    })
})

test('withdrawal validation accounts for an edited existing transaction', async () => {
    const { getAvailableBalanceForWithdrawal } = await loadFinanceCalculations()

    const rows = [
        { id: 'deposit-1', user_id: 'user-a', account_id: 'emergency', amount: 1000, type: 'deposit', source: 'monthly_income' },
        { id: 'withdraw-1', user_id: 'user-a', account_id: 'emergency', amount: 400, type: 'withdrawal', source: 'other' },
    ]

    assert.equal(
        getAvailableBalanceForWithdrawal(rows, {
            userId: 'user-a',
            accountId: 'emergency',
            editingTransactionId: 'withdraw-1',
        }),
        1000
    )
})

test('finance date ranges support day month year and all filters', async () => {
    const { buildFinanceDateRange } = await loadFinanceCalculations()

    assert.deepEqual(buildFinanceDateRange({ mode: 'day', year: '2026', month: '6', day: '23' }), {
        startISO: '2026-06-23',
        endISO: '2026-06-24',
        label: '23 Jun 2026',
    })

    assert.deepEqual(buildFinanceDateRange({ mode: 'month', year: '2026', month: '6', day: 'all' }), {
        startISO: '2026-06-01',
        endISO: '2026-07-01',
        label: 'Jun 2026',
    })

    assert.deepEqual(buildFinanceDateRange({ mode: 'year', year: '2026', month: 'all', day: 'all' }), {
        startISO: '2026-01-01',
        endISO: '2027-01-01',
        label: '2026',
    })

    assert.deepEqual(buildFinanceDateRange({ mode: 'all', year: 'all', month: 'all', day: 'all' }), {
        startISO: null,
        endISO: null,
        label: 'All years',
    })
})

test('finance cache key separates scope filter and transaction type', async () => {
    const { createFinanceCacheKey } = await loadFinanceCalculations()

    assert.equal(
        createFinanceCacheKey({
            userId: 'user-a',
            visibleUserIds: ['user-b', 'user-a'],
            surface: 'tracker',
            scope: 'personal',
            mode: 'day',
            year: '2026',
            month: '6',
            day: '23',
            transactionType: 'expense',
            page: 1,
        }),
        'finance:v5:tracker:user-a:user-a,user-b:personal:expense:day:2026-06-23:p1'
    )

    assert.notEqual(
        createFinanceCacheKey({
            userId: 'user-a',
            visibleUserIds: ['user-a', 'user-b'],
            surface: 'tracker',
            scope: 'personal',
            mode: 'month',
            year: '2026',
            month: '6',
            day: 'all',
            transactionType: 'expense',
            page: 1,
        }),
        createFinanceCacheKey({
            userId: 'user-a',
            visibleUserIds: ['user-a', 'user-b'],
            surface: 'tracker',
            scope: 'combined',
            mode: 'month',
            year: '2026',
            month: '6',
            day: 'all',
            transactionType: 'expense',
            page: 1,
        })
    )
})

test('pagination metadata requests another page only after a full page', async () => {
    const { getPaginationState } = await loadFinanceCalculations()

    assert.deepEqual(getPaginationState({ received: 10, pageSize: 10, page: 0 }), {
        page: 0,
        hasMore: true,
        nextPage: 1,
    })
    assert.deepEqual(getPaginationState({ received: 4, pageSize: 10, page: 2 }), {
        page: 2,
        hasMore: false,
        nextPage: 3,
    })
})

test('finance breakdown groups records by day month or year', async () => {
    const { buildFinanceBreakdown } = await loadFinanceCalculations()
    const rows = [
        { date: '2026-06-01', amount: -100 },
        { date: '2026-06-01', amount: 50 },
        { date: '2026-06-02', amount: -20 },
        { date: '2026-07-10', amount: -30 },
        { date: '2025-12-31', amount: -40 },
    ]

    assert.deepEqual(buildFinanceBreakdown(rows, 'month'), [
        { key: '2025-12-31', label: '31 Dec', amount: -40 },
        { key: '2026-06-01', label: '01 Jun', amount: -50 },
        { key: '2026-06-02', label: '02 Jun', amount: -20 },
        { key: '2026-07-10', label: '10 Jul', amount: -30 },
    ])

    assert.deepEqual(buildFinanceBreakdown(rows, 'year'), [
        { key: '2025-12', label: 'Dec 2025', amount: -40 },
        { key: '2026-06', label: 'Jun 2026', amount: -70 },
        { key: '2026-07', label: 'Jul 2026', amount: -30 },
    ])

    assert.deepEqual(buildFinanceBreakdown(rows, 'all'), [
        { key: '2025', label: '2025', amount: -40 },
        { key: '2026', label: '2026', amount: -100 },
    ])
})
