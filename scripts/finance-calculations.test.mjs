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
