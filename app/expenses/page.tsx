'use client'

import { supabaseBrowser } from '@/app/lib/supabase-browser'
import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '../components/AppShell'

// --- TYPES (Unchanged) ---
type ExpenseRow = {
    id: string
    user_id: string
    amount: number
    category: string
    description: string | null
    spent_at: string // YYYY-MM-DD
    created_at: string | null
    is_dating?: boolean | null
    is_for_partner?: boolean | null
}

type CategoryItem = { id: string; name: string }

// --- HELPERS (Unchanged + 1 Visual Helper) ---
function normalizeCategoryName(s: string) {
    return s.trim().replace(/\s+/g, ' ')
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function pad2(n: number) {
    return String(n).padStart(2, '0')
}

function toISODate(d: Date) {
    const yyyy = d.getFullYear()
    const mm = pad2(d.getMonth() + 1)
    const dd = pad2(d.getDate())
    return `${yyyy}-${mm}-${dd}`
}

// Visual helper for cute colors (Does not affect logic)
function colorForCategory(category: string) {
    let h = 0
    for (let i = 0; i < category.length; i++) {
        h = (h << 5) - h + category.charCodeAt(i)
        h |= 0
    }
    const hue = Math.abs(h) % 360
    return `hsl(${hue}, 85%, 75%)`
}

// --- CUTE UI COMPONENTS (Visual Only) ---
function CuteInput({ label, value, onChange, placeholder, type = "text", inputMode }: any) {
    return (
        <div className="space-y-1">
            {label && <label className="text-xs font-bold text-stone-400 uppercase tracking-wider ml-1">{label}</label>}
            <input
                type={type}
                inputMode={inputMode}
                value={value}
                onChange={onChange}
                placeholder={placeholder}
                className="w-full bg-white border-2 border-stone-100 rounded-2xl px-4 py-3 font-bold text-stone-700 focus:outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100 transition-all placeholder:text-stone-300 shadow-sm"
            />
        </div>
    )
}

function CuteSelect({ label, value, onChange, children }: any) {
    return (
        <div className="space-y-1 w-full">
            {label && <label className="text-xs font-bold text-stone-400 uppercase tracking-wider ml-1">{label}</label>}
            <div className="relative">
                <select
                    value={value}
                    onChange={onChange}
                    className="w-full appearance-none bg-white border-2 border-stone-100 rounded-2xl px-4 py-3 font-bold text-stone-700 focus:outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100 transition-all shadow-sm cursor-pointer"
                >
                    {children}
                </select>
                <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-rose-300">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                </div>
            </div>
        </div>
    )
}

function CuteToggle({ label, value, onChange, emoji = '💗', hint }: any) {
    return (
        <div className="flex items-center justify-between gap-3 bg-white border-2 border-stone-100 rounded-2xl px-4 py-3 shadow-sm">
            <div className="min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-lg">{emoji}</span>
                    <span className="font-black text-stone-700">{label}</span>
                </div>
                {hint ? <div className="text-xs font-bold text-stone-400 mt-1">{hint}</div> : null}
            </div>

            <button
                type="button"
                onClick={() => onChange(!value)}
                className={`relative w-14 h-8 rounded-full transition-all border-2 ${value ? 'bg-rose-400 border-rose-300' : 'bg-stone-100 border-stone-200'
                    }`}
                aria-pressed={value}
            >
                <span
                    className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-6' : 'translate-x-0'
                        }`}
                />
            </button>
        </div>
    )
}

export default function ExpensesPage() {
    // ==========================================
    // 1. YOUR ORIGINAL LOGIC & STATE (UNCHANGED)
    // ==========================================

    const supabase = supabaseBrowser()

    const now = useMemo(() => new Date(), [])
    const [userName, setUserName] = useState('User')
    const [userId, setUserId] = useState<string | null>(null)

    // Selection State (support "all")
    const [availableMonths, setAvailableMonths] = useState<{ year: number; month: number }[]>([])
    const [availableDays, setAvailableDays] = useState<number[]>([])

    const [selectedYear, setSelectedYear] = useState<string>(String(now.getFullYear())) // or 'all'
    const [selectedMonth, setSelectedMonth] = useState<string>(String(now.getMonth() + 1)) // '1'..'12' or 'all'
    const [selectedDay, setSelectedDay] = useState<string>('all') // '1'..'31' or 'all'

    const yearIsAll = selectedYear === 'all'
    const monthIsAll = selectedMonth === 'all'
    const dayIsAll = selectedDay === 'all'

    // Data State
    const [loading, setLoading] = useState(true)
    const [rows, setRows] = useState<ExpenseRow[]>([])
    const [monthlyTotal, setMonthlyTotal] = useState(0)
    const [totalCount, setTotalCount] = useState<number>(0)

    // Infinite scroll (10 by 10)
    const PAGE_SIZE = 10
    const [page, setPage] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const loadMoreRef = useRef<HTMLDivElement | null>(null)

    const loadMoreLockRef = useRef(false)

    const tryLoadMore = async () => {
        if (!userId) return
        if (!hasMore) return
        if (loadingMore) return
        if (loadMoreLockRef.current) return

        loadMoreLockRef.current = true
        try {
            await fetchExpensesPage(userId, page + 1, 'append')
        } finally {
            setTimeout(() => {
                loadMoreLockRef.current = false
            }, 150)
        }
    }

    // Keep auth token for summary refresh
    const [authToken, setAuthToken] = useState<string | null>(null)

    // Filter State
    const [q, setQ] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('All')
    const [sortBy, setSortBy] = useState<'latest' | 'oldest' | 'amount_desc' | 'amount_asc'>('latest')

    // Add Modal State
    const [addOpen, setAddOpen] = useState(false)
    const [addAmount, setAddAmount] = useState('')
    const [addCategory, setAddCategory] = useState('Food')
    const [addNewCategory, setAddNewCategory] = useState('')
    const [addDesc, setAddDesc] = useState('')
    const [addDate, setAddDate] = useState<string>(toISODate(now))

    // New columns (booleans)
    const [addIsDating, setAddIsDating] = useState(false)
    const [addIsForPartner, setAddIsForPartner] = useState(false)

    // Edit Modal State
    const [editOpen, setEditOpen] = useState(false)
    const [editId, setEditId] = useState<string | null>(null)
    const [editAmount, setEditAmount] = useState('')
    const [editCategory, setEditCategory] = useState('Food')
    const [editNewCategory, setEditNewCategory] = useState('')
    const [editDesc, setEditDesc] = useState('')
    const [editDate, setEditDate] = useState<string>(toISODate(now))
    const [editIsDating, setEditIsDating] = useState(false)
    const [editIsForPartner, setEditIsForPartner] = useState(false)

    const [saving, setSaving] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    // Delete confirm modal (mobile-friendly)
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<ExpenseRow | null>(null)

    const [categories, setCategories] = useState<string[]>(['Others'])

    // --- Computed Logic ---
    const monthLabel =
        yearIsAll
            ? 'All time'
            : monthIsAll
                ? `All months ${selectedYear}`
                : dayIsAll
                    ? `${MONTHS[Number(selectedMonth) - 1]} ${selectedYear}`
                    : `${pad2(Number(selectedDay))} ${MONTHS[Number(selectedMonth) - 1]} ${selectedYear}`

    const filteredRows = useMemo(() => {
        const query = q.trim().toLowerCase()
        let list = [...rows]

        if (categoryFilter !== 'All') list = list.filter(r => r.category === categoryFilter)

        if (query) {
            list = list.filter(r => {
                const hay = `${r.category} ${r.description ?? ''}`.toLowerCase()
                return hay.includes(query)
            })
        }

        if (sortBy === 'latest') list.sort((a, b) => (a.spent_at < b.spent_at ? 1 : a.spent_at > b.spent_at ? -1 : 0))
        else if (sortBy === 'oldest') list.sort((a, b) => (a.spent_at > b.spent_at ? 1 : a.spent_at < b.spent_at ? -1 : 0))
        else if (sortBy === 'amount_desc') list.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
        else list.sort((a, b) => (a.amount ?? 0) - (b.amount ?? 0))

        return list
    }, [rows, q, categoryFilter, sortBy])

    // --- Async Functions ---

    async function fetchAvailableMonths(accessToken: string) {
        const res = await fetch('/api/expenses/summary?action=availableMonths', { headers: { Authorization: `Bearer ${accessToken}` } })
        const json = await res.json()
        let months = (res.ok && Array.isArray(json?.months)) ? json.months : []
        if (months.length === 0) months = [{ year: now.getFullYear(), month: now.getMonth() + 1 }]
        setAvailableMonths(months)

        // Enforce All-selection rules
        if (selectedYear === 'all') {
            if (selectedMonth !== 'all') setSelectedMonth('all')
            if (selectedDay !== 'all') setSelectedDay('all')
            setAvailableDays([])
            return true
        }

        // Validate year exists
        const y = Number(selectedYear)
        const yearExists = months.some((m: any) => m.year === y)
        if (!yearExists) {
            const last = months[months.length - 1]
            setSelectedYear(String(last.year))
            setSelectedMonth(String(last.month))
            setSelectedDay('all')
            setAvailableDays([])
            return false
        }

        if (selectedMonth === 'all') {
            if (selectedDay !== 'all') setSelectedDay('all')
            setAvailableDays([])
            return true
        }

        // Validate specific year+month exists
        const mo = Number(selectedMonth)
        const monthExists = months.some((m: any) => m.year === y && m.month === mo)
        if (!monthExists) {
            const lastForYear = months.filter((m: any) => m.year === y).slice(-1)[0] ?? months[months.length - 1]
            setSelectedMonth(String(lastForYear.month))
            setSelectedDay('all')
            setAvailableDays([])
            return false
        }

        return true
    }

    async function fetchAvailableDays(accessToken: string) {
        if (selectedYear === 'all' || selectedMonth === 'all') {
            setAvailableDays([])
            if (selectedDay !== 'all') setSelectedDay('all')
            return true
        }

        const res = await fetch(
            `/api/expenses/summary?action=availableDays&year=${selectedYear}&month=${pad2(Number(selectedMonth))}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const json = await res.json()

        const days: number[] = res.ok && Array.isArray(json?.days) ? json.days : []
        setAvailableDays(days)

        if (selectedDay !== 'all') {
            const d = Number(selectedDay)
            if (!days.includes(d)) {
                setSelectedDay('all')
                return false
            }
        }

        return true
    }

    function getRangeISO() {
        let startISO: string | null = null
        let endISO: string | null = null

        // all years => no date filter (no start/end)
        if (selectedYear !== 'all' && selectedMonth === 'all') {
            const y = Number(selectedYear)
            const start = new Date(Date.UTC(y, 0, 1))
            const end = new Date(Date.UTC(y + 1, 0, 1))
            startISO = start.toISOString().slice(0, 10)
            endISO = end.toISOString().slice(0, 10)
        } else if (selectedYear !== 'all' && selectedMonth !== 'all' && selectedDay === 'all') {
            const y = Number(selectedYear)
            const m = Number(selectedMonth)
            const start = new Date(Date.UTC(y, m - 1, 1))
            const end = new Date(Date.UTC(y, m, 1))
            startISO = start.toISOString().slice(0, 10)
            endISO = end.toISOString().slice(0, 10)
        } else if (selectedYear !== 'all' && selectedMonth !== 'all' && selectedDay !== 'all') {
            const y = Number(selectedYear)
            const m = Number(selectedMonth)
            const d = Number(selectedDay)
            const start = new Date(Date.UTC(y, m - 1, d))
            const end = new Date(Date.UTC(y, m - 1, d + 1))
            startISO = start.toISOString().slice(0, 10)
            endISO = end.toISOString().slice(0, 10)
        }

        return { startISO, endISO }
    }

    async function fetchTotalCountForRange(uid: string) {
        const { startISO, endISO } = getRangeISO()

        let query: any = supabase
            .from('expenses')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', uid)

        if (startISO && endISO) query = query.gte('spent_at', startISO).lt('spent_at', endISO)
        if (categoryFilter !== 'All') query = query.eq('category', categoryFilter)

        const { count, error } = await query
        if (error) {
            // keep old count if error
            return
        }
        setTotalCount(Number(count) || 0)
    }

    async function fetchExpensesPage(uid: string, pageIndex: number, mode: 'replace' | 'append') {
        if (loadingMore) return
        setLoadingMore(true)

        const { startISO, endISO } = getRangeISO()

        let query = supabase
            .from('expenses')
            .select('*')
            .eq('user_id', uid)

        if (startISO && endISO) query = query.gte('spent_at', startISO).lt('spent_at', endISO)

        const from = pageIndex * PAGE_SIZE
        const to = from + PAGE_SIZE - 1

        const { data, error } = await query
            .order('spent_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)

        if (error) {
            setErrorMsg(error.message)
            if (mode === 'replace') setRows([])
            setHasMore(false)
            setLoadingMore(false)
            return
        }

        const list = (data ?? []).map((r: any) => ({ ...r, amount: Number(r.amount) }))

        if (mode === 'replace') setRows(list)
        else setRows((prev) => [...prev, ...list])

        setPage(pageIndex)
        setHasMore(list.length === PAGE_SIZE)
        setLoadingMore(false)
    }

    async function fetchTotalFromSummaryApi(accessToken: string) {
        const monthParam = selectedMonth === 'all' ? 'all' : pad2(Number(selectedMonth))
        const dayParam = selectedDay === 'all' ? 'all' : pad2(Number(selectedDay))

        const res = await fetch(
            `/api/expenses/summary?year=${selectedYear}&month=${monthParam}&day=${dayParam}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const json = await res.json()

        if (!res.ok) {
            setMonthlyTotal(0)
            return
        }
        setMonthlyTotal(Number(json.total) || 0)
    }

    async function fetchCategoriesFromApi(accessToken: string) {
        const res = await fetch('/api/categories', { headers: { Authorization: `Bearer ${accessToken}` } })
        if (!res.ok) { setCategories(['Others']); return }
        const json = await res.json()
        const apiNames = (json.categories || []).map((c: any) => normalizeCategoryName(String(c.name))).filter((s: string) => s.length > 0)
        setCategories(Array.from(new Set([...apiNames, 'Others'])))
    }

    useEffect(() => {
        const load = async () => {
            setErrorMsg(null); setLoading(true)

            if (!supabase) {
                setLoading(false)
                setErrorMsg('Missing Supabase env vars.')
                return
            }

            const { data: sessionRes } = await supabase.auth.getSession()
            const accessToken = sessionRes.session?.access_token
            const { data: userRes } = await supabase.auth.getUser()

            if (!accessToken || !userRes.user) { setLoading(false); setErrorMsg('Not logged in.'); return }

            setUserId(userRes.user.id)
            setUserName(userRes.user.user_metadata?.display_name ?? userRes.user.email?.split('@')[0] ?? 'User')

            setAuthToken(accessToken)

            await fetchCategoriesFromApi(accessToken)
            if (await fetchAvailableMonths(accessToken)) {
                await fetchAvailableDays(accessToken)

                setHasMore(true)
                setPage(0)

                await fetchTotalFromSummaryApi(accessToken)
                await fetchExpensesPage(userRes.user.id, 0, 'replace')
                await fetchTotalCountForRange(userRes.user.id)

                setTimeout(() => {
                    tryLoadMore()
                }, 0)

                await fetchCategoriesFromApi(accessToken)
            }
            setLoading(false)
        }
        load()
    }, [selectedYear, selectedMonth, selectedDay])

    useEffect(() => {
        if (!userId) return
        // refresh total count for the current range + category filter
        fetchTotalCountForRange(userId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, selectedYear, selectedMonth, selectedDay, categoryFilter])

    useEffect(() => {
        if (!userId) return
        if (!hasMore) return

        const rootEl = scrollRef.current
        const targetEl = loadMoreRef.current
        if (!rootEl || !targetEl) return

        const obs = new IntersectionObserver(
            (entries) => {
                const e = entries[0]
                if (!e) return

                // Trigger early + avoid double load
                if (e.isIntersecting && hasMore && !loadingMore) {
                    tryLoadMore()
                }
            },
            // IMPORTANT: rootMargin triggers earlier (before bottom)
            { root: rootEl, threshold: 0.1, rootMargin: '200px' }
        )

        obs.observe(targetEl)
        return () => obs.disconnect()
    }, [userId, hasMore, loadingMore, page, selectedYear, selectedMonth, selectedDay])

    const openAdd = () => {
        setAddAmount('')
        setAddCategory(categories.find((c) => c !== 'Others') ?? 'Others')
        setAddNewCategory('')

        const y = selectedYear === 'all' ? now.getFullYear() : Number(selectedYear)
        const m = selectedMonth === 'all' ? now.getMonth() + 1 : Number(selectedMonth)

        setAddDesc('')
        setAddDate(toISODate(new Date(y, m - 1, Math.min(now.getDate(), 28))))

        // reset new booleans
        setAddIsDating(false)
        setAddIsForPartner(false)

        setErrorMsg(null)
        setAddOpen(true)
    }

    const openEdit = (row: ExpenseRow) => {
        setEditId(row.id)
        setEditAmount(String(row.amount ?? ''))
        setEditCategory(categories.includes(row.category) ? row.category : 'Others')
        setEditNewCategory(categories.includes(row.category) ? '' : row.category)
        setEditDesc(row.description ?? '')
        setEditDate(row.spent_at)
        setEditIsDating(Boolean(row.is_dating))
        setEditIsForPartner(Boolean(row.is_for_partner))
        setErrorMsg(null)
        setEditOpen(true)
    }

    const updateExpense = async () => {
        if (!userId) return
        if (!editId) return

        const amt = Number(editAmount)
        if (!Number.isFinite(amt) || amt <= 0) {
            setErrorMsg('Need a valid amount!')
            return
        }

        let finalCategory = editCategory.trim()
        if (finalCategory === 'Others') {
            const nc = normalizeCategoryName(editNewCategory)
            if (!nc) {
                setErrorMsg('Name your new category!')
                return
            }
            finalCategory = nc
        }

        setSaving(true)
        const { error } = await supabase
            .from('expenses')
            .update({
                amount: amt,
                category: finalCategory,
                description: editDesc.trim() || null,
                spent_at: editDate,
                is_dating: editIsDating,
                is_for_partner: editIsForPartner,
            })
            .eq('id', editId)
            .eq('user_id', userId)

        if (error) {
            setErrorMsg(error.message)
            setSaving(false)
            return
        }

        // If user typed a new category via Others, best-effort add it to expense_categories
        if (editCategory === 'Others') {
            const { error: catErr } = await supabase
                .from('expense_categories')
                .insert({ user_id: userId, name: finalCategory })
            if (catErr) {
                // ignore duplicates / RLS etc.
            }
        }

        setCategories((prev) => Array.from(new Set([...prev.filter((c) => c !== 'Others'), finalCategory, 'Others'])))
        setEditOpen(false)

        // Refresh list + totals
        setHasMore(true)
        setPage(0)
        await fetchExpensesPage(userId, 0, 'replace')
        await fetchTotalCountForRange(userId)
        if (authToken) await fetchTotalFromSummaryApi(authToken)

        setSaving(false)
    }

    const addExpense = async () => {
        if (!userId) return
        const amt = Number(addAmount)
        if (!Number.isFinite(amt) || amt <= 0) { setErrorMsg('Need a valid amount!'); return }

        let finalCategory = addCategory.trim()
        if (finalCategory === 'Others') {
            const nc = normalizeCategoryName(addNewCategory)
            if (!nc) { setErrorMsg('Name your new category!'); return }
            finalCategory = nc
        }

        setSaving(true)
        const { error } = await supabase.from('expenses').insert({
            user_id: userId,
            amount: amt,
            category: finalCategory,
            description: addDesc.trim() || null,
            spent_at: addDate,
            is_dating: addIsDating,
            is_for_partner: addIsForPartner,
        })

        if (error) setErrorMsg(error.message)
        else {
            if (addCategory === 'Others') {
                const { error: catErr } = await supabase
                    .from('expense_categories')
                    .insert({ user_id: userId, name: finalCategory })

                // Best-effort: ignore errors (duplicate / RLS) so UX is not blocked
                if (catErr) {
                    // console.warn(catErr)
                }
            }
            setCategories((prev) => Array.from(new Set([...prev.filter((c) => c !== 'Others'), finalCategory, 'Others'])))
            setAddOpen(false)
            setHasMore(true)
            setPage(0)
            await fetchExpensesPage(userId, 0, 'replace')
            await fetchTotalCountForRange(userId)
            if (authToken) await fetchTotalFromSummaryApi(authToken)
        }
        setSaving(false)
    }

    const requestDeleteExpense = (row: ExpenseRow) => {
        setDeleteTarget(row)
        setErrorMsg(null)
        setDeleteOpen(true)
    }

    const confirmDeleteExpense = async () => {
        const row = deleteTarget
        if (!row) return

        setSaving(true)
        const { error } = await supabase.from('expenses').delete().eq('id', row.id)

        if (error) {
            setErrorMsg(error.message)
            setSaving(false)
            setDeleteOpen(false)
            setDeleteTarget(null)
            return
        }

        if (userId) {
            setHasMore(true)
            setPage(0)
            await fetchExpensesPage(userId, 0, 'replace')
            await fetchTotalCountForRange(userId)
            if (authToken) await fetchTotalFromSummaryApi(authToken)
        }

        setSaving(false)
        setDeleteOpen(false)
        setDeleteTarget(null)
    }


    // ==========================================
    // 2. NEW CUTE UI RENDER (Theme Updated)
    // ==========================================

    if (loading) {
        return (
            <AppShell title="Expenses" subtitle="Loading...">
                <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
                    <div className="animate-bounce text-5xl mb-4">🐻</div>
                    <p className="font-bold text-stone-400">Loading your snacks...</p>
                </div>
            </AppShell>
        )
    }

    return (
        <AppShell title="Expenses" subtitle="">
            <div className="space-y-6 pb-24 min-h-screen bg-[#FFF9F5] mx-6">

                {/* 1. Header & Add Button */}
                <div className="flex  md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-stone-700 tracking-tight">Receipts 🧾</h1>
                        <p className="text-stone-400 font-bold text-sm">Keep track of every penny!</p>
                    </div>
                    <button
                        onClick={openAdd}
                        className="group flex items-center justify-center gap-2 bg-rose-400 hover:bg-rose-500 text-white px-6 py-3 rounded-2xl shadow-[0_4px_14px_rgba(251,113,133,0.4)] transition-all active:scale-95"
                    >
                        <span className="text-xl group-hover:rotate-90 transition-transform duration-300">✨</span>
                        <span className="font-bold">Add New Expense</span>
                    </button>
                </div>

                {/* 2. Monthly Summary Card */}
                <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-stone-100 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="text-center md:text-left">
                        <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">Total for {monthLabel}</p>
                        <p className="text-4xl font-black text-stone-700 mt-1">
                            <span className="text-xl text-stone-300 mr-1">RM</span>
                            {monthlyTotal.toFixed(2)}
                        </p>
                    </div>

                    {/* Cute Date Selectors (All supported) */}
                    <div className="grid grid-cols-3 gap-2 w-full md:w-auto">
                        <CuteSelect
                            label="Year"
                            value={selectedYear}
                            onChange={(e: any) => {
                                const v = e.target.value
                                setSelectedYear(v)
                                if (v === 'all') {
                                    setSelectedMonth('all')
                                    setSelectedDay('all')
                                }
                            }}
                        >
                            <option value="all">All</option>
                            {Array.from(new Set(availableMonths.map((m) => m.year)))
                                .sort((a, b) => b - a)
                                .map((y) => (
                                    <option key={y} value={String(y)}>
                                        {y}
                                    </option>
                                ))}
                        </CuteSelect>

                        <CuteSelect
                            label="Month"
                            value={selectedMonth}
                            onChange={(e: any) => {
                                const v = e.target.value
                                setSelectedMonth(v)
                                if (v === 'all') setSelectedDay('all')
                            }}
                        >
                            <option value="all">All</option>
                            {availableMonths
                                .filter((m) => m.year === Number(selectedYear))
                                .sort((a, b) => a.month - b.month)
                                .map((m) => (
                                    <option key={`${m.year}-${m.month}`} value={String(m.month)}>
                                        {MONTHS[m.month - 1]}
                                    </option>
                                ))}
                        </CuteSelect>

                        <CuteSelect
                            label="Day"
                            value={selectedDay}
                            onChange={(e: any) => setSelectedDay(e.target.value)}
                        >
                            <option value="all">All</option>
                            {availableDays.map((d) => (
                                <option key={d} value={String(d)}>
                                    {pad2(d)}
                                </option>
                            ))}
                        </CuteSelect>
                    </div>
                </div>

                {/* 3. Filters Toolbar */}
                <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-stone-100 space-y-4 md:space-y-0 md:flex md:gap-4">
                    <div className="flex-1">
                        <CuteInput
                            placeholder="🔍 Search (e.g. Sushi)"
                            value={q}
                            onChange={(e: any) => setQ(e.target.value)}
                        />
                    </div>
                    <div className="flex-1">
                        <CuteSelect value={categoryFilter} onChange={(e: any) => setCategoryFilter(e.target.value)}>
                            <option value="All">All Categories</option>
                            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                        </CuteSelect>
                    </div>
                    <div className="flex-1">
                        <CuteSelect value={sortBy} onChange={(e: any) => setSortBy(e.target.value as any)}>
                            <option value="latest">📅 Latest First</option>
                            <option value="oldest">📅 Oldest First</option>
                            <option value="amount_desc">💰 High Amount</option>
                            <option value="amount_asc">💰 Low Amount</option>
                        </CuteSelect>
                    </div>
                </div>

                {/* 4. Error Message Bubble */}
                {errorMsg && (
                    <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-4 flex items-center gap-3 text-red-500 animate-pulse">
                        <span className="text-2xl">💢</span>
                        <span className="font-bold text-sm">{errorMsg}</span>
                    </div>
                )}

                {/* 5. The List (Ticket Style) */}
                <div className="space-y-3">
                    <div className="flex justify-between items-end px-3 sticky top-0 z-[1] bg-[#FFF9F5] pt-1 pb-2">
                        <h2 className="font-black text-stone-700 text-lg">Transaction History</h2>
                        <span className="text-xs font-bold text-rose-500 bg-rose-50 px-3 py-1 rounded-full">
                            {totalCount} Items
                        </span>
                    </div>

                    <div
                        ref={scrollRef}
                        className="h-[60vh] overflow-y-auto overscroll-contain pr-1"
                        onScroll={() => {
                            const el = scrollRef.current
                            if (!el) return
                            const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 220
                            if (nearBottom) {
                                tryLoadMore()
                            }
                        }}
                    >
                        {filteredRows.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 text-center opacity-60">
                                <div className="text-6xl mb-4 grayscale">🍃</div>
                                <p className="font-bold text-stone-400 text-lg">Nothing to show here!</p>
                                <p className="text-sm text-stone-300 font-bold mt-1">Maybe try adding a snack?</p>
                            </div>
                        ) : (
                            <div className="grid gap-3">
                                {filteredRows.map((r) => (
                                    <div
                                        key={r.id}
                                        className="group bg-white rounded-3xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] border-2 border-stone-100 hover:border-rose-200 transition-all duration-200"
                                    >
                                        <div className="flex items-stretch gap-3">
                                            {/* Icon */}
                                            <div
                                                className="w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center text-xl shadow-inner"
                                                style={{ backgroundColor: colorForCategory(r.category), color: 'white' }}
                                            >
                                                {r.category.charAt(0).toUpperCase()}
                                            </div>

                                            {/* Main content */}
                                            <div className="min-w-0 flex-1">
                                                {/* Row 1: Category + Amount */}
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="font-black text-stone-800 text-base leading-tight truncate">
                                                            {r.category}
                                                        </p>
                                                    </div>


                                                </div>

                                                {/* Row 2: Badges + Date */}
                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                    {r.is_dating ? (
                                                        <span className="text-[11px] font-black text-rose-700 bg-rose-50 px-3 py-1 rounded-xl border border-rose-100">
                                                            💞 Dating
                                                        </span>
                                                    ) : null}

                                                    {r.is_for_partner ? (
                                                        <span className="text-[11px] font-black text-amber-800 bg-amber-50 px-3 py-1 rounded-xl border border-amber-100">
                                                            🎁 Partner
                                                        </span>
                                                    ) : null}

                                                    <span className="text-[11px] font-black text-stone-500 bg-stone-50 px-3 py-1 rounded-xl border border-stone-100">
                                                        📅 {r.spent_at}
                                                    </span>
                                                </div>

                                                {/* Row 3: Description */}
                                                <p className="mt-2 text-sm font-bold text-stone-500 leading-snug break-words">
                                                    {r.description || 'No description'}
                                                </p>
                                            </div>

                                            {/* Actions (bigger tap targets) */}
                                            <div className="flex flex-col items-end justify-between min-h-full pl-1">
                                                <p className="font-black text-stone-800 whitespace-nowrap text-xl leading-none">
                                                    <span className="text-xs text-stone-400 mr-1">RM</span>
                                                    {r.amount.toFixed(2)}
                                                </p>
                                                <div className="flex gap-4 justify-end items-end">
                                                    <button
                                                        onClick={() => openEdit(r)}
                                                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 transition-colors active:scale-[0.98]"
                                                        title="Edit"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth="2.5"
                                                                d="M16.862 3.487a2.25 2.25 0 013.182 3.182L8.25 18.463 4 19.5l1.037-4.25L16.862 3.487z"
                                                            />
                                                        </svg>
                                                    </button>

                                                    <button
                                                        onClick={() => requestDeleteExpense(r)}
                                                        className="w-10 h-10 rounded-2xl flex items-center justify-center bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 transition-colors active:scale-[0.98]"
                                                        title="Delete"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth="2.5"
                                                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                            />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Infinite scroll sentinel */}
                        {rows.length > 0 && (
                            <div ref={loadMoreRef} className="h-16 flex flex-col items-center justify-center gap-2">
                                {hasMore ? (
                                    <>
                                        <span className="text-xs font-bold text-stone-400">
                                            {loadingMore ? 'Loading more... ✨' : 'Scroll for more...'}
                                        </span>

                                        {!loadingMore && (
                                            <button
                                                type="button"
                                                onClick={() => tryLoadMore()}
                                                className="text-[11px] font-black text-rose-600 bg-rose-50 px-3 py-2 rounded-full border border-rose-100 active:scale-95"
                                            >
                                                Load more
                                            </button>
                                        )}
                                    </>
                                ) : (
                                    <span className="text-xs font-bold text-stone-300">--- bottom ---</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* 6. ADD MODAL (Bubu Dudu Style) */}
                {addOpen && (
                    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                        {/* Overlay */}
                        <div
                            className="absolute inset-0 bg-stone-900/30 backdrop-blur-sm transition-opacity"
                            onClick={() => !saving && setAddOpen(false)}
                        />

                        {/* Card */}
                        <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-6 animate-in zoom-in-95 duration-200">

                            {/* Modal Header */}
                            <div className="flex justify-between items-center mb-6 pl-1">
                                <div>
                                    <h3 className="text-2xl font-black text-stone-700">Add Expense ✨</h3>
                                    <p className="text-xs font-bold text-stone-400">What did you buy today?</p>
                                </div>
                                <button
                                    onClick={() => !saving && setAddOpen(false)}
                                    className="w-10 h-10 rounded-full bg-stone-50 text-stone-400 hover:bg-rose-100 hover:text-rose-500 flex items-center justify-center font-bold transition-colors text-lg"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Form Fields */}
                            <div className="space-y-4">
                                <CuteInput
                                    label="Amount (RM)"
                                    value={addAmount}
                                    onChange={(e: any) => setAddAmount(e.target.value)}
                                    placeholder="0.00"
                                    inputMode="decimal"
                                    type="number"
                                />

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <CuteSelect label="Category" value={addCategory} onChange={(e: any) => setAddCategory(e.target.value)}>
                                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </CuteSelect>
                                    <div className="sm:max-w-[180px]">
                                        <CuteInput
                                            label="Date"
                                            type="date"
                                            value={addDate}
                                            onChange={(e: any) => setAddDate(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Conditional Input for 'Others' */}
                                {addCategory === 'Others' && (
                                    <div className="animate-in slide-in-from-top-2 duration-200">
                                        <CuteInput
                                            label="New Category Name"
                                            value={addNewCategory}
                                            onChange={(e: any) => setAddNewCategory(e.target.value)}
                                            placeholder="e.g. Bubble Tea"
                                        />
                                    </div>
                                )}

                                {/* New toggles */}
                                <div className="grid grid-cols-1 gap-3">
                                    <CuteToggle
                                        label="Dating expense?"
                                        emoji="💞"
                                        value={addIsDating}
                                        onChange={setAddIsDating}
                                        hint="Turn on if this is a date / couple activity"
                                    />
                                    <CuteToggle
                                        label="For him/her?"
                                        emoji="🎁"
                                        value={addIsForPartner}
                                        onChange={setAddIsForPartner}
                                        hint="Turn on if this spending is for your partner"
                                    />
                                </div>

                                <CuteInput
                                    label="Description (Optional)"
                                    value={addDesc}
                                    onChange={(e: any) => setAddDesc(e.target.value)}
                                    placeholder="Brief note..."
                                />

                                {/* Action Buttons */}
                                <div className="pt-4 flex gap-3">
                                    <button
                                        onClick={() => !saving && setAddOpen(false)}
                                        disabled={saving}
                                        className="flex-1 py-4 rounded-2xl bg-stone-100 text-stone-500 font-bold hover:bg-stone-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={addExpense}
                                        disabled={saving}
                                        className="flex-1 py-4 rounded-2xl bg-rose-400 text-white font-bold hover:bg-rose-500 shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {saving ? (
                                            <><span>⏳</span> Saving...</>
                                        ) : (
                                            <><span>💖</span> Save It!</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 7. EDIT MODAL (Bubu Dudu Style) */}
                {editOpen && (
                    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
                        {/* Overlay */}
                        <div
                            className="absolute inset-0 bg-stone-900/30 backdrop-blur-sm transition-opacity"
                            onClick={() => !saving && setEditOpen(false)}
                        />

                        {/* Card */}
                        <div className="relative w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-6 animate-in zoom-in-95 duration-200">
                            {/* Modal Header */}
                            <div className="flex justify-between items-center mb-6 pl-1">
                                <div>
                                    <h3 className="text-2xl font-black text-stone-700">Edit Expense ✏️</h3>
                                    <p className="text-xs font-bold text-stone-400">Update the details</p>
                                </div>
                                <button
                                    onClick={() => !saving && setEditOpen(false)}
                                    className="w-10 h-10 rounded-full bg-stone-50 text-stone-400 hover:bg-rose-100 hover:text-rose-500 flex items-center justify-center font-bold transition-colors text-lg"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Form Fields */}
                            <div className="space-y-4">
                                <CuteInput
                                    label="Amount (RM)"
                                    value={editAmount}
                                    onChange={(e: any) => setEditAmount(e.target.value)}
                                    placeholder="0.00"
                                    inputMode="decimal"
                                    type="number"
                                />

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <CuteSelect label="Category" value={editCategory} onChange={(e: any) => setEditCategory(e.target.value)}>
                                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </CuteSelect>
                                    <div className="sm:max-w-[180px]">
                                        <CuteInput
                                            label="Date"
                                            type="date"
                                            value={editDate}
                                            onChange={(e: any) => setEditDate(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Conditional Input for 'Others' */}
                                {editCategory === 'Others' && (
                                    <div className="animate-in slide-in-from-top-2 duration-200">
                                        <CuteInput
                                            label="New Category Name"
                                            value={editNewCategory}
                                            onChange={(e: any) => setEditNewCategory(e.target.value)}
                                            placeholder="e.g. Bubble Tea"
                                        />
                                    </div>
                                )}

                                {/* Toggles */}
                                <div className="grid grid-cols-1 gap-3">
                                    <CuteToggle
                                        label="Dating expense?"
                                        emoji="💞"
                                        value={editIsDating}
                                        onChange={setEditIsDating}
                                        hint="Turn on if this is a date / couple activity"
                                    />
                                    <CuteToggle
                                        label="For him/her?"
                                        emoji="🎁"
                                        value={editIsForPartner}
                                        onChange={setEditIsForPartner}
                                        hint="Turn on if this spending is for your partner"
                                    />
                                </div>

                                <CuteInput
                                    label="Description (Optional)"
                                    value={editDesc}
                                    onChange={(e: any) => setEditDesc(e.target.value)}
                                    placeholder="Brief note..."
                                />

                                {/* Action Buttons */}
                                <div className="pt-4 flex gap-3">
                                    <button
                                        onClick={() => !saving && setEditOpen(false)}
                                        disabled={saving}
                                        className="flex-1 py-4 rounded-2xl bg-stone-100 text-stone-500 font-bold hover:bg-stone-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={updateExpense}
                                        disabled={saving}
                                        className="flex-1 py-4 rounded-2xl bg-amber-400 text-stone-800 font-bold hover:bg-amber-500 shadow-lg shadow-amber-200 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {saving ? (
                                            <><span>⏳</span> Saving...</>
                                        ) : (
                                            <><span>✅</span> Save Changes</>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 8. DELETE CONFIRM MODAL (Mobile-friendly) */}
                {deleteOpen && (
                    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
                        {/* Overlay */}
                        <div
                            className="absolute inset-0 bg-stone-900/35 backdrop-blur-sm transition-opacity"
                            onClick={() => !saving && setDeleteOpen(false)}
                        />

                        {/* Card */}
                        <div className="relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-2xl p-6 animate-in zoom-in-95 duration-200">
                            <div className="flex items-start gap-4 mb-4">
                                <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center text-2xl">
                                    🗑️
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-xl font-black text-stone-700">Delete this expense?</h3>
                                    <p className="text-xs font-bold text-stone-400 mt-1">
                                        This action cannot be undone.
                                    </p>
                                </div>
                            </div>

                            {/* Preview */}
                            <div className="bg-stone-50 border border-stone-100 rounded-2xl p-4 mb-6">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="font-black text-stone-700 truncate">
                                            {deleteTarget?.category ?? 'Expense'}
                                        </div>
                                        <div className="text-xs font-bold text-stone-400 mt-1 truncate">
                                            {deleteTarget?.description ?? 'No description'}
                                        </div>
                                        <div className="text-[11px] font-bold text-stone-400 mt-2">
                                            {deleteTarget?.spent_at ?? ''}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-stone-400">RM</div>
                                        <div className="text-2xl font-black text-stone-700">
                                            {(deleteTarget?.amount ?? 0).toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Buttons (big tap targets) */}
                            <div className="flex flex-col gap-3">
                                <button
                                    type="button"
                                    onClick={() => !saving && setDeleteOpen(false)}
                                    disabled={saving}
                                    className="w-full py-4 rounded-2xl bg-stone-100 text-stone-600 font-black hover:bg-stone-200 transition-colors active:scale-[0.99] disabled:opacity-50"
                                >
                                    Keep it
                                </button>

                                <button
                                    type="button"
                                    onClick={confirmDeleteExpense}
                                    disabled={saving}
                                    className="w-full py-4 rounded-2xl bg-rose-500 text-stone-800 font-black hover:bg-rose-600 shadow-lg shadow-rose-200 transition-all active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {saving ? (
                                        <><span>⏳</span> Deleting...</>
                                    ) : (
                                        <><span>🗑️</span> Yes, delete</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </AppShell>
    )
}