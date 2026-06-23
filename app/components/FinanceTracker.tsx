'use client'

import {
    buildFinanceDateRange,
    calculateFinanceTotals,
    calculateSavingsAccountBalances,
    calculateSavingsBalance,
    createFinanceCacheKey,
    getPaginationState,
    getAvailableBalanceForWithdrawal,
    type FinanceFilterMode,
    type FinanceScope,
    type FinanceTransactionType,
    type SavingsAction,
    type SavingsSource,
} from '@/app/lib/finance-calculations'
import { supabaseBrowser } from '@/app/lib/supabase-browser'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from './AppShell'

type TransactionKind = 'expense' | 'income' | 'savings'
type FinanceSurface = 'dashboard' | 'tracker'

type CategoryRow = {
    id: string
    name: string
}

type ExpenseRow = {
    id: string
    user_id: string
    amount: number
    category: string | null
    category_id: string | null
    description: string | null
    spent_at: string
    created_at: string | null
    is_dating: boolean | null
    is_for_partner: boolean | null
}

type IncomeRow = {
    id: string
    user_id: string
    amount: number
    category: string | null
    category_id: string | null
    description: string | null
    received_at: string
    created_at: string | null
}

type SavingsAccountRow = {
    id: string
    user_id: string
    name: string
    target_amount: number | null
    created_at: string | null
}

type SavingsTransactionRow = {
    id: string
    user_id: string
    account_id: string | null
    account_name: string
    amount: number
    type: SavingsAction
    source: SavingsSource
    description: string | null
    saved_at: string
    created_at: string | null
}

type ExpenseLimitRow = {
    id: string
    user_id: string
    category_id: string
    category_name: string
    monthly_limit: number
    is_active: boolean
}

type VisibleProfile = {
    user_id: string
    display_name: string | null
    relation: 'me' | 'partner'
}

type AvailableMonth = {
    year: number
    month: number
}

type UnifiedTransaction = {
    id: string
    kind: TransactionKind
    title: string
    description: string | null
    date: string
    amount: number
    created_at: string | null
    source: ExpenseRow | IncomeRow | SavingsTransactionRow
}

type FormState = {
    amount: string
    category: string
    newCategory: string
    description: string
    date: string
    isDating: boolean
    isForPartner: boolean
    savingsType: SavingsAction
    savingsSource: SavingsSource
    accountId: string
    newAccount: string
}

type FinanceSnapshot = {
    savedAt: number
    visibleProfiles: VisibleProfile[]
    availableMonths: AvailableMonth[]
    availableDays: number[]
    expenseCategories: CategoryRow[]
    incomeCategories: CategoryRow[]
    savingsAccounts: SavingsAccountRow[]
    expenseLimits: ExpenseLimitRow[]
    expenseRows: ExpenseRow[]
    incomeRows: IncomeRow[]
    savingsRows: SavingsTransactionRow[]
    allSavingsRows: SavingsTransactionRow[]
    savingsAccountBalances: Record<string, number>
    totalSavingsBalance: number
}

type DateSourceRow = {
    spent_at?: unknown
    received_at?: unknown
    saved_at?: unknown
}

type CategoryDbRow = {
    id: unknown
    name: unknown
}

type SavingsAccountDbRow = {
    id: unknown
    user_id: unknown
    name: unknown
    target_amount: unknown
    created_at: unknown
}

type ExpenseLimitDbRow = {
    id: unknown
    user_id: unknown
    category_id: unknown
    monthly_limit: unknown
    is_active: unknown
    expense_categories: unknown
}

type ExpenseDbRow = {
    id: unknown
    user_id: unknown
    amount: unknown
    category: unknown
    category_id: unknown
    description: unknown
    spent_at: unknown
    created_at: unknown
    is_dating: unknown
    is_for_partner: unknown
}

type IncomeDbRow = {
    id: unknown
    user_id: unknown
    amount: unknown
    category: unknown
    category_id: unknown
    description: unknown
    received_at: unknown
    created_at: unknown
}

type SavingsTransactionDbRow = {
    id: unknown
    user_id: unknown
    account_id: unknown
    amount: unknown
    type: unknown
    source: unknown
    description: unknown
    saved_at: unknown
    created_at: unknown
    savings_accounts?: unknown
}

type VisibleProfileDbRow = {
    user_id: unknown
    display_name: unknown
    relation: unknown
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CACHE_TTL_MS = 1000 * 60 * 5
const MAX_MONTH_SOURCE_ROWS = 750
const HISTORY_PAGE_SIZE = 10

const DEFAULT_EXPENSE_CATEGORIES = ['Food', 'Transport', 'Entertainment', 'Shopping', 'Bills', 'Dating', 'Others']
const DEFAULT_INCOME_CATEGORIES = ['Salary', 'Freelance', 'Business', 'Bonus', 'Other']
const DEFAULT_SAVINGS_ACCOUNTS = ['Emergency Fund', 'House Fund', 'Car Fund', 'Investment Fund', 'General Savings']
const SAVINGS_SOURCE_OPTIONS: Array<{ value: SavingsSource; label: string }> = [
    { value: 'monthly_income', label: 'Monthly Income' },
    { value: 'existing_money', label: 'Existing Money' },
    { value: 'other', label: 'Other' },
]

function pad2(n: number) {
    return String(n).padStart(2, '0')
}

function toISODate(date: Date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

function normalizeName(value: string) {
    return value.trim().replace(/\s+/g, ' ')
}

function toNumber(value: unknown) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
}

function monthLabel(year: string, month: string) {
    return `${MONTHS[Number(month) - 1]} ${year}`
}

function money(value: number) {
    return value.toLocaleString('en-MY', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}

function signedMoney(value: number) {
    const sign = value > 0 ? '+' : value < 0 ? '-' : ''
    return `${sign}RM ${money(Math.abs(value))}`
}

function mergeNames(base: string[], rows: CategoryRow[]) {
    const names = rows.map((row) => normalizeName(row.name)).filter(Boolean)
    return Array.from(new Set([...names, ...base]))
}

function normalizeSavingsSource(value: unknown): SavingsSource {
    return value === 'existing_money' || value === 'other' ? value : 'monthly_income'
}

function savingsSourceLabel(source: SavingsSource) {
    return SAVINGS_SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? 'Monthly Income'
}

function colorForName(name: string) {
    let hash = 0
    for (let index = 0; index < name.length; index += 1) {
        hash = (hash << 5) - hash + name.charCodeAt(index)
        hash |= 0
    }

    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 78%, 67%)`
}

function cacheKey(input: {
    userId: string
    visibleUserIds: string[]
    surface: FinanceSurface
    scope: FinanceScope
    mode: FinanceFilterMode
    year: string
    month: string
    day: string
    transactionType?: FinanceTransactionType
    page?: number
}) {
    return createFinanceCacheKey({
        userId: input.userId,
        visibleUserIds: input.visibleUserIds,
        surface: input.surface,
        scope: input.scope,
        mode: input.mode,
        year: input.year,
        month: input.month,
        day: input.day,
        transactionType: input.transactionType ?? 'all',
        page: input.page,
    })
}

function readSnapshot(input: Parameters<typeof cacheKey>[0]) {
    if (typeof window === 'undefined') return null

    try {
        const raw = window.localStorage.getItem(cacheKey(input))
        if (!raw) return null

        const parsed = JSON.parse(raw) as FinanceSnapshot
        if (!parsed || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null
        return parsed
    } catch {
        return null
    }
}

function writeSnapshot(input: Parameters<typeof cacheKey>[0], snapshot: Omit<FinanceSnapshot, 'savedAt'>) {
    if (typeof window === 'undefined') return

    try {
        window.localStorage.setItem(
            cacheKey(input),
            JSON.stringify({
                ...snapshot,
                savedAt: Date.now(),
            })
        )
    } catch {
        // localStorage is a speed-up only. The database remains the source of truth.
    }
}

function getRelatedAccountName(value: unknown) {
    if (!value || typeof value !== 'object') return null
    if (Array.isArray(value)) {
        const first = value[0]
        return first && typeof first === 'object' && 'name' in first ? String(first.name ?? '') : null
    }

    return 'name' in value ? String(value.name ?? '') : null
}

function initialFormState(date: string): FormState {
    return {
        amount: '',
        category: '',
        newCategory: '',
        description: '',
        date,
        isDating: false,
        isForPartner: false,
        savingsType: 'deposit',
        savingsSource: 'monthly_income',
        accountId: '',
        newAccount: '',
    }
}

function SmallSelect({
    label,
    value,
    onChange,
    children,
    disabled,
}: {
    label?: string
    value: string
    onChange: (value: string) => void
    children: React.ReactNode
    disabled?: boolean
}) {
    return (
        <label className="block min-w-0">
            {label ? (
                <span className="mb-1 block px-1 text-[10px] font-black uppercase tracking-widest text-stone-400">
                    {label}
                </span>
            ) : null}
            <select
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={disabled}
                className="w-full rounded-2xl border border-stone-100 bg-white px-4 py-3 text-sm font-black text-stone-700 shadow-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-100 disabled:opacity-50"
            >
                {children}
            </select>
        </label>
    )
}

function SmallInput({
    label,
    value,
    onChange,
    placeholder,
    type = 'text',
    inputMode,
}: {
    label?: string
    value: string
    onChange: (value: string) => void
    placeholder?: string
    type?: string
    inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
}) {
    return (
        <label className="block min-w-0">
            {label ? (
                <span className="mb-1 block px-1 text-[10px] font-black uppercase tracking-widest text-stone-400">
                    {label}
                </span>
            ) : null}
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
                type={type}
                inputMode={inputMode}
                className="w-full rounded-2xl border-2 border-stone-100 bg-white px-4 py-3 text-sm font-bold text-stone-700 shadow-sm outline-none transition placeholder:text-stone-300 focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
            />
        </label>
    )
}

function TypeButton({
    active,
    label,
    tone,
    onClick,
    disabled,
}: {
    active: boolean
    label: string
    tone: 'rose' | 'emerald' | 'sky'
    onClick: () => void
    disabled?: boolean
}) {
    const activeClass =
        tone === 'rose'
            ? 'bg-rose-400 text-white shadow-rose-100'
            : tone === 'emerald'
                ? 'bg-emerald-400 text-white shadow-emerald-100'
                : 'bg-sky-400 text-white shadow-sky-100'

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`rounded-2xl px-4 py-3 text-sm font-black shadow-sm transition active:scale-95 disabled:opacity-50 ${active ? activeClass : 'bg-white text-stone-500'
                }`}
        >
            {label}
        </button>
    )
}

function SummaryCard({
    label,
    value,
    hint,
    tone,
}: {
    label: string
    value: string
    hint: string
    tone: 'rose' | 'emerald' | 'amber' | 'sky' | 'stone'
}) {
    const toneClass =
        tone === 'rose'
            ? 'from-rose-100 to-pink-50 text-rose-700'
            : tone === 'emerald'
                ? 'from-emerald-100 to-teal-50 text-emerald-700'
                : tone === 'amber'
                    ? 'from-amber-100 to-orange-50 text-amber-800'
                    : tone === 'sky'
                        ? 'from-sky-100 to-cyan-50 text-sky-700'
                        : 'from-stone-100 to-white text-stone-700'

    return (
        <div className={`rounded-[1.75rem] bg-gradient-to-br p-4 shadow-sm ${toneClass}`}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{label}</p>
            <p className="mt-2 break-words text-2xl font-black leading-tight">{value}</p>
            <p className="mt-1 text-xs font-bold opacity-70">{hint}</p>
        </div>
    )
}

export default function FinanceTracker({ surface = 'tracker' }: { surface?: FinanceSurface }) {
    const supabase = supabaseBrowser()
    const now = useMemo(() => new Date(), [])
    const isDashboard = surface === 'dashboard'

    const [userId, setUserId] = useState<string | null>(null)
    const [userName, setUserName] = useState('User')
    const [filterMode, setFilterMode] = useState<FinanceFilterMode>(isDashboard ? 'month' : 'month')
    const [dataScope, setDataScope] = useState<FinanceScope>('personal')
    const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()))
    const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1))
    const [selectedDay, setSelectedDay] = useState(String(now.getDate()))

    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [usedCache, setUsedCache] = useState(false)

    const [availableMonths, setAvailableMonths] = useState<AvailableMonth[]>([
        { year: now.getFullYear(), month: now.getMonth() + 1 },
    ])
    const [availableDays, setAvailableDays] = useState<number[]>([now.getDate()])
    const [visibleProfiles, setVisibleProfiles] = useState<VisibleProfile[]>([])
    const [expenseCategories, setExpenseCategories] = useState<CategoryRow[]>([])
    const [incomeCategories, setIncomeCategories] = useState<CategoryRow[]>([])
    const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccountRow[]>([])
    const [expenseLimits, setExpenseLimits] = useState<ExpenseLimitRow[]>([])
    const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([])
    const [incomeRows, setIncomeRows] = useState<IncomeRow[]>([])
    const [savingsRows, setSavingsRows] = useState<SavingsTransactionRow[]>([])
    const [allSavingsRows, setAllSavingsRows] = useState<SavingsTransactionRow[]>([])
    const [savingsAccountBalances, setSavingsAccountBalances] = useState<Record<string, number>>({})
    const [totalSavingsBalance, setTotalSavingsBalance] = useState(0)

    const [formOpen, setFormOpen] = useState(false)
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
    const [formType, setFormType] = useState<TransactionKind>('expense')
    const [editingTarget, setEditingTarget] = useState<UnifiedTransaction | null>(null)
    const [form, setForm] = useState<FormState>(() => initialFormState(toISODate(now)))

    const [deleteTarget, setDeleteTarget] = useState<UnifiedTransaction | null>(null)

    const [budgetOpen, setBudgetOpen] = useState(false)
    const [budgetCategory, setBudgetCategory] = useState('')
    const [budgetNewCategory, setBudgetNewCategory] = useState('')
    const [budgetAmount, setBudgetAmount] = useState('')
    const [historyFilter, setHistoryFilter] = useState<'all' | TransactionKind>('all')
    const [historyRows, setHistoryRows] = useState<UnifiedTransaction[]>([])
    const [historyPage, setHistoryPage] = useState(0)
    const [historyHasMore, setHistoryHasMore] = useState(false)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [historyLoadingMore, setHistoryLoadingMore] = useState(false)

    const loadSeqRef = useRef(0)
    const historyLoadSeqRef = useRef(0)
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const loadMoreRef = useRef<HTMLDivElement | null>(null)

    const expenseCategoryOptions = useMemo(
        () => mergeNames(DEFAULT_EXPENSE_CATEGORIES, expenseCategories),
        [expenseCategories]
    )
    const incomeCategoryOptions = useMemo(
        () => mergeNames(DEFAULT_INCOME_CATEGORIES, incomeCategories),
        [incomeCategories]
    )
    const accountOptions = useMemo(() => {
        const names = savingsAccounts.map((account) => normalizeName(account.name)).filter(Boolean)
        return Array.from(new Set([...names, ...DEFAULT_SAVINGS_ACCOUNTS]))
    }, [savingsAccounts])

    const applySnapshot = useCallback((snapshot: Omit<FinanceSnapshot, 'savedAt'>) => {
        setVisibleProfiles(snapshot.visibleProfiles)
        setAvailableMonths(snapshot.availableMonths)
        setAvailableDays(snapshot.availableDays)
        setExpenseCategories(snapshot.expenseCategories)
        setIncomeCategories(snapshot.incomeCategories)
        setSavingsAccounts(snapshot.savingsAccounts)
        setExpenseLimits(snapshot.expenseLimits)
        setExpenseRows(snapshot.expenseRows)
        setIncomeRows(snapshot.incomeRows)
        setSavingsRows(snapshot.savingsRows)
        setAllSavingsRows(snapshot.allSavingsRows)
        setSavingsAccountBalances(snapshot.savingsAccountBalances)
        setTotalSavingsBalance(snapshot.totalSavingsBalance)
    }, [])

    const getScopedUserIds = useCallback(
        (profiles: VisibleProfile[], scope: FinanceScope) => {
            if (!userId) return []
            if (scope === 'personal') return [userId]

            const partnerIds = profiles
                .filter((profile) => profile.relation === 'partner' && profile.user_id !== userId)
                .map((profile) => profile.user_id)

            if (scope === 'partner') return partnerIds
            return Array.from(new Set([userId, ...partnerIds])).filter(Boolean)
        },
        [userId]
    )

    const getExpenseOwner = useCallback(
        (ownerUserId: string) => {
            const owner = visibleProfiles.find((profile) => profile.user_id === ownerUserId)
            if (!owner) return { name: 'Partner', relation: 'partner' as const }
            if (owner.relation === 'me') return { name: owner.display_name || 'Me', relation: 'me' as const }
            return { name: owner.display_name || 'Partner', relation: 'partner' as const }
        },
        [visibleProfiles]
    )

    const loadVisibleProfiles = useCallback(async () => {
        const { data, error } = await supabase.rpc('finance_visible_profiles')
        if (error) {
            return [{ user_id: userId ?? '', display_name: userName, relation: 'me' as const }].filter(
                (profile) => profile.user_id
            )
        }

        const profiles = ((data ?? []) as VisibleProfileDbRow[])
            .map((row) => ({
                user_id: String(row.user_id),
                display_name: row.display_name ? String(row.display_name) : null,
                relation: row.relation === 'me' ? ('me' as const) : ('partner' as const),
            }))
            .filter((profile) => profile.user_id)

        if (profiles.length > 0) return profiles
        return [{ user_id: userId ?? '', display_name: userName, relation: 'me' as const }].filter(
            (profile) => profile.user_id
        )
    }, [supabase, userId, userName])

    const loadFinanceData = useCallback(
        async (options?: { force?: boolean }) => {
            if (!userId) return

            const seq = ++loadSeqRef.current
            const loadedProfiles = await loadVisibleProfiles()
            const visibleUserIds = Array.from(new Set([userId, ...loadedProfiles.map((profile) => profile.user_id)])).filter(Boolean)
            const activeScope: FinanceScope = isDashboard ? 'personal' : dataScope
            const scopedUserIds = getScopedUserIds(loadedProfiles, activeScope)
            const activeRange = buildFinanceDateRange({
                mode: isDashboard ? 'month' : filterMode,
                year: selectedYear,
                month: selectedMonth,
                day: selectedDay,
            })
            const cacheInput = {
                userId,
                visibleUserIds,
                surface,
                scope: activeScope,
                mode: isDashboard ? ('month' as const) : filterMode,
                year: selectedYear,
                month: selectedMonth,
                day: selectedDay,
            }
            const shouldUseCache = !options?.force
            const cached = shouldUseCache ? readSnapshot(cacheInput) : null

            if (cached) {
                applySnapshot(cached)
                setUsedCache(true)
                setLoading(false)
                setRefreshing(true)
            } else {
                setRefreshing(!loading)
                if (loading) setErrorMsg(null)
            }

            const applyRange = <T extends { gte: (column: string, value: string) => T; lt: (column: string, value: string) => T }>(
                query: T,
                column: string
            ) => {
                if (activeRange.startISO && activeRange.endISO) {
                    return query.gte(column, activeRange.startISO).lt(column, activeRange.endISO)
                }
                return query
            }

            try {
                const emptyRows = Promise.resolve({ data: [], error: null })
                const [
                    expenseMonthsRes,
                    incomeMonthsRes,
                    savingsMonthsRes,
                    expenseCategoriesRes,
                    incomeCategoriesRes,
                    savingsAccountsRes,
                    expenseLimitsRes,
                    expenseRowsRes,
                    incomeRowsRes,
                    savingsRowsRes,
                    savingsAllRowsRes,
                ] = await Promise.all([
                    scopedUserIds.length > 0
                        ? supabase
                            .from('expenses')
                            .select('spent_at')
                            .in('user_id', scopedUserIds)
                            .order('spent_at', { ascending: false })
                            .limit(MAX_MONTH_SOURCE_ROWS)
                        : emptyRows,
                    supabase
                        .from('incomes')
                        .select('received_at')
                        .eq('user_id', userId)
                        .order('received_at', { ascending: false })
                        .limit(MAX_MONTH_SOURCE_ROWS),
                    supabase
                        .from('savings_transactions')
                        .select('saved_at')
                        .eq('user_id', userId)
                        .order('saved_at', { ascending: false })
                        .limit(MAX_MONTH_SOURCE_ROWS),
                    supabase
                        .from('expense_categories')
                        .select('id, name')
                        .or(`user_id.is.null,user_id.eq.${userId}`)
                        .order('name', { ascending: true }),
                    supabase
                        .from('income_categories')
                        .select('id, name')
                        .eq('user_id', userId)
                        .order('name', { ascending: true }),
                    supabase
                        .from('savings_accounts')
                        .select('id, user_id, name, target_amount, created_at')
                        .eq('user_id', userId)
                        .order('name', { ascending: true }),
                    supabase
                        .from('expense_category_limits')
                        .select('id, user_id, category_id, monthly_limit, is_active, expense_categories(id, name)')
                        .eq('user_id', userId)
                        .eq('is_active', true),
                    scopedUserIds.length > 0
                        ? applyRange(
                            supabase
                                .from('expenses')
                                .select('id, user_id, amount, category, category_id, description, spent_at, created_at, is_dating, is_for_partner')
                                .in('user_id', scopedUserIds),
                            'spent_at'
                        )
                            .order('spent_at', { ascending: false })
                            .order('created_at', { ascending: false })
                        : emptyRows,
                    activeScope === 'personal'
                        ? applyRange(
                            supabase
                                .from('incomes')
                                .select('id, user_id, amount, category, category_id, description, received_at, created_at')
                                .eq('user_id', userId),
                            'received_at'
                        )
                            .order('received_at', { ascending: false })
                            .order('created_at', { ascending: false })
                        : emptyRows,
                    activeScope === 'personal'
                        ? applyRange(
                            supabase
                                .from('savings_transactions')
                                .select('id, user_id, account_id, amount, type, source, description, saved_at, created_at, savings_accounts(name)')
                                .eq('user_id', userId),
                            'saved_at'
                        )
                            .order('saved_at', { ascending: false })
                            .order('created_at', { ascending: false })
                        : emptyRows,
                    supabase
                        .from('savings_transactions')
                        .select('id, user_id, account_id, amount, type, source, description, saved_at, created_at, savings_accounts(name)')
                        .eq('user_id', userId),
                ])

                const firstError = [
                    expenseMonthsRes.error,
                    incomeMonthsRes.error,
                    savingsMonthsRes.error,
                    expenseCategoriesRes.error,
                    incomeCategoriesRes.error,
                    savingsAccountsRes.error,
                    expenseLimitsRes.error,
                    expenseRowsRes.error,
                    incomeRowsRes.error,
                    savingsRowsRes.error,
                    savingsAllRowsRes.error,
                ].find(Boolean)

                if (firstError) throw firstError

                const monthMap = new Map<string, AvailableMonth>()
                const addMonth = (date: unknown) => {
                    if (!date) return
                    const [yearPart, monthPart] = String(date).slice(0, 10).split('-')
                    const year = Number(yearPart)
                    const month = Number(monthPart)
                    if (!Number.isFinite(year) || !Number.isFinite(month)) return
                    monthMap.set(`${year}-${month}`, { year, month })
                }

                monthMap.set(`${now.getFullYear()}-${now.getMonth() + 1}`, {
                    year: now.getFullYear(),
                    month: now.getMonth() + 1,
                })

                const expenseMonthRows = (expenseMonthsRes.data ?? []) as DateSourceRow[]
                const incomeMonthRows = (incomeMonthsRes.data ?? []) as DateSourceRow[]
                const savingsMonthRows = (savingsMonthsRes.data ?? []) as DateSourceRow[]
                const expenseCategoryRows = (expenseCategoriesRes.data ?? []) as CategoryDbRow[]
                const incomeCategoryRows = (incomeCategoriesRes.data ?? []) as CategoryDbRow[]
                const savingsAccountRows = (savingsAccountsRes.data ?? []) as SavingsAccountDbRow[]
                const expenseLimitRows = (expenseLimitsRes.data ?? []) as ExpenseLimitDbRow[]
                const monthlyExpenseRows = (expenseRowsRes.data ?? []) as ExpenseDbRow[]
                const monthlyIncomeRows = (incomeRowsRes.data ?? []) as IncomeDbRow[]
                const monthlySavingsRows = (savingsRowsRes.data ?? []) as SavingsTransactionDbRow[]
                const allSavingsTransactionRows = (savingsAllRowsRes.data ?? []) as SavingsTransactionDbRow[]

                expenseMonthRows.forEach((row) => addMonth(row.spent_at))
                incomeMonthRows.forEach((row) => addMonth(row.received_at))
                savingsMonthRows.forEach((row) => addMonth(row.saved_at))

                const daySet = new Set<number>()
                const addAvailableDay = (date: unknown) => {
                    if (!date) return
                    const [yearPart, monthPart] = String(date).slice(0, 10).split('-')
                    if (yearPart !== selectedYear || Number(monthPart) !== Number(selectedMonth)) return
                    const day = Number(String(date).slice(8, 10))
                    if (Number.isFinite(day)) daySet.add(day)
                }
                expenseMonthRows.forEach((row) => addAvailableDay(row.spent_at))
                incomeMonthRows.forEach((row) => addAvailableDay(row.received_at))
                savingsMonthRows.forEach((row) => addAvailableDay(row.saved_at))

                const mappedAllSavingsRows = allSavingsTransactionRows.map((row) => ({
                    id: String(row.id),
                    user_id: String(row.user_id),
                    account_id: row.account_id ? String(row.account_id) : null,
                    account_name: getRelatedAccountName(row.savings_accounts) || 'General Savings',
                    amount: toNumber(row.amount),
                    type: row.type === 'withdrawal' ? ('withdrawal' as const) : ('deposit' as const),
                    source: normalizeSavingsSource(row.source),
                    description: row.description ? String(row.description) : null,
                    saved_at: String(row.saved_at),
                    created_at: row.created_at ? String(row.created_at) : null,
                }))
                const savingsBalance = calculateSavingsBalance(mappedAllSavingsRows, { userId })
                const accountBalances = calculateSavingsAccountBalances(mappedAllSavingsRows, userId)

                const nextSnapshot: Omit<FinanceSnapshot, 'savedAt'> = {
                    visibleProfiles: loadedProfiles,
                    availableMonths: Array.from(monthMap.values()).sort((a, b) =>
                        a.year === b.year ? b.month - a.month : b.year - a.year
                    ),
                    availableDays: Array.from(daySet).sort((a, b) => a - b),
                    expenseCategories: expenseCategoryRows.map((row) => ({
                        id: String(row.id),
                        name: String(row.name),
                    })),
                    incomeCategories: incomeCategoryRows.map((row) => ({
                        id: String(row.id),
                        name: String(row.name),
                    })),
                    savingsAccounts: savingsAccountRows.map((row) => ({
                        id: String(row.id),
                        user_id: String(row.user_id),
                        name: String(row.name),
                        target_amount: row.target_amount === null ? null : toNumber(row.target_amount),
                        created_at: row.created_at ? String(row.created_at) : null,
                    })),
                    expenseLimits: expenseLimitRows.map((row) => ({
                        id: String(row.id),
                        user_id: String(row.user_id),
                        category_id: String(row.category_id),
                        category_name: getRelatedAccountName(row.expense_categories) || 'Category',
                        monthly_limit: toNumber(row.monthly_limit),
                        is_active: Boolean(row.is_active),
                    })),
                    expenseRows: monthlyExpenseRows.map((row) => ({
                        id: String(row.id),
                        user_id: String(row.user_id),
                        amount: toNumber(row.amount),
                        category: row.category ? String(row.category) : null,
                        category_id: row.category_id ? String(row.category_id) : null,
                        description: row.description ? String(row.description) : null,
                        spent_at: String(row.spent_at),
                        created_at: row.created_at ? String(row.created_at) : null,
                        is_dating: row.is_dating === null ? null : Boolean(row.is_dating),
                        is_for_partner: row.is_for_partner === null ? null : Boolean(row.is_for_partner),
                    })),
                    incomeRows: monthlyIncomeRows.map((row) => ({
                        id: String(row.id),
                        user_id: String(row.user_id),
                        amount: toNumber(row.amount),
                        category: row.category ? String(row.category) : null,
                        category_id: row.category_id ? String(row.category_id) : null,
                        description: row.description ? String(row.description) : null,
                        received_at: String(row.received_at),
                        created_at: row.created_at ? String(row.created_at) : null,
                    })),
                    savingsRows: monthlySavingsRows.map((row) => ({
                        id: String(row.id),
                        user_id: String(row.user_id),
                        account_id: row.account_id ? String(row.account_id) : null,
                        account_name: getRelatedAccountName(row.savings_accounts) || 'General Savings',
                        amount: toNumber(row.amount),
                        type: row.type === 'withdrawal' ? 'withdrawal' : 'deposit',
                        source: normalizeSavingsSource(row.source),
                        description: row.description ? String(row.description) : null,
                        saved_at: String(row.saved_at),
                        created_at: row.created_at ? String(row.created_at) : null,
                    })),
                    allSavingsRows: mappedAllSavingsRows,
                    savingsAccountBalances: accountBalances,
                    totalSavingsBalance: savingsBalance,
                }

                if (seq !== loadSeqRef.current) return

                applySnapshot(nextSnapshot)
                writeSnapshot(cacheInput, nextSnapshot)
                setUsedCache(false)
                setErrorMsg(null)
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unable to load finance data.'
                setErrorMsg(message)
            } finally {
                if (seq === loadSeqRef.current) {
                    setLoading(false)
                    setRefreshing(false)
                }
            }
        },
        [
            applySnapshot,
            dataScope,
            filterMode,
            getScopedUserIds,
            isDashboard,
            loadVisibleProfiles,
            loading,
            now,
            selectedDay,
            selectedMonth,
            selectedYear,
            supabase,
            surface,
            userId,
        ]
    )

    useEffect(() => {
        const loadUser = async () => {
            try {
                const { data: userRes, error } = await supabase.auth.getUser()
                if (error || !userRes.user) {
                    setErrorMsg('Not logged in.')
                    setLoading(false)
                    return
                }

                setUserId(userRes.user.id)
                setUserName(userRes.user.user_metadata?.display_name ?? userRes.user.email?.split('@')[0] ?? 'User')
            } catch (error) {
                setErrorMsg(error instanceof Error ? error.message : 'Unable to load user.')
                setLoading(false)
            }
        }

        loadUser()
    }, [supabase])

    useEffect(() => {
        if (!userId) return
        loadFinanceData()
    }, [loadFinanceData, userId])

    const loadHistoryPage = useCallback(
        async (pageIndex: number) => {
            if (!userId) return

            const seq = ++historyLoadSeqRef.current
            const isFirstPage = pageIndex === 0
            if (isFirstPage) setHistoryLoading(true)
            else setHistoryLoadingMore(true)

            try {
                const loadedProfiles = visibleProfiles.length > 0 ? visibleProfiles : await loadVisibleProfiles()
                const visibleUserIds = Array.from(new Set([userId, ...loadedProfiles.map((profile) => profile.user_id)])).filter(Boolean)
                const activeScope: FinanceScope = isDashboard ? 'personal' : dataScope
                const scopedUserIds = getScopedUserIds(loadedProfiles, activeScope)
                const range = buildFinanceDateRange({
                    mode: isDashboard ? 'month' : filterMode,
                    year: selectedYear,
                    month: selectedMonth,
                    day: selectedDay,
                })
                const cumulativeLimit = (pageIndex + 1) * HISTORY_PAGE_SIZE
                const queryType = historyFilter as FinanceTransactionType

                const historyCacheKey = cacheKey({
                    userId,
                    visibleUserIds,
                    surface,
                    scope: activeScope,
                    mode: isDashboard ? 'month' : filterMode,
                    year: selectedYear,
                    month: selectedMonth,
                    day: selectedDay,
                    transactionType: queryType,
                    page: pageIndex,
                })

                if (typeof window !== 'undefined' && isFirstPage) {
                    window.localStorage.removeItem(historyCacheKey)
                }

                const applyDateRange = <T extends { gte: (column: string, value: string) => T; lt: (column: string, value: string) => T }>(
                    query: T,
                    column: string
                ) => {
                    if (range.startISO && range.endISO) return query.gte(column, range.startISO).lt(column, range.endISO)
                    return query
                }

                const emptyRows = Promise.resolve({ data: [], error: null })
                const shouldLoadExpenses = queryType === 'all' || queryType === 'expense'
                const shouldLoadIncome = activeScope === 'personal' && (queryType === 'all' || queryType === 'income')
                const shouldLoadSavings = activeScope === 'personal' && (queryType === 'all' || queryType === 'savings')

                const [expenseRes, incomeRes, savingsRes] = await Promise.all([
                    shouldLoadExpenses && scopedUserIds.length > 0
                        ? applyDateRange(
                            supabase
                                .from('expenses')
                                .select('id, user_id, amount, category, category_id, description, spent_at, created_at, is_dating, is_for_partner')
                                .in('user_id', scopedUserIds),
                            'spent_at'
                        )
                            .order('spent_at', { ascending: false })
                            .order('created_at', { ascending: false })
                            .range(0, cumulativeLimit - 1)
                        : emptyRows,
                    shouldLoadIncome
                        ? applyDateRange(
                            supabase
                                .from('incomes')
                                .select('id, user_id, amount, category, category_id, description, received_at, created_at')
                                .eq('user_id', userId),
                            'received_at'
                        )
                            .order('received_at', { ascending: false })
                            .order('created_at', { ascending: false })
                            .range(0, cumulativeLimit - 1)
                        : emptyRows,
                    shouldLoadSavings
                        ? applyDateRange(
                            supabase
                                .from('savings_transactions')
                                .select('id, user_id, account_id, amount, type, source, description, saved_at, created_at, savings_accounts(name)')
                                .eq('user_id', userId),
                            'saved_at'
                        )
                            .order('saved_at', { ascending: false })
                            .order('created_at', { ascending: false })
                            .range(0, cumulativeLimit - 1)
                        : emptyRows,
                ])

                const firstError = [expenseRes.error, incomeRes.error, savingsRes.error].find(Boolean)
                if (firstError) throw firstError

                const expenses = ((expenseRes.data ?? []) as ExpenseDbRow[]).map((row) => ({
                    id: String(row.id),
                    kind: 'expense' as const,
                    title: row.category ? String(row.category) : 'Expense',
                    description: row.description ? String(row.description) : null,
                    date: String(row.spent_at),
                    amount: -toNumber(row.amount),
                    created_at: row.created_at ? String(row.created_at) : null,
                    source: {
                        id: String(row.id),
                        user_id: String(row.user_id),
                        amount: toNumber(row.amount),
                        category: row.category ? String(row.category) : null,
                        category_id: row.category_id ? String(row.category_id) : null,
                        description: row.description ? String(row.description) : null,
                        spent_at: String(row.spent_at),
                        created_at: row.created_at ? String(row.created_at) : null,
                        is_dating: row.is_dating === null ? null : Boolean(row.is_dating),
                        is_for_partner: row.is_for_partner === null ? null : Boolean(row.is_for_partner),
                    },
                }))

                const incomes = ((incomeRes.data ?? []) as IncomeDbRow[]).map((row) => ({
                    id: String(row.id),
                    kind: 'income' as const,
                    title: row.category ? String(row.category) : 'Income',
                    description: row.description ? String(row.description) : null,
                    date: String(row.received_at),
                    amount: toNumber(row.amount),
                    created_at: row.created_at ? String(row.created_at) : null,
                    source: {
                        id: String(row.id),
                        user_id: String(row.user_id),
                        amount: toNumber(row.amount),
                        category: row.category ? String(row.category) : null,
                        category_id: row.category_id ? String(row.category_id) : null,
                        description: row.description ? String(row.description) : null,
                        received_at: String(row.received_at),
                        created_at: row.created_at ? String(row.created_at) : null,
                    },
                }))

                const savings = ((savingsRes.data ?? []) as SavingsTransactionDbRow[]).map((row) => ({
                    id: String(row.id),
                    kind: 'savings' as const,
                    title: getRelatedAccountName(row.savings_accounts) || 'General Savings',
                    description: row.description ? String(row.description) : null,
                    date: String(row.saved_at),
                    amount: row.type === 'withdrawal' ? -toNumber(row.amount) : toNumber(row.amount),
                    created_at: row.created_at ? String(row.created_at) : null,
                    source: {
                        id: String(row.id),
                        user_id: String(row.user_id),
                        account_id: row.account_id ? String(row.account_id) : null,
                        account_name: getRelatedAccountName(row.savings_accounts) || 'General Savings',
                        amount: toNumber(row.amount),
                        type: row.type === 'withdrawal' ? ('withdrawal' as const) : ('deposit' as const),
                        source: normalizeSavingsSource(row.source),
                        description: row.description ? String(row.description) : null,
                        saved_at: String(row.saved_at),
                        created_at: row.created_at ? String(row.created_at) : null,
                    },
                }))

                const mergedRows = [...expenses, ...incomes, ...savings].sort((a, b) => {
                    if (a.date !== b.date) return a.date < b.date ? 1 : -1
                    return String(a.created_at ?? '') < String(b.created_at ?? '') ? 1 : -1
                })
                const nextRows = mergedRows.slice(0, cumulativeLimit)
                const tableMayHaveMore =
                    (expenseRes.data?.length ?? 0) >= cumulativeLimit ||
                    (incomeRes.data?.length ?? 0) >= cumulativeLimit ||
                    (savingsRes.data?.length ?? 0) >= cumulativeLimit
                const pagination = getPaginationState({
                    received: tableMayHaveMore ? HISTORY_PAGE_SIZE : nextRows.length - pageIndex * HISTORY_PAGE_SIZE,
                    pageSize: HISTORY_PAGE_SIZE,
                    page: pageIndex,
                })

                if (seq !== historyLoadSeqRef.current) return

                setVisibleProfiles(loadedProfiles)
                setHistoryRows(nextRows)
                setHistoryPage(pageIndex)
                setHistoryHasMore(tableMayHaveMore || pagination.hasMore)
            } catch (error) {
                setErrorMsg(error instanceof Error ? error.message : 'Unable to load history.')
            } finally {
                if (seq === historyLoadSeqRef.current) {
                    setHistoryLoading(false)
                    setHistoryLoadingMore(false)
                }
            }
        },
        [
            dataScope,
            filterMode,
            getScopedUserIds,
            historyFilter,
            isDashboard,
            loadVisibleProfiles,
            selectedDay,
            selectedMonth,
            selectedYear,
            supabase,
            surface,
            userId,
            visibleProfiles,
        ]
    )

    useEffect(() => {
        if (!userId) return
        setHistoryRows([])
        setHistoryPage(0)
        setHistoryHasMore(false)
        loadHistoryPage(0)
    }, [dataScope, filterMode, historyFilter, loadHistoryPage, selectedDay, selectedMonth, selectedYear, userId])

    useEffect(() => {
        const modalOpen = formOpen || Boolean(deleteTarget) || budgetOpen
        if (!modalOpen) return

        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [budgetOpen, deleteTarget, formOpen])

    useEffect(() => {
        if (isDashboard || !historyHasMore || historyLoading || historyLoadingMore) return

        const rootEl = scrollRef.current
        const targetEl = loadMoreRef.current
        if (!rootEl || !targetEl) return

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0]
                if (entry.isIntersecting && historyHasMore && !historyLoadingMore) {
                    loadHistoryPage(historyPage + 1)
                }
            },
            { root: rootEl, threshold: 0.2 }
        )

        observer.observe(targetEl)
        return () => observer.disconnect()
    }, [historyHasMore, historyLoading, historyLoadingMore, historyPage, isDashboard, loadHistoryPage])

    const ownExpenseRows = useMemo(
        () => (userId ? expenseRows.filter((row) => row.user_id === userId) : []),
        [expenseRows, userId]
    )

    const partnerExpenseRows = useMemo(
        () => (userId ? expenseRows.filter((row) => row.user_id !== userId) : []),
        [expenseRows, userId]
    )

    const expenseScopeTotals = useMemo(() => {
        const myExpenses = ownExpenseRows.reduce((sum, row) => sum + row.amount, 0)
        const partnerExpenses = partnerExpenseRows.reduce((sum, row) => sum + row.amount, 0)
        return {
            myExpenses,
            partnerExpenses,
            combinedExpenses: myExpenses + partnerExpenses,
        }
    }, [ownExpenseRows, partnerExpenseRows])

    const partnerLabel = useMemo(() => {
        const partner = visibleProfiles.find((profile) => profile.relation === 'partner')
        return partner?.display_name || 'Partner'
    }, [visibleProfiles])

    const hasPartnerVisibility = visibleProfiles.some((profile) => profile.relation === 'partner')

    const totals = useMemo(() => {
        if (!userId) {
            return {
                expenses: 0,
                income: 0,
                netBeforeSavings: 0,
                savedFromIncome: 0,
                cashFlow: 0,
                monthlySavings: 0,
                savingsDeposits: 0,
                savingsWithdrawals: 0,
            }
        }

        return calculateFinanceTotals({
            userId,
            expenses: expenseRows,
            incomes: incomeRows,
            savings: savingsRows,
        })
    }, [expenseRows, incomeRows, savingsRows, userId])

    const unifiedTransactions = useMemo<UnifiedTransaction[]>(() => {
        const expenses = expenseRows.map((row) => ({
            id: row.id,
            kind: 'expense' as const,
            title: row.category || 'Expense',
            description: row.description,
            date: row.spent_at,
            amount: -row.amount,
            created_at: row.created_at,
            source: row,
        }))

        const incomes = incomeRows.map((row) => ({
            id: row.id,
            kind: 'income' as const,
            title: row.category || 'Income',
            description: row.description,
            date: row.received_at,
            amount: row.amount,
            created_at: row.created_at,
            source: row,
        }))

        const savings = savingsRows.map((row) => ({
            id: row.id,
            kind: 'savings' as const,
            title: row.account_name,
            description: row.description,
            date: row.saved_at,
            amount: row.type === 'withdrawal' ? -row.amount : row.amount,
            created_at: row.created_at,
            source: row,
        }))

        return [...expenses, ...incomes, ...savings].sort((a, b) => {
            if (a.date !== b.date) return a.date < b.date ? 1 : -1
            return String(a.created_at ?? '') < String(b.created_at ?? '') ? 1 : -1
        })
    }, [expenseRows, incomeRows, savingsRows])

    const visibleTransactions = useMemo(() => {
        if (!isDashboard) return historyRows
        const filtered = historyFilter === 'all'
            ? unifiedTransactions
            : unifiedTransactions.filter((transaction) => transaction.kind === historyFilter)
        return filtered.slice(0, 5)
    }, [historyFilter, historyRows, isDashboard, unifiedTransactions])

    const budgetComparisons = useMemo(() => {
        const spentByCategory = new Map<string, number>()
        const spentByName = new Map<string, number>()

        ownExpenseRows.forEach((row) => {
            if (row.category_id) {
                spentByCategory.set(row.category_id, (spentByCategory.get(row.category_id) ?? 0) + row.amount)
            }

            const name = normalizeName(row.category || 'Uncategorized').toLowerCase()
            spentByName.set(name, (spentByName.get(name) ?? 0) + row.amount)
        })

        return expenseLimits.map((limit) => {
            const spent =
                spentByCategory.get(limit.category_id) ??
                spentByName.get(normalizeName(limit.category_name).toLowerCase()) ??
                0
            const remaining = limit.monthly_limit - spent

            return {
                ...limit,
                spent,
                remaining,
                isOver: remaining < 0,
                progress: Math.min(100, Math.round((spent / Math.max(limit.monthly_limit, 1)) * 100)),
            }
        })
    }, [expenseLimits, ownExpenseRows])

    async function ensureExpenseCategory(name: string) {
        const normalized = normalizeName(name)
        const existing = expenseCategories.find((category) => category.name.toLowerCase() === normalized.toLowerCase())
        if (existing) return existing

        if (!userId) throw new Error('Not logged in.')

        const { data, error } = await supabase
            .from('expense_categories')
            .insert({ user_id: userId, name: normalized })
            .select('id, name')
            .single()

        if (error) {
            const retry = await supabase
                .from('expense_categories')
                .select('id, name')
                .eq('user_id', userId)
                .ilike('name', normalized)
                .maybeSingle()

            if (retry.error || !retry.data) throw error
            return { id: String(retry.data.id), name: String(retry.data.name) }
        }

        return { id: String(data.id), name: String(data.name) }
    }

    async function ensureIncomeCategory(name: string) {
        const normalized = normalizeName(name)
        const existing = incomeCategories.find((category) => category.name.toLowerCase() === normalized.toLowerCase())
        if (existing) return existing

        if (!userId) throw new Error('Not logged in.')

        const { data, error } = await supabase
            .from('income_categories')
            .insert({ user_id: userId, name: normalized })
            .select('id, name')
            .single()

        if (error) {
            const retry = await supabase
                .from('income_categories')
                .select('id, name')
                .eq('user_id', userId)
                .ilike('name', normalized)
                .maybeSingle()

            if (retry.error || !retry.data) throw error
            return { id: String(retry.data.id), name: String(retry.data.name) }
        }

        return { id: String(data.id), name: String(data.name) }
    }

    async function ensureSavingsAccount(name: string) {
        const normalized = normalizeName(name)
        const existing = savingsAccounts.find((account) => account.name.toLowerCase() === normalized.toLowerCase())
        if (existing) return existing

        if (!userId) throw new Error('Not logged in.')

        const { data, error } = await supabase
            .from('savings_accounts')
            .insert({ user_id: userId, name: normalized })
            .select('id, user_id, name, target_amount, created_at')
            .single()

        if (error) {
            const retry = await supabase
                .from('savings_accounts')
                .select('id, user_id, name, target_amount, created_at')
                .eq('user_id', userId)
                .ilike('name', normalized)
                .maybeSingle()

            if (retry.error || !retry.data) throw error
            return {
                id: String(retry.data.id),
                user_id: String(retry.data.user_id),
                name: String(retry.data.name),
                target_amount: retry.data.target_amount === null ? null : toNumber(retry.data.target_amount),
                created_at: retry.data.created_at ? String(retry.data.created_at) : null,
            }
        }

        return {
            id: String(data.id),
            user_id: String(data.user_id),
            name: String(data.name),
            target_amount: data.target_amount === null ? null : toNumber(data.target_amount),
            created_at: data.created_at ? String(data.created_at) : null,
        }
    }

    function updateForm(patch: Partial<FormState>) {
        setForm((current) => ({ ...current, ...patch }))
    }

    function switchFormType(type: TransactionKind) {
        setFormType(type)
        setForm((current) => ({
            ...current,
            category: type === 'income' ? incomeCategoryOptions[0] ?? 'Salary' : expenseCategoryOptions[0] ?? 'Food',
            newCategory: '',
            accountId: type === 'savings' ? savingsAccounts[0]?.id ?? '' : '',
            newAccount: type === 'savings' && savingsAccounts.length === 0 ? 'General Savings' : '',
            savingsType: type === 'savings' ? current.savingsType : 'deposit',
            savingsSource: type === 'savings' ? current.savingsSource : 'monthly_income',
            isDating: false,
            isForPartner: false,
        }))
    }

    function openCreate(type: TransactionKind) {
        const date = toISODate(new Date(Number(selectedYear), Number(selectedMonth) - 1, Math.min(now.getDate(), 28)))
        setFormType(type)
        setFormMode('create')
        setEditingTarget(null)
        setForm({
            ...initialFormState(date),
            category: type === 'income' ? incomeCategoryOptions[0] ?? 'Salary' : expenseCategoryOptions[0] ?? 'Food',
            accountId: savingsAccounts[0]?.id ?? '',
            newAccount: savingsAccounts.length === 0 ? 'General Savings' : '',
        })
        setErrorMsg(null)
        setFormOpen(true)
    }

    function openEdit(transaction: UnifiedTransaction) {
        setFormMode('edit')
        setFormType(transaction.kind)
        setEditingTarget(transaction)
        setErrorMsg(null)

        if (transaction.kind === 'expense') {
            const row = transaction.source as ExpenseRow
            const category = row.category || 'Others'
            const known = expenseCategoryOptions.some((option) => option.toLowerCase() === category.toLowerCase())

            setForm({
                ...initialFormState(row.spent_at),
                amount: String(row.amount),
                category: known ? category : 'Others',
                newCategory: known ? '' : category,
                description: row.description ?? '',
                isDating: Boolean(row.is_dating),
                isForPartner: Boolean(row.is_for_partner),
            })
        } else if (transaction.kind === 'income') {
            const row = transaction.source as IncomeRow
            const category = row.category || 'Other'
            const known = incomeCategoryOptions.some((option) => option.toLowerCase() === category.toLowerCase())

            setForm({
                ...initialFormState(row.received_at),
                amount: String(row.amount),
                category: known ? category : 'Other',
                newCategory: known ? '' : category,
                description: row.description ?? '',
            })
        } else {
            const row = transaction.source as SavingsTransactionRow
            setForm({
                ...initialFormState(row.saved_at),
                amount: String(row.amount),
                accountId: row.account_id ?? '',
                newAccount: row.account_id ? '' : row.account_name,
                savingsType: row.type,
                savingsSource: row.source,
                description: row.description ?? '',
            })
        }

        setFormOpen(true)
    }

    async function submitTransaction() {
        if (!userId) return

        const amount = Number(form.amount)
        if (!Number.isFinite(amount) || amount <= 0) {
            setErrorMsg('Please enter a positive amount.')
            return
        }

        if (!form.date) {
            setErrorMsg('Please choose a date.')
            return
        }

        setSaving(true)
        setErrorMsg(null)

        try {
            if (formType === 'expense') {
                const finalCategory =
                    form.category === 'Others' ? normalizeName(form.newCategory) : normalizeName(form.category)
                if (!finalCategory) throw new Error('Please name the expense category.')

                const category = await ensureExpenseCategory(finalCategory)
                const payload = {
                    user_id: userId,
                    amount,
                    category: category.name,
                    category_id: category.id,
                    description: form.description.trim() || null,
                    spent_at: form.date,
                    is_dating: form.isDating,
                    is_for_partner: form.isForPartner,
                }

                const result =
                    formMode === 'edit' && editingTarget?.kind === 'expense'
                        ? await supabase
                            .from('expenses')
                            .update(payload)
                            .eq('id', editingTarget.id)
                            .eq('user_id', userId)
                        : await supabase.from('expenses').insert(payload)

                if (result.error) throw result.error
            } else if (formType === 'income') {
                const finalCategory =
                    form.category === 'Other' ? normalizeName(form.newCategory) : normalizeName(form.category)
                if (!finalCategory) throw new Error('Please name the income category.')

                const category = await ensureIncomeCategory(finalCategory)
                const payload = {
                    user_id: userId,
                    amount,
                    category: category.name,
                    category_id: category.id,
                    description: form.description.trim() || null,
                    received_at: form.date,
                }

                const result =
                    formMode === 'edit' && editingTarget?.kind === 'income'
                        ? await supabase
                            .from('incomes')
                            .update(payload)
                            .eq('id', editingTarget.id)
                            .eq('user_id', userId)
                        : await supabase.from('incomes').insert(payload)

                if (result.error) throw result.error
            } else {
                const selectedAccount = savingsAccounts.find((account) => account.id === form.accountId)
                const accountName = selectedAccount?.name ?? normalizeName(form.newAccount || 'General Savings')
                if (!accountName) throw new Error('Please choose a savings account.')

                if (form.savingsType === 'withdrawal' && !selectedAccount) {
                    throw new Error('Please choose an existing savings account before withdrawing.')
                }

                const account = selectedAccount ?? (await ensureSavingsAccount(accountName))
                const source = form.savingsType === 'deposit' ? form.savingsSource : 'other'

                if (form.savingsType === 'withdrawal') {
                    const availableBalance = getAvailableBalanceForWithdrawal(allSavingsRows, {
                        userId,
                        accountId: account.id,
                        editingTransactionId:
                            formMode === 'edit' && editingTarget?.kind === 'savings' ? editingTarget.id : null,
                    })

                    if (amount > availableBalance) {
                        throw new Error(
                            `Withdrawal exceeds ${account.name} balance. Available: RM ${money(availableBalance)}.`
                        )
                    }
                }

                const payload = {
                    user_id: userId,
                    account_id: account.id,
                    amount,
                    type: form.savingsType,
                    source,
                    description: form.description.trim() || null,
                    saved_at: form.date,
                }

                const result =
                    formMode === 'edit' && editingTarget?.kind === 'savings'
                        ? await supabase
                            .from('savings_transactions')
                            .update(payload)
                            .eq('id', editingTarget.id)
                            .eq('user_id', userId)
                        : await supabase.from('savings_transactions').insert(payload)

                if (result.error) throw result.error
            }

            setFormOpen(false)
            setEditingTarget(null)
            await loadFinanceData({ force: true })
            await loadHistoryPage(0)
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Unable to save transaction.')
        } finally {
            setSaving(false)
        }
    }

    async function confirmDelete() {
        if (!userId || !deleteTarget) return

        setSaving(true)
        setErrorMsg(null)

        try {
            const table =
                deleteTarget.kind === 'expense'
                    ? 'expenses'
                    : deleteTarget.kind === 'income'
                        ? 'incomes'
                        : 'savings_transactions'

            const { error } = await supabase.from(table).delete().eq('id', deleteTarget.id).eq('user_id', userId)
            if (error) throw error

            setDeleteTarget(null)
            await loadFinanceData({ force: true })
            await loadHistoryPage(0)
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Unable to delete transaction.')
        } finally {
            setSaving(false)
        }
    }

    function openBudgetModal(limit?: ExpenseLimitRow) {
        if (limit) {
            setBudgetCategory(limit.category_name)
            setBudgetNewCategory('')
            setBudgetAmount(String(limit.monthly_limit))
        } else {
            setBudgetCategory(expenseCategoryOptions[0] ?? 'Food')
            setBudgetNewCategory('')
            setBudgetAmount('')
        }

        setErrorMsg(null)
        setBudgetOpen(true)
    }

    async function saveBudgetLimit() {
        if (!userId) return

        const amount = Number(budgetAmount)
        if (!Number.isFinite(amount) || amount <= 0) {
            setErrorMsg('Please enter a positive monthly limit.')
            return
        }

        const categoryName =
            budgetCategory === 'Others' ? normalizeName(budgetNewCategory) : normalizeName(budgetCategory)
        if (!categoryName) {
            setErrorMsg('Please name the category.')
            return
        }

        setSaving(true)
        setErrorMsg(null)

        try {
            const category = await ensureExpenseCategory(categoryName)
            const existing = expenseLimits.find((limit) => limit.category_id === category.id)
            const payload = {
                user_id: userId,
                category_id: category.id,
                monthly_limit: amount,
                is_active: true,
            }

            const result = existing
                ? await supabase
                    .from('expense_category_limits')
                    .update(payload)
                    .eq('id', existing.id)
                    .eq('user_id', userId)
                : await supabase.from('expense_category_limits').insert(payload)

            if (result.error) throw result.error

            setBudgetOpen(false)
            await loadFinanceData({ force: true })
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Unable to save budget limit.')
        } finally {
            setSaving(false)
        }
    }

    async function removeBudgetLimit(limit: ExpenseLimitRow) {
        if (!userId) return

        setSaving(true)
        setErrorMsg(null)

        try {
            const { error } = await supabase
                .from('expense_category_limits')
                .update({ is_active: false })
                .eq('id', limit.id)
                .eq('user_id', userId)

            if (error) throw error
            await loadFinanceData({ force: true })
        } catch (error) {
            setErrorMsg(error instanceof Error ? error.message : 'Unable to remove budget limit.')
        } finally {
            setSaving(false)
        }
    }

    const activeDateRange = buildFinanceDateRange({
        mode: isDashboard ? 'month' : filterMode,
        year: selectedYear,
        month: selectedMonth,
        day: selectedDay,
    })
    const selectableYears = Array.from(
        new Set([now.getFullYear(), ...availableMonths.map((item) => item.year)])
    ).sort((a, b) => b - a)
    const selectableMonths =
        selectedYear === 'all'
            ? Array.from({ length: 12 }, (_, index) => index + 1)
            : Array.from(
                new Set([
                    now.getMonth() + 1,
                    ...availableMonths
                        .filter((item) => item.year === Number(selectedYear))
                        .map((item) => item.month),
                ])
            ).sort((a, b) => a - b)
    const selectableDays = availableDays.length > 0 ? availableDays : [now.getDate()]

    if (loading) {
        return (
            <AppShell title="Finance" subtitle="Loading...">
                <div className="mx-auto flex min-h-[65vh] max-w-md flex-col justify-center px-5 text-center">
                    <div className="rounded-[2rem] bg-white p-6 shadow-sm">
                        <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-3xl bg-rose-100" />
                        <p className="font-black text-stone-700">Loading finance dashboard...</p>
                        <p className="mt-2 text-sm font-bold text-stone-400">Preparing this month first.</p>
                    </div>
                </div>
            </AppShell>
        )
    }

    return (
        <AppShell title="Finance" subtitle={userName}>
            <div className="min-h-screen bg-[#FFF9F5] pb-28">
                <button
                    type="button"
                    onClick={() => openCreate('expense')}
                    className="fixed bottom-6 right-5 z-[55] flex h-16 w-16 items-center justify-center rounded-full bg-rose-500 text-3xl font-black text-white shadow-[0_12px_30px_rgba(244,63,94,0.35)] transition active:scale-95"
                    aria-label="Quick add expense"
                >
                    +
                </button>

                <div className="mx-auto max-w-md space-y-5 px-4">
                    <section className="space-y-3">
                        <div className="flex items-end justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-rose-400">
                                    {isDashboard ? 'Dashboard overview' : 'Finance tracker'}
                                </p>
                                <h1 className="text-3xl font-black tracking-tight text-stone-800">
                                    {isDashboard ? monthLabel(selectedYear, selectedMonth) : activeDateRange.label}
                                </h1>
                            </div>
                            <div className="rounded-full bg-white px-3 py-2 text-xs font-black text-stone-400 shadow-sm">
                                {refreshing ? 'Syncing...' : usedCache ? 'Cached' : 'Live'}
                            </div>
                        </div>

                        {isDashboard ? (
                            <div className="rounded-[2rem] border border-stone-100 bg-white p-4 text-sm font-bold text-stone-500 shadow-sm">
                                Quick personal view for this month. Use Finance Tracker for day, year, partner, and combined filters.
                            </div>
                        ) : (
                            <div className="space-y-3 rounded-[2rem] border border-stone-100 bg-white p-3 shadow-sm">
                                <div className="grid grid-cols-3 gap-2">
                                    {(['personal', 'partner', 'combined'] as const).map((scope) => (
                                        <button
                                            key={scope}
                                            type="button"
                                            onClick={() => setDataScope(scope)}
                                            className={`rounded-2xl px-3 py-2 text-xs font-black capitalize transition active:scale-95 ${dataScope === scope
                                                ? 'bg-stone-800 text-white'
                                                : 'bg-stone-50 text-stone-500'
                                                }`}
                                        >
                                            {scope}
                                        </button>
                                    ))}
                                </div>

                                <div className="grid grid-cols-4 gap-2">
                                    {(['day', 'month', 'year', 'all'] as const).map((mode) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => {
                                                setFilterMode(mode)
                                                if (mode === 'all') {
                                                    setSelectedYear('all')
                                                    setSelectedMonth('all')
                                                    setSelectedDay('all')
                                                } else if (selectedYear === 'all') {
                                                    setSelectedYear(String(now.getFullYear()))
                                                    setSelectedMonth(String(now.getMonth() + 1))
                                                    setSelectedDay(String(now.getDate()))
                                                }
                                            }}
                                            className={`rounded-2xl px-3 py-2 text-xs font-black capitalize transition active:scale-95 ${filterMode === mode
                                                ? 'bg-rose-400 text-white'
                                                : 'bg-rose-50 text-rose-500'
                                                }`}
                                        >
                                            {mode}
                                        </button>
                                    ))}
                                </div>

                                {filterMode !== 'all' ? (
                                    <div className={`grid gap-2 ${filterMode === 'day' ? 'grid-cols-3' : filterMode === 'month' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                        <SmallSelect label="Year" value={selectedYear === 'all' ? String(now.getFullYear()) : selectedYear} onChange={setSelectedYear}>
                                            {selectableYears.map((year) => (
                                                <option key={year} value={String(year)}>
                                                    {year}
                                                </option>
                                            ))}
                                        </SmallSelect>
                                        {filterMode === 'day' || filterMode === 'month' ? (
                                            <SmallSelect label="Month" value={selectedMonth === 'all' ? String(now.getMonth() + 1) : selectedMonth} onChange={setSelectedMonth}>
                                                {selectableMonths.map((month) => (
                                                    <option key={month} value={String(month)}>
                                                        {MONTHS[month - 1]}
                                                    </option>
                                                ))}
                                            </SmallSelect>
                                        ) : null}
                                        {filterMode === 'day' ? (
                                            <SmallSelect label="Day" value={selectedDay === 'all' ? String(now.getDate()) : selectedDay} onChange={setSelectedDay}>
                                                {selectableDays.map((day) => (
                                                    <option key={day} value={String(day)}>
                                                        {pad2(day)}
                                                    </option>
                                                ))}
                                            </SmallSelect>
                                        ) : null}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </section>

                    {errorMsg ? (
                        <div className="rounded-3xl border-2 border-red-100 bg-red-50 p-4 text-sm font-bold text-red-600">
                            {errorMsg}
                        </div>
                    ) : null}

                    <section className="grid grid-cols-2 gap-3">
                        <SummaryCard
                            label="My Income"
                            value={`RM ${money(totals.income)}`}
                            hint="Personal this month"
                            tone="emerald"
                        />
                        <SummaryCard
                            label="My Expenses"
                            value={`RM ${money(totals.expenses)}`}
                            hint="Personal this month"
                            tone="rose"
                        />
                        <SummaryCard
                            label="Saved from Income"
                            value={`RM ${money(totals.savedFromIncome)}`}
                            hint="Reduces cash flow"
                            tone="sky"
                        />
                        <SummaryCard
                            label="Cash Flow"
                            value={signedMoney(totals.cashFlow)}
                            hint="Income - expenses - saved income"
                            tone={totals.cashFlow >= 0 ? 'amber' : 'rose'}
                        />
                        <SummaryCard
                            label="Net Savings"
                            value={signedMoney(totals.monthlySavings)}
                            hint="All sources, deposits - withdrawals"
                            tone="sky"
                        />
                        <SummaryCard
                            label="Total Savings"
                            value={`RM ${money(totalSavingsBalance)}`}
                            hint={`${money(totals.savingsDeposits)} deposited, ${money(totals.savingsWithdrawals)} withdrawn`}
                            tone="stone"
                        />
                    </section>

                    {!isDashboard && hasPartnerVisibility ? (
                        <section className="space-y-3 rounded-[2rem] bg-white p-4 shadow-sm">
                            <div>
                                <h2 className="text-lg font-black text-stone-800">Shared Expense View</h2>
                                <p className="text-xs font-bold text-stone-400">
                                    Visible partner expenses are separate from your personal cash flow.
                                </p>
                            </div>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                <div className="rounded-3xl bg-stone-50 p-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Me</p>
                                    <p className="mt-1 text-sm font-black text-stone-800">
                                        RM {money(expenseScopeTotals.myExpenses)}
                                    </p>
                                </div>
                                <div className="rounded-3xl bg-sky-50 p-3">
                                    <p className="truncate text-[10px] font-black uppercase tracking-widest text-sky-500">
                                        {partnerLabel}
                                    </p>
                                    <p className="mt-1 text-sm font-black text-sky-800">
                                        RM {money(expenseScopeTotals.partnerExpenses)}
                                    </p>
                                </div>
                                <div className="rounded-3xl bg-rose-50 p-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-500">Combined</p>
                                    <p className="mt-1 text-sm font-black text-rose-800">
                                        RM {money(expenseScopeTotals.combinedExpenses)}
                                    </p>
                                </div>
                            </div>
                        </section>
                    ) : null}

                    <section className="grid grid-cols-3 gap-2">
                        <TypeButton active label="Expense" tone="rose" onClick={() => openCreate('expense')} />
                        <TypeButton active label="Income" tone="emerald" onClick={() => openCreate('income')} />
                        <TypeButton active label="Savings" tone="sky" onClick={() => openCreate('savings')} />
                    </section>

                    {isDashboard || dataScope === 'personal' ? (
                    <section className="space-y-3 rounded-[2rem] bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-black text-stone-800">Category Limits</h2>
                                <p className="text-xs font-bold text-stone-400">Only categories with limits show here.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => openBudgetModal()}
                                className="rounded-2xl bg-amber-100 px-4 py-3 text-xs font-black text-amber-800 active:scale-95"
                            >
                                Set
                            </button>
                        </div>

                        {budgetComparisons.length === 0 ? (
                            <div className="rounded-3xl bg-stone-50 p-4 text-sm font-bold text-stone-400">
                                No category limits yet. Add one for categories like Food or Transport.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {budgetComparisons.map((limit) => (
                                    <div
                                        key={limit.id}
                                        className={`rounded-3xl border p-4 ${limit.isOver
                                            ? 'border-red-100 bg-red-50 text-red-700'
                                            : 'border-stone-100 bg-stone-50 text-stone-700'
                                            }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-black">{limit.category_name}</p>
                                                <p className="mt-1 text-xs font-bold opacity-75">
                                                    Spent RM {money(limit.spent)} / RM {money(limit.monthly_limit)}
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => removeBudgetLimit(limit)}
                                                className="rounded-full bg-white px-3 py-1 text-[11px] font-black text-stone-400"
                                            >
                                                Hide
                                            </button>
                                        </div>
                                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                                            <div
                                                className={`h-full rounded-full ${limit.isOver ? 'bg-red-400' : 'bg-emerald-400'}`}
                                                style={{ width: `${limit.progress}%` }}
                                            />
                                        </div>
                                        <p className="mt-2 text-xs font-black">
                                            {limit.isOver
                                                ? `Over by RM ${money(Math.abs(limit.remaining))}`
                                                : `Remaining RM ${money(limit.remaining)}`}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                    ) : (
                        <section className="rounded-[2rem] bg-white p-4 text-sm font-bold text-stone-400 shadow-sm">
                            Budget limits are personal only and are hidden for partner / combined history views.
                        </section>
                    )}

                    <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3 px-1">
                            <div>
                                <h2 className="text-lg font-black text-stone-800">
                                    {isDashboard ? 'Recent Transactions' : `${dataScope === 'personal' ? 'Personal' : dataScope === 'partner' ? 'Partner' : 'Combined'} History`}
                                </h2>
                                <p className="text-xs font-bold text-stone-400">
                                    {isDashboard
                                        ? 'Latest 5 personal records only.'
                                        : 'Loaded 10 records at a time for the selected filter.'}
                                </p>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-stone-400 shadow-sm">
                                {visibleTransactions.length}{!isDashboard && historyHasMore ? '+' : ''} records
                            </span>
                        </div>

                        {!isDashboard ? (
                            <div className="grid grid-cols-4 gap-2">
                                {(['all', 'expense', 'income', 'savings'] as const).map((kind) => (
                                    <button
                                        key={kind}
                                        type="button"
                                        onClick={() => setHistoryFilter(kind)}
                                        className={`rounded-2xl px-3 py-2 text-xs font-black capitalize shadow-sm transition active:scale-95 ${historyFilter === kind
                                            ? 'bg-stone-800 text-white'
                                            : 'bg-white text-stone-500'
                                            }`}
                                    >
                                        {kind}
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        {historyLoading && !isDashboard ? (
                            <div className="rounded-[2rem] bg-white p-8 text-center text-sm font-black text-stone-400 shadow-sm">
                                Loading records...
                            </div>
                        ) : visibleTransactions.length === 0 ? (
                            <div className="rounded-[2rem] bg-white p-8 text-center shadow-sm">
                                <p className="text-4xl">💤</p>
                                <p className="mt-3 font-black text-stone-600">No records for this view.</p>
                            </div>
                        ) : (
                            <div
                                ref={isDashboard ? undefined : scrollRef}
                                className={`space-y-3 ${isDashboard ? '' : 'max-h-[70vh] overflow-y-auto overscroll-contain pr-1'}`}
                            >
                                {visibleTransactions.map((transaction) => {
                                    const isPositive = transaction.amount >= 0
                                    const isOwnRecord = transaction.source.user_id === userId
                                    const transactionOwner =
                                        transaction.kind === 'expense'
                                            ? getExpenseOwner(transaction.source.user_id)
                                            : { name: userName, relation: 'me' as const }
                                    const savingsSource =
                                        transaction.kind === 'savings' && (transaction.source as SavingsTransactionRow).type === 'deposit'
                                            ? savingsSourceLabel((transaction.source as SavingsTransactionRow).source)
                                            : null
                                    const badge =
                                        transaction.kind === 'expense'
                                            ? 'Expense'
                                            : transaction.kind === 'income'
                                                ? 'Income'
                                                : (transaction.source as SavingsTransactionRow).type === 'withdrawal'
                                                    ? 'Withdrawal'
                                                    : 'Deposit'
                                    const badgeText = savingsSource ? `${badge} · ${savingsSource}` : badge

                                    return (
                                        <div
                                            key={`${transaction.kind}-${transaction.id}`}
                                            className="rounded-[1.75rem] border border-stone-100 bg-white p-4 shadow-sm"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white"
                                                    style={{ backgroundColor: colorForName(transaction.title) }}
                                                >
                                                    {transaction.title.slice(0, 1).toUpperCase()}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className="truncate font-black text-stone-800">{transaction.title}</p>
                                                            <p className="mt-1 text-xs font-bold text-stone-400">
                                                                {badgeText} · {transaction.date}
                                                            </p>
                                                        </div>
                                                        <p
                                                            className={`shrink-0 text-right text-base font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'
                                                                }`}
                                                        >
                                                            {signedMoney(transaction.amount)}
                                                        </p>
                                                    </div>
                                                    {transaction.description ? (
                                                        <p className="mt-2 break-words text-sm font-bold text-stone-500">
                                                            {transaction.description}
                                                        </p>
                                                    ) : null}
                                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                                                        <span
                                                            className={`rounded-2xl px-3 py-1 text-[11px] font-black ${transactionOwner.relation === 'me'
                                                                ? 'bg-stone-50 text-stone-500'
                                                                : 'bg-sky-50 text-sky-700'
                                                                }`}
                                                        >
                                                            {transactionOwner.relation === 'me' ? 'Me' : 'Partner'} · {transactionOwner.name}
                                                        </span>

                                                        {isOwnRecord ? (
                                                            <div className="flex gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openEdit(transaction)}
                                                                    className="rounded-2xl bg-amber-50 px-4 py-2 text-xs font-black text-amber-700"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setDeleteTarget(transaction)}
                                                                    className="rounded-2xl bg-rose-50 px-4 py-2 text-xs font-black text-rose-600"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                {!isDashboard ? (
                                    <div ref={loadMoreRef} className="flex h-12 items-center justify-center">
                                        {historyLoadingMore ? (
                                            <span className="text-xs font-bold text-stone-400">Loading more...</span>
                                        ) : historyHasMore ? (
                                            <span className="text-xs font-bold text-stone-300">Scroll for more</span>
                                        ) : (
                                            <span className="text-xs font-bold text-stone-300">No more records</span>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </section>
                </div>
            </div>

            {formOpen ? (
                <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-stone-900/30 backdrop-blur-sm"
                        aria-label="Close transaction form"
                        onClick={() => !saving && setFormOpen(false)}
                    />
                    <div className="relative flex max-h-[88vh] w-full max-w-md flex-col rounded-[2rem] bg-white p-5 shadow-2xl">
                        <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                                <p className="text-xs font-black uppercase tracking-widest text-rose-400">
                                    {formMode === 'edit' ? 'Edit record' : 'Quick add'}
                                </p>
                                <h3 className="text-2xl font-black text-stone-800">
                                    {formType === 'expense' ? 'Expense' : formType === 'income' ? 'Income' : 'Savings'}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => !saving && setFormOpen(false)}
                                className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-50 text-lg font-black text-stone-400"
                            >
                                x
                            </button>
                        </div>

                        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                            <div className="grid grid-cols-3 gap-2">
                                <TypeButton
                                    active={formType === 'expense'}
                                    label="Expense"
                                    tone="rose"
                                    disabled={formMode === 'edit'}
                                    onClick={() => switchFormType('expense')}
                                />
                                <TypeButton
                                    active={formType === 'income'}
                                    label="Income"
                                    tone="emerald"
                                    disabled={formMode === 'edit'}
                                    onClick={() => switchFormType('income')}
                                />
                                <TypeButton
                                    active={formType === 'savings'}
                                    label="Savings"
                                    tone="sky"
                                    disabled={formMode === 'edit'}
                                    onClick={() => switchFormType('savings')}
                                />
                            </div>

                            <SmallInput
                                label="Amount (RM)"
                                value={form.amount}
                                onChange={(value) => updateForm({ amount: value })}
                                placeholder="0.00"
                                type="number"
                                inputMode="decimal"
                            />

                            {formType === 'expense' ? (
                                <>
                                    <SmallSelect
                                        label="Expense category"
                                        value={form.category || expenseCategoryOptions[0] || 'Food'}
                                        onChange={(value) => updateForm({ category: value })}
                                    >
                                        {expenseCategoryOptions.map((category) => (
                                            <option key={category} value={category}>
                                                {category}
                                            </option>
                                        ))}
                                    </SmallSelect>
                                    {form.category === 'Others' ? (
                                        <SmallInput
                                            label="New category"
                                            value={form.newCategory}
                                            onChange={(value) => updateForm({ newCategory: value })}
                                            placeholder="e.g. Bubble Tea"
                                        />
                                    ) : null}
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => updateForm({ isDating: !form.isDating })}
                                            className={`rounded-2xl px-4 py-3 text-sm font-black ${form.isDating ? 'bg-rose-100 text-rose-700' : 'bg-stone-50 text-stone-500'
                                                }`}
                                        >
                                            Dating
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateForm({ isForPartner: !form.isForPartner })}
                                            className={`rounded-2xl px-4 py-3 text-sm font-black ${form.isForPartner ? 'bg-amber-100 text-amber-800' : 'bg-stone-50 text-stone-500'
                                                }`}
                                        >
                                            Partner
                                        </button>
                                    </div>
                                </>
                            ) : null}

                            {formType === 'income' ? (
                                <>
                                    <SmallSelect
                                        label="Income category"
                                        value={form.category || incomeCategoryOptions[0] || 'Salary'}
                                        onChange={(value) => updateForm({ category: value })}
                                    >
                                        {incomeCategoryOptions.map((category) => (
                                            <option key={category} value={category}>
                                                {category}
                                            </option>
                                        ))}
                                    </SmallSelect>
                                    {form.category === 'Other' ? (
                                        <SmallInput
                                            label="New category"
                                            value={form.newCategory}
                                            onChange={(value) => updateForm({ newCategory: value })}
                                            placeholder="e.g. Side project"
                                        />
                                    ) : null}
                                </>
                            ) : null}

                            {formType === 'savings' ? (
                                <>
                                    <div className="grid grid-cols-2 gap-2">
                                        <TypeButton
                                            active={form.savingsType === 'deposit'}
                                            label="Deposit"
                                            tone="sky"
                                            onClick={() => updateForm({ savingsType: 'deposit' })}
                                        />
                                        <TypeButton
                                            active={form.savingsType === 'withdrawal'}
                                            label="Withdraw"
                                            tone="rose"
                                            onClick={() => updateForm({ savingsType: 'withdrawal' })}
                                        />
                                    </div>
                                    {form.savingsType === 'deposit' ? (
                                        <SmallSelect
                                            label="Savings source"
                                            value={form.savingsSource}
                                            onChange={(value) => updateForm({ savingsSource: normalizeSavingsSource(value) })}
                                        >
                                            {SAVINGS_SOURCE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>
                                                    {option.label}
                                                </option>
                                            ))}
                                        </SmallSelect>
                                    ) : null}
                                    {savingsAccounts.length > 0 ? (
                                        <SmallSelect
                                            label="Savings account"
                                            value={form.accountId}
                                            onChange={(value) => updateForm({ accountId: value })}
                                        >
                                            {savingsAccounts.map((account) => (
                                                <option key={account.id} value={account.id}>
                                                    {account.name}
                                                </option>
                                            ))}
                                            <option value="">New account</option>
                                        </SmallSelect>
                                    ) : null}
                                    {savingsAccounts.length === 0 || !form.accountId ? (
                                        <SmallSelect
                                            label="Account / goal"
                                            value={form.newAccount || 'General Savings'}
                                            onChange={(value) => updateForm({ newAccount: value })}
                                        >
                                            {accountOptions.map((account) => (
                                                <option key={account} value={account}>
                                                    {account}
                                                </option>
                                            ))}
                                        </SmallSelect>
                                    ) : null}
                                    {form.savingsType === 'withdrawal' && form.accountId ? (
                                        <div className="rounded-2xl bg-sky-50 px-4 py-3 text-xs font-black text-sky-700">
                                            Available: RM {money(savingsAccountBalances[form.accountId] ?? 0)}
                                        </div>
                                    ) : null}
                                </>
                            ) : null}

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <SmallInput
                                    label="Date"
                                    type="date"
                                    value={form.date}
                                    onChange={(value) => updateForm({ date: value })}
                                />
                                <SmallInput
                                    label="Description"
                                    value={form.description}
                                    onChange={(value) => updateForm({ description: value })}
                                    placeholder="Optional note"
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => !saving && setFormOpen(false)}
                                    disabled={saving}
                                    className="flex-1 rounded-2xl bg-stone-100 py-4 font-black text-stone-500 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={submitTransaction}
                                    disabled={saving}
                                    className="flex-1 rounded-2xl bg-rose-400 py-4 font-black text-white shadow-lg shadow-rose-100 disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : formMode === 'edit' ? 'Save' : 'Add'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {budgetOpen ? (
                <div className="fixed inset-0 z-[85] flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-stone-900/30 backdrop-blur-sm"
                        aria-label="Close budget form"
                        onClick={() => !saving && setBudgetOpen(false)}
                    />
                    <div className="relative w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl">
                        <div className="mb-4">
                            <p className="text-xs font-black uppercase tracking-widest text-amber-500">Budget</p>
                            <h3 className="text-2xl font-black text-stone-800">Monthly Category Limit</h3>
                        </div>
                        <div className="space-y-4">
                            <SmallSelect label="Expense category" value={budgetCategory} onChange={setBudgetCategory}>
                                {expenseCategoryOptions.map((category) => (
                                    <option key={category} value={category}>
                                        {category}
                                    </option>
                                ))}
                            </SmallSelect>
                            {budgetCategory === 'Others' ? (
                                <SmallInput
                                    label="New category"
                                    value={budgetNewCategory}
                                    onChange={setBudgetNewCategory}
                                    placeholder="e.g. Fitness"
                                />
                            ) : null}
                            <SmallInput
                                label="Monthly limit (RM)"
                                value={budgetAmount}
                                onChange={setBudgetAmount}
                                placeholder="800"
                                type="number"
                                inputMode="decimal"
                            />
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => !saving && setBudgetOpen(false)}
                                    disabled={saving}
                                    className="flex-1 rounded-2xl bg-stone-100 py-4 font-black text-stone-500 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={saveBudgetLimit}
                                    disabled={saving}
                                    className="flex-1 rounded-2xl bg-amber-400 py-4 font-black text-stone-800 shadow-lg shadow-amber-100 disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save Limit'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {deleteTarget ? (
                <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                    <button
                        type="button"
                        className="absolute inset-0 bg-stone-900/35 backdrop-blur-sm"
                        aria-label="Close delete confirmation"
                        onClick={() => !saving && setDeleteTarget(null)}
                    />
                    <div className="relative w-full max-w-sm rounded-[2rem] bg-white p-6 shadow-2xl">
                        <h3 className="text-xl font-black text-stone-800">Delete this record?</h3>
                        <div className="my-5 rounded-3xl bg-stone-50 p-4">
                            <p className="font-black text-stone-700">{deleteTarget.title}</p>
                            <p className="mt-1 text-xs font-bold text-stone-400">
                                {deleteTarget.date} · {signedMoney(deleteTarget.amount)}
                            </p>
                        </div>
                        <div className="grid gap-3">
                            <button
                                type="button"
                                onClick={() => !saving && setDeleteTarget(null)}
                                disabled={saving}
                                className="rounded-2xl bg-stone-100 py-4 font-black text-stone-600 disabled:opacity-50"
                            >
                                Keep it
                            </button>
                            <button
                                type="button"
                                onClick={confirmDelete}
                                disabled={saving}
                                className="rounded-2xl bg-rose-500 py-4 font-black text-white shadow-lg shadow-rose-100 disabled:opacity-50"
                            >
                                {saving ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </AppShell>
    )
}
