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
