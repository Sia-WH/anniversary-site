export type SavingsSource = 'monthly_income' | 'existing_money' | 'other'
export type SavingsAction = 'deposit' | 'withdrawal'
export type FinanceFilterMode = 'day' | 'month' | 'year' | 'all'
export type FinanceScope = 'personal' | 'partner' | 'combined'
export type FinanceTransactionType = 'all' | 'expense' | 'income' | 'savings'

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

export type SharedExpenseTotalsInput = {
    userId: string
    partnerUserIds: string[]
    expenses: AmountRow[]
}

export type SharedExpenseTotals = {
    myExpenses: number
    partnerExpenses: number
}

export type CategoryLimitStateRow = {
    id: string
    category_id: string
    is_active: boolean
}

export const UNASSIGNED_SAVINGS_ACCOUNT_KEY = '__unassigned__'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(value: number | string) {
    return String(Number(value)).padStart(2, '0')
}

export function formatLocalDateForInput(date: Date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

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

export function calculateSharedExpenseTotals(input: SharedExpenseTotalsInput): SharedExpenseTotals {
    const partnerUserIds = new Set(input.partnerUserIds.filter(Boolean))

    return input.expenses.reduce(
        (totals, row) => {
            if (row.user_id === input.userId) {
                totals.myExpenses += amount(row.amount)
            } else if (row.user_id && partnerUserIds.has(row.user_id)) {
                totals.partnerExpenses += amount(row.amount)
            }

            return totals
        },
        { myExpenses: 0, partnerExpenses: 0 }
    )
}

export function getActiveCategoryLimits<T extends CategoryLimitStateRow>(limits: T[]) {
    return limits.filter((limit) => limit.is_active)
}

export function getHiddenCategoryLimits<T extends CategoryLimitStateRow>(limits: T[]) {
    return limits.filter((limit) => !limit.is_active)
}

export function hasDuplicateCategoryLimit<T extends CategoryLimitStateRow>(
    limits: T[],
    categoryId: string,
    editingLimitId?: string | null
) {
    return limits.some((limit) => limit.category_id === categoryId && limit.id !== editingLimitId)
}

export function normalizeMoneyDigits(value: string) {
    return value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
}

export function moneyDigitsToAmount(value: string) {
    const digits = normalizeMoneyDigits(value)
    if (!digits) return 0
    return Number((Number(digits) / 100).toFixed(2))
}

export function amountToMoneyDigits(value: number | string) {
    const parsed = Number(value)
    if (!Number.isFinite(parsed) || parsed <= 0) return ''
    return String(Math.round(parsed * 100))
}

export function formatMoneyDigitsForDisplay(value: string) {
    return `RM ${moneyDigitsToAmount(value).toLocaleString('en-MY', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`
}

export type AmountVisibilityState = Record<string, boolean>

export function getAmountVisibilityStorageKey(userId: string, surface: string, sectionKey: string) {
    return `finance-visibility:${userId}:${surface}:${sectionKey}`
}

export function toggleAmountVisibilityState(state: AmountVisibilityState, storageKey: string): AmountVisibilityState {
    return {
        ...state,
        [storageKey]: !Boolean(state[storageKey]),
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

export function buildFinanceDateRange(input: {
    mode: FinanceFilterMode
    year: string
    month: string
    day: string
}) {
    if (input.mode === 'all') {
        return { startISO: null, endISO: null, label: 'All years' }
    }

    const year = Number(input.year)
    if (!Number.isFinite(year)) {
        return { startISO: null, endISO: null, label: 'All years' }
    }

    if (input.mode === 'year') {
        return {
            startISO: `${year}-01-01`,
            endISO: `${year + 1}-01-01`,
            label: String(year),
        }
    }

    const month = Number(input.month)
    if (!Number.isFinite(month) || month < 1 || month > 12) {
        return {
            startISO: `${year}-01-01`,
            endISO: `${year + 1}-01-01`,
            label: String(year),
        }
    }

    if (input.mode === 'month') {
        const nextMonth = month === 12 ? 1 : month + 1
        const nextYear = month === 12 ? year + 1 : year
        return {
            startISO: `${year}-${pad2(month)}-01`,
            endISO: `${nextYear}-${pad2(nextMonth)}-01`,
            label: `${MONTHS[month - 1]} ${year}`,
        }
    }

    const day = Number(input.day)
    const safeDay = Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1
    const start = new Date(Date.UTC(year, month - 1, safeDay))
    const end = new Date(Date.UTC(year, month - 1, safeDay + 1))

    return {
        startISO: start.toISOString().slice(0, 10),
        endISO: end.toISOString().slice(0, 10),
        label: `${pad2(safeDay)} ${MONTHS[month - 1]} ${year}`,
    }
}

export function createFinanceCacheKey(input: {
    userId: string
    visibleUserIds: string[]
    surface: 'dashboard' | 'tracker'
    scope: FinanceScope
    mode: FinanceFilterMode
    year: string
    month: string
    day: string
    transactionType: FinanceTransactionType
    page?: number
}) {
    const visibleScope = Array.from(new Set([input.userId, ...input.visibleUserIds])).sort().join(',')
    const normalizedMonth = input.month === 'all' ? 'all' : pad2(input.month)
    const normalizedDay = input.day === 'all' ? 'all' : pad2(input.day)
    const dateKey =
        input.mode === 'day'
            ? `${input.year}-${normalizedMonth}-${normalizedDay}`
            : input.mode === 'month'
                ? `${input.year}-${normalizedMonth}`
                : input.mode === 'year'
                    ? input.year
                    : 'all'
    const pageKey = typeof input.page === 'number' ? `:p${input.page}` : ''

    return `finance:v5:${input.surface}:${input.userId}:${visibleScope}:${input.scope}:${input.transactionType}:${input.mode}:${dateKey}${pageKey}`
}

export function getPaginationState(input: { received: number; pageSize: number; page: number }) {
    const hasMore = input.received >= input.pageSize
    return {
        page: input.page,
        hasMore,
        nextPage: input.page + 1,
    }
}
