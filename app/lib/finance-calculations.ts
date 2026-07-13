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

export type MonthlyFinanceInput = {
    month_start: string
    income_total?: number
    expenses_total?: number
    savings_from_income_total?: number
    savings_existing_money_total?: number
    savings_other_total?: number
    manual_withdrawals_total?: number
}

export type MonthlyFinanceRollup = Required<MonthlyFinanceInput> & {
    usable_income_total: number
    overspend_carried_in: number
    overspend_paid: number
    available_after_overspend: number
    income_used_for_expenses: number
    leftover_added: number
    leftover_used: number
    ending_leftover_balance: number
    overspend_created: number
    overspend_carried_out: number
    cumulative_savings_from_income_total: number
    cumulative_savings_existing_money_total: number
    cumulative_savings_other_total: number
    cumulative_manual_withdrawals_total: number
}

export type FinancePeriodSummary = Omit<MonthlyFinanceRollup, 'month_start'> & {
    ending_month_start: string | null
    context: 'period' | 'monthly'
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

function toCents(value: number | undefined) {
    return Math.max(0, Math.round(amount(value ?? 0) * 100))
}

function fromCents(value: number) {
    return value / 100
}

function normalizeMonthStart(value: string) {
    const match = /^(\d{4})-(\d{2})/.exec(value)
    if (!match) return null

    const month = Number(match[2])
    if (month < 1 || month > 12) return null
    return `${match[1]}-${match[2]}-01`
}

function nextMonthStart(value: string) {
    const year = Number(value.slice(0, 4))
    const month = Number(value.slice(5, 7))
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    return `${nextYear}-${pad2(nextMonth)}-01`
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

export function calculateMonthlyFinanceRollups(
    inputs: MonthlyFinanceInput[],
    throughMonth: string
): MonthlyFinanceRollup[] {
    const endCandidate = normalizeMonthStart(throughMonth)
    if (!endCandidate) return []

    const byMonth = new Map<string, Required<MonthlyFinanceInput>>()

    inputs.forEach((input) => {
        const monthStart = normalizeMonthStart(input.month_start)
        if (!monthStart) return

        const current = byMonth.get(monthStart) ?? {
            month_start: monthStart,
            income_total: 0,
            expenses_total: 0,
            savings_from_income_total: 0,
            savings_existing_money_total: 0,
            savings_other_total: 0,
            manual_withdrawals_total: 0,
        }

        byMonth.set(monthStart, {
            month_start: monthStart,
            income_total: fromCents(toCents(current.income_total) + toCents(input.income_total)),
            expenses_total: fromCents(toCents(current.expenses_total) + toCents(input.expenses_total)),
            savings_from_income_total: fromCents(
                toCents(current.savings_from_income_total) + toCents(input.savings_from_income_total)
            ),
            savings_existing_money_total: fromCents(
                toCents(current.savings_existing_money_total) + toCents(input.savings_existing_money_total)
            ),
            savings_other_total: fromCents(
                toCents(current.savings_other_total) + toCents(input.savings_other_total)
            ),
            manual_withdrawals_total: fromCents(
                toCents(current.manual_withdrawals_total) + toCents(input.manual_withdrawals_total)
            ),
        })
    })

    const inputMonths = Array.from(byMonth.keys()).sort()
    const startMonth = inputMonths[0] ?? endCandidate
    const endMonth = inputMonths.at(-1) && inputMonths.at(-1)! > endCandidate ? inputMonths.at(-1)! : endCandidate
    const rollups: MonthlyFinanceRollup[] = []
    let previousLeftover = 0
    let previousOverspend = 0
    let cumulativeSavingsFromIncome = 0
    let cumulativeSavingsExistingMoney = 0
    let cumulativeSavingsOther = 0
    let cumulativeManualWithdrawals = 0

    for (let monthStart = startMonth; monthStart <= endMonth; monthStart = nextMonthStart(monthStart)) {
        const input = byMonth.get(monthStart) ?? {
            month_start: monthStart,
            income_total: 0,
            expenses_total: 0,
            savings_from_income_total: 0,
            savings_existing_money_total: 0,
            savings_other_total: 0,
            manual_withdrawals_total: 0,
        }
        const incomeTotal = toCents(input.income_total)
        const expensesTotal = toCents(input.expenses_total)
        const savingsFromIncomeTotal = toCents(input.savings_from_income_total)
        const savingsExistingMoneyTotal = toCents(input.savings_existing_money_total)
        const savingsOtherTotal = toCents(input.savings_other_total)
        const manualWithdrawalsTotal = toCents(input.manual_withdrawals_total)
        const usableIncome = incomeTotal - savingsFromIncomeTotal
        let remainingIncome = Math.max(0, usableIncome)
        const negativeUsableDeficit = Math.max(0, -usableIncome)
        const overspendPaid = Math.min(remainingIncome, previousOverspend)
        remainingIncome -= overspendPaid
        const remainingOldOverspend = previousOverspend - overspendPaid
        const availableAfterOverspend = remainingIncome
        const incomeUsedForExpenses = Math.min(remainingIncome, expensesTotal)
        remainingIncome -= incomeUsedForExpenses
        const currentDeficit = negativeUsableDeficit + expensesTotal - incomeUsedForExpenses
        const leftoverUsed = Math.min(previousLeftover, currentDeficit)
        const overspendCreated = currentDeficit - leftoverUsed
        const leftoverAdded = remainingOldOverspend === 0 ? remainingIncome : 0
        const endingLeftover = Math.max(0, previousLeftover - leftoverUsed + leftoverAdded)
        const overspendOut = remainingOldOverspend + overspendCreated

        cumulativeSavingsFromIncome += savingsFromIncomeTotal
        cumulativeSavingsExistingMoney += savingsExistingMoneyTotal
        cumulativeSavingsOther += savingsOtherTotal
        cumulativeManualWithdrawals += manualWithdrawalsTotal

        rollups.push({
            month_start: monthStart,
            income_total: fromCents(incomeTotal),
            expenses_total: fromCents(expensesTotal),
            savings_from_income_total: fromCents(savingsFromIncomeTotal),
            savings_existing_money_total: fromCents(savingsExistingMoneyTotal),
            savings_other_total: fromCents(savingsOtherTotal),
            manual_withdrawals_total: fromCents(manualWithdrawalsTotal),
            usable_income_total: fromCents(usableIncome),
            overspend_carried_in: fromCents(previousOverspend),
            overspend_paid: fromCents(overspendPaid),
            available_after_overspend: fromCents(availableAfterOverspend),
            income_used_for_expenses: fromCents(incomeUsedForExpenses),
            leftover_added: fromCents(leftoverAdded),
            leftover_used: fromCents(leftoverUsed),
            ending_leftover_balance: fromCents(endingLeftover),
            overspend_created: fromCents(overspendCreated),
            overspend_carried_out: fromCents(overspendOut),
            cumulative_savings_from_income_total: fromCents(cumulativeSavingsFromIncome),
            cumulative_savings_existing_money_total: fromCents(cumulativeSavingsExistingMoney),
            cumulative_savings_other_total: fromCents(cumulativeSavingsOther),
            cumulative_manual_withdrawals_total: fromCents(cumulativeManualWithdrawals),
        })

        previousLeftover = endingLeftover
        previousOverspend = overspendOut
    }

    return rollups
}

export function summarizeFinancePeriod(
    rollups: MonthlyFinanceRollup[],
    filter: { mode: FinanceFilterMode; year: string; month: string }
): FinancePeriodSummary {
    const monthKey = `${filter.year}-${pad2(filter.month)}-01`
    const selected = rollups.filter((rollup) => {
        if (filter.mode === 'all') return true
        if (filter.mode === 'year') return rollup.month_start.startsWith(`${filter.year}-`)
        return rollup.month_start === monthKey
    })
    const first = selected[0]
    const last = selected.at(-1)
    const sum = (key: keyof MonthlyFinanceRollup) =>
        selected.reduce((total, rollup) => total + Number(rollup[key]), 0)

    return {
        ending_month_start: last?.month_start ?? null,
        context: filter.mode === 'day' ? 'monthly' : 'period',
        income_total: sum('income_total'),
        expenses_total: sum('expenses_total'),
        savings_from_income_total: sum('savings_from_income_total'),
        savings_existing_money_total: sum('savings_existing_money_total'),
        savings_other_total: sum('savings_other_total'),
        manual_withdrawals_total: sum('manual_withdrawals_total'),
        usable_income_total: sum('usable_income_total'),
        overspend_carried_in: first?.overspend_carried_in ?? 0,
        overspend_paid: sum('overspend_paid'),
        available_after_overspend: sum('available_after_overspend'),
        income_used_for_expenses: sum('income_used_for_expenses'),
        leftover_added: sum('leftover_added'),
        leftover_used: sum('leftover_used'),
        ending_leftover_balance: last?.ending_leftover_balance ?? 0,
        overspend_created: sum('overspend_created'),
        overspend_carried_out: last?.overspend_carried_out ?? 0,
        cumulative_savings_from_income_total: last?.cumulative_savings_from_income_total ?? 0,
        cumulative_savings_existing_money_total: last?.cumulative_savings_existing_money_total ?? 0,
        cumulative_savings_other_total: last?.cumulative_savings_other_total ?? 0,
        cumulative_manual_withdrawals_total: last?.cumulative_manual_withdrawals_total ?? 0,
    }
}

export function calculateTotalSavings(summary: FinancePeriodSummary) {
    return fromCents(
        Math.max(
            0,
            toCents(summary.cumulative_savings_from_income_total) +
                toCents(summary.cumulative_savings_existing_money_total) +
                toCents(summary.cumulative_savings_other_total) +
                toCents(summary.ending_leftover_balance) -
                toCents(summary.cumulative_manual_withdrawals_total)
        )
    )
}

export function calculateCashFlowDisplay(summary: FinancePeriodSummary) {
    if (summary.overspend_carried_out > 0) return -summary.overspend_carried_out
    return fromCents(Math.max(0, toCents(summary.leftover_added) - toCents(summary.leftover_used)))
}

export function shouldShowPersonalFinanceCards(
    surface: 'dashboard' | 'tracker',
    scope: FinanceScope
) {
    return surface === 'dashboard' || scope === 'personal'
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

    return `finance:v6:${input.surface}:${input.userId}:${visibleScope}:${input.scope}:${input.transactionType}:${input.mode}:${dateKey}${pageKey}`
}

export function getPaginationState(input: { received: number; pageSize: number; page: number }) {
    const hasMore = input.received >= input.pageSize
    return {
        page: input.page,
        hasMore,
        nextPage: input.page + 1,
    }
}
