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

test('shared expense totals keep current user and partner totals separate', async () => {
    const { calculateSharedExpenseTotals } = await loadFinanceCalculations()

    const totals = calculateSharedExpenseTotals({
        userId: 'user-a',
        partnerUserIds: ['user-b'],
        expenses: [
            { user_id: 'user-a', amount: 120 },
            { user_id: 'user-b', amount: 80 },
            { user_id: 'user-c', amount: 999 },
            { user_id: null, amount: 500 },
        ],
    })

    assert.deepEqual(totals, {
        myExpenses: 120,
        partnerExpenses: 80,
    })
})

test('shared expense totals show zero when partner has no expenses', async () => {
    const { calculateSharedExpenseTotals } = await loadFinanceCalculations()

    assert.deepEqual(
        calculateSharedExpenseTotals({
            userId: 'user-a',
            partnerUserIds: ['user-b'],
            expenses: [{ user_id: 'user-a', amount: 120 }],
        }),
        {
            myExpenses: 120,
            partnerExpenses: 0,
        }
    )
})

test('category limits keep hidden records manageable while showing only active limits', async () => {
    const { getActiveCategoryLimits, getHiddenCategoryLimits } = await loadFinanceCalculations()

    const limits = [
        { id: 'limit-food', category_id: 'food', category_name: 'Food', monthly_limit: 800, is_active: true },
        { id: 'limit-fitness', category_id: 'fitness', category_name: 'Fitness', monthly_limit: 200, is_active: false },
    ]

    assert.deepEqual(getActiveCategoryLimits(limits).map((limit) => limit.id), ['limit-food'])
    assert.deepEqual(getHiddenCategoryLimits(limits).map((limit) => limit.id), ['limit-fitness'])
})

test('category limit duplicate check ignores the limit being edited', async () => {
    const { hasDuplicateCategoryLimit } = await loadFinanceCalculations()

    const limits = [
        { id: 'limit-food', category_id: 'food', category_name: 'Food', monthly_limit: 800, is_active: true },
        { id: 'limit-transport', category_id: 'transport', category_name: 'Transport', monthly_limit: 300, is_active: true },
    ]

    assert.equal(hasDuplicateCategoryLimit(limits, 'food'), true)
    assert.equal(hasDuplicateCategoryLimit(limits, 'food', 'limit-food'), false)
    assert.equal(hasDuplicateCategoryLimit(limits, 'transport', 'limit-food'), true)
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

test('local date formatter uses browser-local date parts for date inputs', async () => {
    const { formatLocalDateForInput } = await loadFinanceCalculations()

    assert.equal(formatLocalDateForInput(new Date(2026, 5, 30, 23, 59, 0)), '2026-06-30')
    assert.equal(formatLocalDateForInput(new Date(2026, 0, 1, 0, 1, 0)), '2026-01-01')
})

test('auto-decimal money input treats typed digits as cents', async () => {
    const { amountToMoneyDigits, formatMoneyDigitsForDisplay, moneyDigitsToAmount, normalizeMoneyDigits } =
        await loadFinanceCalculations()

    assert.equal(normalizeMoneyDigits('RM 12.3a4'), '1234')
    assert.equal(moneyDigitsToAmount('1'), 0.01)
    assert.equal(moneyDigitsToAmount('12'), 0.12)
    assert.equal(moneyDigitsToAmount('123'), 1.23)
    assert.equal(moneyDigitsToAmount('1234'), 12.34)
    assert.equal(moneyDigitsToAmount('12345'), 123.45)
    assert.equal(formatMoneyDigitsForDisplay('1234'), 'RM 12.34')
    assert.equal(amountToMoneyDigits(12.34), '1234')
    assert.equal(amountToMoneyDigits('0.01'), '1')
})

test('amount visibility state toggles one stable section without affecting others', async () => {
    const { getAmountVisibilityStorageKey, toggleAmountVisibilityState } = await loadFinanceCalculations()

    const incomeKey = getAmountVisibilityStorageKey('user-a', 'dashboard', 'my-income')
    const expensesKey = getAmountVisibilityStorageKey('user-a', 'dashboard', 'my-expenses')
    const trackerIncomeKey = getAmountVisibilityStorageKey('user-a', 'tracker', 'my-income')

    assert.equal(incomeKey, 'finance-visibility:user-a:dashboard:my-income')
    assert.equal(expensesKey, 'finance-visibility:user-a:dashboard:my-expenses')
    assert.equal(trackerIncomeKey, 'finance-visibility:user-a:tracker:my-income')

    const firstState = toggleAmountVisibilityState({}, incomeKey)
    assert.equal(firstState[incomeKey], true)
    assert.equal(firstState[expensesKey] ?? false, false)
    assert.equal(firstState[trackerIncomeKey] ?? false, false)

    const secondState = toggleAmountVisibilityState(firstState, expensesKey)
    assert.equal(secondState[incomeKey], true)
    assert.equal(secondState[expensesKey], true)
    assert.equal(secondState[trackerIncomeKey] ?? false, false)

    const thirdState = toggleAmountVisibilityState(secondState, incomeKey)
    assert.equal(thirdState[incomeKey], false)
    assert.equal(thirdState[expensesKey], true)
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
        'finance:v6:tracker:user-a:user-a,user-b:personal:expense:day:2026-06-23:p1'
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

test('monthly rollups add leftover, consume it, then carry uncovered overspend', async () => {
    const { calculateMonthlyFinanceRollups } = await loadFinanceCalculations()
    const rollups = calculateMonthlyFinanceRollups([
        { month_start: '2026-01-01', income_total: 4000, expenses_total: 2500, savings_from_income_total: 1000 },
        { month_start: '2026-02-01', income_total: 4000, expenses_total: 3300, savings_from_income_total: 1000 },
        { month_start: '2026-03-01', income_total: 4000, expenses_total: 3600, savings_from_income_total: 1000 },
    ], '2026-03-01')

    assert.deepEqual(
        rollups.map(({
            month_start,
            leftover_added,
            leftover_used,
            ending_leftover_balance,
            overspend_created,
            overspend_carried_out,
        }) => ({
            month_start,
            leftover_added,
            leftover_used,
            ending_leftover_balance,
            overspend_created,
            overspend_carried_out,
        })),
        [
            { month_start: '2026-01-01', leftover_added: 500, leftover_used: 0, ending_leftover_balance: 500, overspend_created: 0, overspend_carried_out: 0 },
            { month_start: '2026-02-01', leftover_added: 0, leftover_used: 300, ending_leftover_balance: 200, overspend_created: 0, overspend_carried_out: 0 },
            { month_start: '2026-03-01', leftover_added: 0, leftover_used: 200, ending_leftover_balance: 0, overspend_created: 400, overspend_carried_out: 400 },
        ]
    )
})

test('old overspend is paid before current expenses and historical changes recalculate following months', async () => {
    const { calculateMonthlyFinanceRollups } = await loadFinanceCalculations()
    const initial = calculateMonthlyFinanceRollups([
        { month_start: '2026-01-01', income_total: 4000, expenses_total: 3800, savings_from_income_total: 1000 },
        { month_start: '2026-02-01', income_total: 4000, expenses_total: 0, savings_from_income_total: 1000 },
    ], '2026-02-01')

    assert.equal(initial[0].overspend_carried_out, 800)
    assert.equal(initial[1].overspend_paid, 800)
    assert.equal(initial[1].available_after_overspend, 2200)

    const recalculated = calculateMonthlyFinanceRollups([
        { month_start: '2026-01-01', income_total: 5000, expenses_total: 3800, savings_from_income_total: 1000 },
        { month_start: '2026-02-01', income_total: 4000, expenses_total: 0, savings_from_income_total: 1000 },
    ], '2026-02-01')

    assert.equal(recalculated[0].overspend_carried_out, 0)
    assert.equal(recalculated[0].ending_leftover_balance, 200)
    assert.equal(recalculated[1].overspend_carried_in, 0)
})

test('deficit continues across months without consuming other savings', async () => {
    const { calculateMonthlyFinanceRollups } = await loadFinanceCalculations()
    const rollups = calculateMonthlyFinanceRollups([
        {
            month_start: '2026-01-01',
            income_total: 4000,
            expenses_total: 3800,
            savings_from_income_total: 1000,
            savings_existing_money_total: 5000,
        },
        {
            month_start: '2026-02-01',
            income_total: 500,
            expenses_total: 200,
            savings_other_total: 9000,
        },
    ], '2026-02-01')

    assert.equal(rollups[0].overspend_carried_out, 800)
    assert.equal(rollups[1].overspend_paid, 500)
    assert.equal(rollups[1].overspend_carried_out, 500)
    assert.equal(rollups[1].ending_leftover_balance, 0)
})

test('rollups fill empty months and safely treat savings above income as a deficit', async () => {
    const { calculateMonthlyFinanceRollups } = await loadFinanceCalculations()
    const rollups = calculateMonthlyFinanceRollups([
        { month_start: '2026-01-01', income_total: 100, savings_from_income_total: 200 },
        { month_start: '2026-03-01', income_total: 500 },
    ], '2026-03-01')

    assert.deepEqual(rollups.map((row) => row.month_start), ['2026-01-01', '2026-02-01', '2026-03-01'])
    assert.equal(rollups[0].ending_leftover_balance, 0)
    assert.equal(rollups[0].overspend_created, 100)
    assert.equal(rollups[1].overspend_carried_out, 100)
    assert.equal(rollups[2].overspend_paid, 100)
    assert.equal(rollups[2].ending_leftover_balance, 400)
})

test('period summaries add flows and use only the final month balances', async () => {
    const { calculateMonthlyFinanceRollups, summarizeFinancePeriod } = await loadFinanceCalculations()
    const rollups = calculateMonthlyFinanceRollups([
        { month_start: '2025-12-01', income_total: 100, expenses_total: 50 },
        { month_start: '2026-01-01', income_total: 4000, expenses_total: 2500, savings_from_income_total: 1000, manual_withdrawals_total: 50 },
        { month_start: '2026-02-01', income_total: 4000, expenses_total: 3300, savings_from_income_total: 1000, savings_existing_money_total: 200 },
    ], '2026-02-01')

    const month = summarizeFinancePeriod(rollups, { mode: 'month', year: '2026', month: '2' })
    assert.equal(month.income_total, 4000)
    assert.equal(month.ending_leftover_balance, 250)

    const year = summarizeFinancePeriod(rollups, { mode: 'year', year: '2026', month: 'all' })
    assert.equal(year.income_total, 8000)
    assert.equal(year.leftover_added, 500)
    assert.equal(year.leftover_used, 300)
    assert.equal(year.ending_leftover_balance, 250)

    const all = summarizeFinancePeriod(rollups, { mode: 'all', year: 'all', month: 'all' })
    assert.equal(all.income_total, 8100)
    assert.equal(all.ending_leftover_balance, 250)
})

test('day summary uses the containing monthly state', async () => {
    const { calculateMonthlyFinanceRollups, summarizeFinancePeriod } = await loadFinanceCalculations()
    const rollups = calculateMonthlyFinanceRollups([
        { month_start: '2026-06-01', income_total: 4000, expenses_total: 2500, savings_from_income_total: 1000 },
    ], '2026-06-01')
    const day = summarizeFinancePeriod(rollups, { mode: 'day', year: '2026', month: '6' })

    assert.equal(day.context, 'monthly')
    assert.equal(day.ending_leftover_balance, 500)
})

test('total savings deducts manual withdrawals once and never re-deducts leftover used', async () => {
    const { calculateMonthlyFinanceRollups, summarizeFinancePeriod, calculateTotalSavings } =
        await loadFinanceCalculations()
    const rollups = calculateMonthlyFinanceRollups([
        {
            month_start: '2026-01-01',
            income_total: 4000,
            expenses_total: 2500,
            savings_from_income_total: 1000,
            savings_existing_money_total: 500,
            savings_other_total: 200,
            manual_withdrawals_total: 100,
        },
        { month_start: '2026-02-01', income_total: 4000, expenses_total: 3300, savings_from_income_total: 1000 },
    ], '2026-02-01')
    const summary = summarizeFinancePeriod(rollups, { mode: 'month', year: '2026', month: '2' })

    assert.equal(summary.leftover_used, 300)
    assert.equal(summary.ending_leftover_balance, 200)
    assert.equal(calculateTotalSavings(summary), 2800)
})

test('cash flow display shows selected-period remaining, zero, and overspend without carry-forward', async () => {
    const { calculateMonthlyFinanceRollups, summarizeFinancePeriod, calculateCashFlowDisplay } =
        await loadFinanceCalculations()
    const rollups = calculateMonthlyFinanceRollups([
        { month_start: '2026-01-01', income_total: 4000, expenses_total: 2500, savings_from_income_total: 1000 },
        { month_start: '2026-02-01', income_total: 4000, expenses_total: 3300, savings_from_income_total: 1000 },
        { month_start: '2026-03-01', income_total: 4000, expenses_total: 3600, savings_from_income_total: 1000 },
    ], '2026-03-01')

    assert.equal(
        calculateCashFlowDisplay(summarizeFinancePeriod(rollups, { mode: 'month', year: '2026', month: '1' })),
        500
    )
    assert.equal(
        calculateCashFlowDisplay(summarizeFinancePeriod(rollups, { mode: 'month', year: '2026', month: '2' })),
        -300
    )
    assert.equal(
        calculateCashFlowDisplay(summarizeFinancePeriod(rollups, { mode: 'month', year: '2026', month: '3' })),
        -600
    )
})

test('cash flow ignores prior-month leftover and overspend when showing the selected month', async () => {
    const { calculateMonthlyFinanceRollups, summarizeFinancePeriod, calculateCashFlowDisplay } =
        await loadFinanceCalculations()

    const rollups = calculateMonthlyFinanceRollups([
        { month_start: '2025-12-01', income_total: 100, expenses_total: 300 },
        { month_start: '2026-01-01', income_total: 1000, expenses_total: 500 },
    ], '2026-01-01')

    assert.equal(
        calculateCashFlowDisplay(summarizeFinancePeriod(rollups, { mode: 'month', year: '2026', month: '1' })),
        500
    )
})

test('year cash flow totals only the selected year and supports positive negative and zero results', async () => {
    const { calculateMonthlyFinanceRollups, summarizeFinancePeriod, calculateCashFlowDisplay } =
        await loadFinanceCalculations()

    const cases = [
        {
            inputs: [
                { month_start: '2025-12-01', income_total: 100, expenses_total: 300 },
                { month_start: '2026-01-01', income_total: 1000, expenses_total: 500 },
            ],
            expected: 500,
        },
        {
            inputs: [
                { month_start: '2025-12-01', income_total: 100, expenses_total: 300 },
                { month_start: '2026-01-01', income_total: 1000, expenses_total: 1200 },
            ],
            expected: -200,
        },
        {
            inputs: [
                { month_start: '2025-12-01', income_total: 100, expenses_total: 300 },
                { month_start: '2026-01-01', income_total: 1000, expenses_total: 1000 },
            ],
            expected: 0,
        },
    ]

    for (const { inputs, expected } of cases) {
        const rollups = calculateMonthlyFinanceRollups(inputs, '2026-01-01')
        assert.equal(
            calculateCashFlowDisplay(summarizeFinancePeriod(rollups, { mode: 'year', year: '2026', month: 'all' })),
            expected
        )
    }
})

test('year category limits use twelve times the monthly limit while month and all keep the monthly limit', async () => {
    const { getCategoryLimitForMode } = await loadFinanceCalculations()

    assert.equal(getCategoryLimitForMode(250, 'year'), 3000)
    assert.equal(getCategoryLimitForMode(250, 'month'), 250)
    assert.equal(getCategoryLimitForMode(250, 'all'), 250)
})

test('category spending prefers category id and falls back to normalized category name', async () => {
    const { aggregateCategorySpending } = await loadFinanceCalculations()

    assert.deepEqual(
        aggregateCategorySpending([
            { category_id: 'food-id', category: 'Food', amount: 10 },
            { category_id: 'food-id', category: 'Food renamed', amount: 20 },
            { category_id: null, category: '  Transport  ', amount: 5 },
            { category_id: null, category: 'Transport', amount: 7 },
        ]),
        [
            { category_id: 'food-id', category: 'Food', amount: 30 },
            { category_id: null, category: 'Transport', amount: 12 },
        ]
    )
})

test('expense query specification builds exact id OR null-only name fallback, AND tags, and description search', async () => {
    const { buildExpenseQuerySpec } = await loadFinanceCalculations()

    assert.deepEqual(
        buildExpenseQuerySpec({
            categories: [
                { id: 'food-id', name: 'Food' },
                { id: 'other-food-id', name: 'Food' },
                { id: null, name: 'Legacy, "OBrien"' },
            ],
            search: '  50% off  ',
            dating: true,
            partner: true,
        }),
        {
            categoryIds: ['food-id', 'other-food-id'],
            categoryNames: ['Food', 'Legacy, "OBrien"'],
            categoryOrFilter: 'category_id.in.("food-id","other-food-id"),and(category_id.is.null,category.in.("Food","Legacy, \\"OBrien\\""))',
            searchPattern: '%50\\% off%',
            dating: true,
            partner: true,
            hasExpenseOnlyFilters: true,
        }
    )
})

test('description-only query keeps transaction type filters open', async () => {
    const { buildExpenseQuerySpec } = await loadFinanceCalculations()

    assert.deepEqual(buildExpenseQuerySpec({ search: 'dinner' }), {
        categoryIds: [],
        categoryNames: [],
        categoryOrFilter: null,
        searchPattern: '%dinner%',
        dating: false,
        partner: false,
        hasExpenseOnlyFilters: false,
    })
})

test('finance transaction pagination uses date then created_at then id as stable descending keys', async () => {
    const { getStableTransactionOrder } = await loadFinanceCalculations()

    assert.deepEqual(getStableTransactionOrder('spent_at'), [
        { column: 'spent_at', ascending: false, nullsFirst: false },
        { column: 'created_at', ascending: false, nullsFirst: false },
        { column: 'id', ascending: false, nullsFirst: false },
    ])
    assert.deepEqual(getStableTransactionOrder('received_at'), [
        { column: 'received_at', ascending: false, nullsFirst: false },
        { column: 'created_at', ascending: false, nullsFirst: false },
        { column: 'id', ascending: false, nullsFirst: false },
    ])
    assert.deepEqual(getStableTransactionOrder('saved_at'), [
        { column: 'saved_at', ascending: false, nullsFirst: false },
        { column: 'created_at', ascending: false, nullsFirst: false },
        { column: 'id', ascending: false, nullsFirst: false },
    ])
})

test('finance transaction comparator is deterministic for null timestamps and cumulative page expansion', async () => {
    const { compareFinanceTransactions } = await loadFinanceCalculations()
    const rows = [
        { id: 'same-id', kind: 'savings', date: '2026-06-02', created_at: null },
        { id: 'same-id', kind: 'income', date: '2026-06-02', created_at: null },
        { id: 'older-id', kind: 'expense', date: '2026-06-02', created_at: null },
        { id: 'created-id', kind: 'expense', date: '2026-06-02', created_at: '2026-06-02T00:00:01Z' },
        { id: 'old-date', kind: 'expense', date: '2026-06-01', created_at: null },
    ]
    const key = (row) => `${row.id}:${row.kind}`
    const expectedOrder = ['created-id:expense', 'same-id:income', 'same-id:savings', 'older-id:expense', 'old-date:expense']

    const firstSort = [...rows].sort(compareFinanceTransactions).map(key)
    const secondSort = [...rows].sort(compareFinanceTransactions).map(key)
    assert.deepEqual(firstSort, expectedOrder)
    assert.deepEqual(secondSort, expectedOrder)

    const expandedSort = [
        ...rows,
        { id: 'oldest-id', kind: 'expense', date: '2026-05-31', created_at: null },
    ].sort(compareFinanceTransactions).map(key)
    assert.deepEqual(expandedSort.filter((rowKey) => expectedOrder.includes(rowKey)), expectedOrder)
})

test('personal finance cards never appear as partner or combined calculations', async () => {
    const { shouldShowPersonalFinanceCards } = await loadFinanceCalculations()

    assert.equal(shouldShowPersonalFinanceCards('dashboard', 'combined'), true)
    assert.equal(shouldShowPersonalFinanceCards('tracker', 'personal'), true)
    assert.equal(shouldShowPersonalFinanceCards('tracker', 'partner'), false)
    assert.equal(shouldShowPersonalFinanceCards('tracker', 'combined'), false)
})

test('monthly inputs SQL is authenticated read-only and idempotently indexed', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/finance-monthly-inputs.sql'), 'utf8')

    assert.match(sql, /finance_monthly_inputs\s*\(\s*\)/i)
    assert.match(sql, /security invoker/i)
    assert.match(sql, /select auth\.uid\(\)/i)
    assert.doesNotMatch(sql, /target_user_id|insert\s+into|update\s+public\.|delete\s+from/i)
    assert.equal((sql.match(/create index if not exists/gi) ?? []).length, 3)
    assert.match(sql, /revoke execute on function public\.finance_monthly_inputs\(\) from public/i)
    assert.match(sql, /grant execute on function public\.finance_monthly_inputs\(\) to authenticated/i)
})
