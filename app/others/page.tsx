'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '../components/AppShell'

type CategoryTotal = { category: string; amount: number }
type ExpenseRow = {
    id: string
    user_id: string
    amount: number
    category: string
    description?: string | null
    spent_at: string // YYYY-MM-DD
    created_at?: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pad2 = (n: number) => String(n).padStart(2, '0')

function formatDate(iso: string) {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
}

function emojiForCategory(category: string) {
    const c = String(category || '').toLowerCase()
    if (c.includes('food') || c.includes('meal') || c.includes('lunch') || c.includes('dinner')) return '🍔'
    if (c.includes('transport') || c.includes('grab') || c.includes('uber') || c.includes('petrol') || c.includes('fuel')) return '🚗'
    if (c.includes('shopping') || c.includes('grocery') || c.includes('mart')) return '🛍️'
    if (c.includes('entertain') || c.includes('game') || c.includes('movie') || c.includes('netflix')) return '🎮'
    if (c.includes('bill') || c.includes('utility') || c.includes('electric') || c.includes('water')) return '🧾'
    if (c.includes('health') || c.includes('medical') || c.includes('clinic') || c.includes('hospital')) return '🩺'
    if (c.includes('gift')) return '🎁'
    return '💗'
}

function CuteSelect(props: {
    label?: string
    value: string
    onChange: (e: any) => void
    children: React.ReactNode
}) {
    return (
        <label className="block">
            {props.label ? (
                <div className="text-[10px] font-black uppercase tracking-widest text-stone-400 px-1 mb-1">
                    {props.label}
                </div>
            ) : null}
            <select
                value={props.value}
                onChange={props.onChange}
                className="w-full bg-white rounded-2xl px-4 py-3 border border-stone-100 font-black text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            >
                {props.children}
            </select>
        </label>
    )
}

export default function OthersPage() {
    const supabase = useMemo(() => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
        return createClient(url, key)
    }, [])

    const now = new Date()

    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const [userId, setUserId] = useState<string | null>(null)
    const [authToken, setAuthToken] = useState<string | null>(null)

    // Selection State (support "all")
    const [availableMonths, setAvailableMonths] = useState<{ year: number; month: number }[]>([])
    const [availableDays, setAvailableDays] = useState<number[]>([])

    const [selectedYear, setSelectedYear] = useState<string>(String(now.getFullYear())) // or 'all'
    const [selectedMonth, setSelectedMonth] = useState<string>(String(now.getMonth() + 1)) // '1'..'12' or 'all'
    const [selectedDay, setSelectedDay] = useState<string>('all') // '1'..'31' or 'all'

    const yearIsAll = selectedYear === 'all'
    const monthIsAll = selectedMonth === 'all'
    const dayIsAll = selectedDay === 'all'

    const monthLabel =
        yearIsAll
            ? 'All time'
            : monthIsAll
                ? `All months ${selectedYear}`
                : dayIsAll
                    ? `${MONTHS[Number(selectedMonth) - 1]} ${selectedYear}`
                    : `${pad2(Number(selectedDay))} ${MONTHS[Number(selectedMonth) - 1]} ${selectedYear}`

    // Summary
    const [total, setTotal] = useState(0)
    const [categories, setCategories] = useState<CategoryTotal[]>([])

    // Infinite scroll
    const PAGE_SIZE = 10
    const [page, setPage] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [rows, setRows] = useState<ExpenseRow[]>([])
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const loadMoreRef = useRef<HTMLDivElement | null>(null)
    const loadSeqRef = useRef(0)

    async function apiFetch(path: string, token: string) {
        const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? 'Request failed')
        return json
    }

    async function fetchAvailableMonths(token: string) {
        const json = await apiFetch(`/api/expenses/summary?action=availableMonths&scope=other`, token)
        const months = Array.isArray(json?.months) ? json.months : []
        setAvailableMonths(months)

        if (months.length === 0) return false

        // enforce selection validity
        if (selectedYear === 'all') {
            if (selectedMonth !== 'all') setSelectedMonth('all')
            if (selectedDay !== 'all') setSelectedDay('all')
            setAvailableDays([])
            return true
        }

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

    async function fetchAvailableDays(token: string) {
        if (selectedYear === 'all' || selectedMonth === 'all') {
            setAvailableDays([])
            if (selectedDay !== 'all') setSelectedDay('all')
            return true
        }

        const json = await apiFetch(
            `/api/expenses/summary?action=availableDays&scope=other&year=${selectedYear}&month=${pad2(Number(selectedMonth))}`,
            token
        )
        const days = Array.isArray(json?.days) ? json.days : []
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

    async function fetchSummary(token: string) {
        const monthParam = selectedMonth === 'all' ? 'all' : pad2(Number(selectedMonth))
        const dayParam = selectedDay === 'all' ? 'all' : pad2(Number(selectedDay))
        const json = await apiFetch(
            `/api/expenses/summary?scope=other&year=${selectedYear}&month=${monthParam}&day=${dayParam}`,
            token
        )
        setTotal(Number(json?.total) || 0)
        setCategories(Array.isArray(json?.categories) ? json.categories : [])
    }

    async function fetchTransactionsPage(
        token: string,
        pageIndex: number,
        mode: 'replace' | 'append',
        uidOverride?: string
    ) {
        const uid = uidOverride ?? userId
        if (!uid) return
        if (loadingMore) return

        setLoadingMore(true)
        try {
            const monthParam = selectedMonth === 'all' ? 'all' : pad2(Number(selectedMonth))
            const dayParam = selectedDay === 'all' ? 'all' : pad2(Number(selectedDay))

            const json = await apiFetch(
                `/api/expenses/summary?action=transactions&scope=other&year=${selectedYear}&month=${monthParam}&day=${dayParam}&page=${pageIndex}&limit=${PAGE_SIZE}`,
                token
            )

            const list: ExpenseRow[] = Array.isArray(json?.rows) ? json.rows : []

            if (mode === 'replace') setRows(list)
            else setRows((prev) => [...prev, ...list])

            setPage(pageIndex)
            setHasMore(Boolean(json?.hasMore))
        } finally {
            setLoadingMore(false)
        }
    }

    // Main load + refresh on selection changes
    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                setErrorMsg(null)
                const seq = ++loadSeqRef.current

                const { data: sessionRes } = await supabase.auth.getSession()
                const token = sessionRes.session?.access_token
                const { data: userRes } = await supabase.auth.getUser()
                if (!token || !userRes.user) {
                    setErrorMsg('Not logged in.')
                    setLoading(false)
                    return
                }

                setAuthToken(token)
                setUserId(userRes.user.id)

                const okMonths = await fetchAvailableMonths(token)
                // If months selection was auto-corrected via setState, stop here and let useEffect re-run
                if (!okMonths) {
                    setLoading(false)
                    return
                }

                const okDays = await fetchAvailableDays(token)
                // If day selection was auto-corrected via setState, stop here and let useEffect re-run
                if (!okDays) {
                    setLoading(false)
                    return
                }

                // If a newer load started, stop this one (avoid stale state overwrites)
                if (seq !== loadSeqRef.current) {
                    setLoading(false)
                    return
                }

                // reset paging + load
                setHasMore(true)
                setPage(0)
                await fetchSummary(token)
                await fetchTransactionsPage(token, 0, 'replace', userRes.user.id)

                setLoading(false)
            } catch (e: any) {
                setErrorMsg(e?.message ?? 'Failed to load')
                setLoading(false)
            }
        }

        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedYear, selectedMonth, selectedDay, supabase])

    // Infinite scroll observer (sentinel must be INSIDE scroll div)
    useEffect(() => {
        if (!userId) return
        if (!hasMore) return
        if (loadingMore) return

        const rootEl = scrollRef.current
        const targetEl = loadMoreRef.current
        if (!rootEl || !targetEl) return

        const obs = new IntersectionObserver(
            (entries) => {
                const e = entries[0]
                if (e.isIntersecting && hasMore && !loadingMore) {
                    if (authToken) fetchTransactionsPage(authToken, page + 1, 'append')
                }
            },
            { root: rootEl, threshold: 0.2 }
        )

        obs.observe(targetEl)
        return () => obs.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, hasMore, loadingMore, page, selectedYear, selectedMonth, selectedDay])

    const topCats = [...categories]
        .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
        .slice(0, 6)

    return (
        <AppShell title="His/Her Spendings" subtitle="">
            <div className="px-4 pb-28">
                <div className="max-w-2xl mx-auto space-y-4">
                    {/* Summary Card */}
                    <div className="rounded-[28px] bg-white/80 backdrop-blur border border-white shadow-[0_14px_45px_rgba(0,0,0,0.10)] p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-xs font-black uppercase tracking-widest text-stone-400">Total spending</div>
                                <div className="mt-2 text-3xl font-black text-stone-800 leading-none">RM {total.toFixed(2)}</div>
                                <div className="mt-2 text-xs font-bold text-stone-500">{monthLabel}</div>
                            </div>

                            <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 shadow-sm">
                                <div className="text-2xl">🐼🐻</div>
                                <div className="text-[11px] text-stone-600 font-black text-center">peek</div>
                            </div>
                        </div>

                        {errorMsg && (
                            <div className="mt-4 rounded-2xl bg-rose-50 border border-rose-100 p-3 text-sm text-rose-700 font-bold">
                                {errorMsg}
                            </div>
                        )}

                        {/* Date selectors */}
                        <div className="mt-4 grid grid-cols-3 gap-2">
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

                            <CuteSelect label="Day" value={selectedDay} onChange={(e: any) => setSelectedDay(e.target.value)}>
                                <option value="all">All</option>
                                {availableDays.map((d) => (
                                    <option key={d} value={String(d)}>
                                        {pad2(d)}
                                    </option>
                                ))}
                            </CuteSelect>
                        </div>
                    </div>

                    {/* Categories Card */}
                    <div className="rounded-[28px] bg-white/80 backdrop-blur border border-white shadow-[0_14px_45px_rgba(0,0,0,0.10)] p-5">
                        <div className="flex items-end justify-between">
                            <h2 className="text-base font-black text-stone-800">Category totals</h2>
                            <span className="text-xs font-black text-rose-500 bg-rose-50 px-3 py-1 rounded-full">
                                {categories.length} cats
                            </span>
                        </div>

                        {loading ? (
                            <div className="py-10 text-center text-stone-500 font-bold">Loading... ✨</div>
                        ) : categories.length === 0 ? (
                            <div className="py-10 text-center">
                                <div className="text-5xl mb-2">🍃</div>
                                <div className="text-stone-600 font-black">No category data</div>
                                <div className="text-stone-400 text-sm font-bold mt-1">No spending yet for this range.</div>
                            </div>
                        ) : (
                            <div className="mt-4 grid grid-cols-2 gap-3">
                                {topCats.map((c) => (
                                    <div
                                        key={c.category}
                                        className="rounded-3xl bg-white/70 border border-white shadow-sm p-4 flex items-start justify-between gap-2"
                                    >
                                        <div className="min-w-0">
                                            <div className="font-black text-stone-800 truncate">
                                                {emojiForCategory(c.category)} {c.category}
                                            </div>
                                            <div className="text-xs text-stone-400 font-bold mt-1">Total</div>
                                        </div>
                                        <div className="font-black text-stone-900 shrink-0">RM {Number(c.amount || 0).toFixed(0)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Transactions Card */}
                    <div className="rounded-[28px] bg-white/80 backdrop-blur border border-white shadow-[0_14px_45px_rgba(0,0,0,0.10)] overflow-hidden">
                        <div className="px-5 pt-5 pb-3 sticky top-0 bg-white/80 backdrop-blur z-10 border-b border-white/60">
                            <div className="flex items-end justify-between">
                                <h2 className="text-base font-black text-stone-800">Transactions</h2>
                                <span className="text-xs font-black text-rose-500 bg-rose-50 px-3 py-1 rounded-full">
                                    {rows.length} items
                                </span>
                            </div>
                        </div>

                        <div ref={scrollRef} className="h-[65vh] overflow-y-auto overscroll-contain px-5 pb-5">
                            {loading ? (
                                <div className="py-14 text-center text-stone-500 font-bold">Loading... ✨</div>
                            ) : rows.length === 0 ? (
                                <div className="py-14 text-center">
                                    <div className="text-5xl mb-3">🧾</div>
                                    <div className="text-stone-600 font-black">No transactions</div>
                                    <div className="text-stone-400 text-sm font-bold mt-1">This user has no expenses yet.</div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {rows.map((r) => (
                                        <div
                                            key={r.id}
                                            className="rounded-3xl bg-white/70 border border-white shadow-sm p-4 flex items-start justify-between gap-3"
                                        >
                                            <div className="flex items-start gap-3 min-w-0">
                                                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center shadow-sm">
                                                    <span className="text-2xl">{emojiForCategory(r.category)}</span>
                                                </div>

                                                <div className="min-w-0">
                                                    <div className="font-black text-stone-800 truncate">{r.category}</div>
                                                    <div className="text-xs text-stone-500 font-bold truncate">
                                                        {r.description ? r.description : 'No description'}
                                                    </div>
                                                    <div className="mt-1 text-[11px] text-stone-400 font-bold">{formatDate(r.spent_at)}</div>
                                                </div>
                                            </div>

                                            <div className="text-right shrink-0">
                                                <div className="font-black text-stone-900">RM {Number(r.amount || 0).toFixed(2)}</div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Sentinel MUST be inside scroll container */}
                                    <div ref={loadMoreRef} className="h-12 flex items-center justify-center">
                                        {hasMore ? (
                                            <span className="text-xs font-bold text-stone-400">{loadingMore ? 'Loading more... ✨' : 'Scroll for more... 🐼'}</span>
                                        ) : (
                                            <span className="text-xs font-bold text-stone-300"></span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                </div>
            </div>
        </AppShell>
    )
}