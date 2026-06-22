export type SavingsSource = 'monthly_income' | 'existing_money' | 'other'
export type SavingsAction = 'deposit' | 'withdrawal'

export type AmountRow = {
    user_id: string | null
    amount: number
}

export type SavingsAmountRow = AmountRow & {
    id?: string | null
    account_id?: string | null
    type: SavingsAction
    source?: SavingsSource | null
}

export type FinanceTotalsInput = {
    userId: string
    expenses: AmountRow[]
    incomes: AmountRow[]
    savings: SavingsAmountRow[]
}

export type FinanceTotals = {
    expenses: number
    income: number
    netBeforeSavings: number
    savedFromIncome: number
    cashFlow: number
    monthlySavings: number
    savingsDeposits: number
    savingsWithdrawals: number
}

export const UNASSIGNED_SAVINGS_ACCOUNT_KEY = '__unassigned__'

function amount(value: number) {
    return Number.isFinite(value) ? value : 0
}

function belongsToUser(row: AmountRow, userId: string) {
    return row.user_id === userId
}

export function isMonthlyIncomeSavingsDeposit(row: SavingsAmountRow) {
    return row.type === 'deposit' && (row.source ?? 'monthly_income') === 'monthly_income'
}

export function signedSavingsAmount(row: SavingsAmountRow) {
    return row.type === 'withdrawal' ? -amount(row.amount) : amount(row.amount)
}

export function calculateFinanceTotals(input: FinanceTotalsInput): FinanceTotals {
    const ownExpenses = input.expenses.filter((row) => belongsToUser(row, input.userId))
    const ownIncomes = input.incomes.filter((row) => belongsToUser(row, input.userId))
    const ownSavings = input.savings.filter((row) => belongsToUser(row, input.userId))

    const expenses = ownExpenses.reduce((sum, row) => sum + amount(row.amount), 0)
    const income = ownIncomes.reduce((sum, row) => sum + amount(row.amount), 0)
    const savingsDeposits = ownSavings
        .filter((row) => row.type === 'deposit')
        .reduce((sum, row) => sum + amount(row.amount), 0)
    const savingsWithdrawals = ownSavings
        .filter((row) => row.type === 'withdrawal')
        .reduce((sum, row) => sum + amount(row.amount), 0)
    const savedFromIncome = ownSavings
        .filter(isMonthlyIncomeSavingsDeposit)
        .reduce((sum, row) => sum + amount(row.amount), 0)

    return {
        expenses,
        income,
        netBeforeSavings: income - expenses,
        savedFromIncome,
        cashFlow: income - expenses - savedFromIncome,
        monthlySavings: savingsDeposits - savingsWithdrawals,
        savingsDeposits,
        savingsWithdrawals,
    }
}

export function calculateSavingsBalance(
    rows: SavingsAmountRow[],
    options: { userId?: string; accountId?: string | null; excludeTransactionId?: string | null } = {}
) {
    const balance = rows.reduce((sum, row) => {
        if (options.userId && row.user_id !== options.userId) return sum
        if ('accountId' in options && row.account_id !== options.accountId) return sum
        if (options.excludeTransactionId && row.id === options.excludeTransactionId) return sum
        return sum + signedSavingsAmount(row)
    }, 0)

    return Math.max(0, balance)
}

export function calculateSavingsAccountBalances(rows: SavingsAmountRow[], userId: string) {
    const balances = new Map<string, number>()

    rows.forEach((row) => {
        if (row.user_id !== userId) return
        const accountKey = row.account_id || UNASSIGNED_SAVINGS_ACCOUNT_KEY
        balances.set(accountKey, (balances.get(accountKey) ?? 0) + signedSavingsAmount(row))
    })

    return Object.fromEntries(
        Array.from(balances.entries()).map(([accountId, balance]) => [accountId, Math.max(0, balance)])
    )
}

export function getAvailableBalanceForWithdrawal(
    rows: SavingsAmountRow[],
    options: {
        userId: string
        accountId: string | null
        editingTransactionId?: string | null
    }
) {
    return calculateSavingsBalance(rows, {
        userId: options.userId,
        accountId: options.accountId,
        excludeTransactionId: options.editingTransactionId,
    })
}
