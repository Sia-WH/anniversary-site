

'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AppShell from '../components/AppShell'

type TotalsByUser = { user_id: string; total: number; owner_name?: string | null; owner_relation?: 'me' | 'partner' }
type ExpenseRow = {
    id: string
    user_id: string
    amount: number
    category: string
    description?: string | null
    spent_at: string // YYYY-MM-DD
    created_at?: string | null
    is_dating?: boolean | null
    is_for_partner?: boolean | null
    owner_name?: string | null
    owner_relation?: 'me' | 'partner'
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
    if (c.includes('transport') || c.includes('grab') || c.includes('uber') || c.includes('petrol') || c.includes('fuel'))
        return '🚗'
    if (c.includes('shopping') || c.includes('grocery') || c.includes('mart')) return '🛍️'
    if (c.includes('entertain') || c.includes('game') || c.includes('movie') || c.includes('netflix')) return '🎮'
    if (c.includes('bill') || c.includes('utility') || c.includes('electric') || c.includes('water')) return '🧾'
    if (c.includes('health') || c.includes('medical') || c.includes('clinic') || c.includes('hospital')) return '🩺'
    if (c.includes('gift')) return '🎁'
    return '💗'
}

function CuteSelect(props: { label?: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
    return (
        <label className="block">
            {props.label ? (
                <div className="text-[10px] font-black uppercase tracking-widest text-stone-400 px-1 mb-1">{props.label}</div>
            ) : null}
            <select
                value={props.value}
                onChange={(event) => props.onChange(event.target.value)}
                className="w-full bg-white rounded-2xl px-4 py-3 border border-stone-100 font-black text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
            >
                {props.children}
            </select>
        </label>
    )
}

function Pill({ emoji, label, value }: { emoji: string; label: string; value: string }) {
    return (
        <div className="rounded-3xl bg-white/70 border border-white shadow-sm px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg">{emoji}</span>
                <span className="font-black text-stone-700 truncate">{label}</span>
            </div>
            <span className="font-black text-stone-900 shrink-0">{value}</span>
        </div>
    )
}

export default function DatePage() {
    const supabase = useMemo(() => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !key) return null
        return createBrowserClient(url, key)
    }, [])

    const now = new Date()

    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const [myUserId, setMyUserId] = useState<string | null>(null)
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
    const [totalAll, setTotalAll] = useState(0)
    const [totalsByUser, setTotalsByUser] = useState<TotalsByUser[]>([])
    const [totalCount, setTotalCount] = useState<number>(0)

    // Infinite scroll
    const PAGE_SIZE = 10
    const [page, setPage] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const [loadingMore, setLoadingMore] = useState(false)
    const [rows, setRows] = useState<ExpenseRow[]>([])
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const loadMoreRef = useRef<HTMLDivElement | null>(null)

    const apiFetch = useCallback(async (path: string, token: string) => {
        const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error ?? 'Request failed')
        return json
    }, [])

    function payerLabel(userId: string, ownerName?: string | null, ownerRelation?: 'me' | 'partner') {
        if (myUserId && userId === myUserId) return { label: 'You paid', emoji: '🧍' }
        if (ownerRelation === 'partner') return { label: `${ownerName || 'Partner'} paid`, emoji: '🧑‍🤝‍🧑' }
        return { label: 'Partner paid', emoji: '🧑‍🤝‍🧑' }
    }

    async function fetchAvailableMonths(token: string) {
        const json = await apiFetch(`/api/expenses/summary?action=availableMonths&scope=combined&onlyDating=1`, token)
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
        const yearExists = months.some((m: { year: number; month: number }) => m.year === y)
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
        const monthExists = months.some((m: { year: number; month: number }) => m.year === y && m.month === mo)
        if (!monthExists) {
            const lastForYear = months.filter((m: { year: number; month: number }) => m.year === y).slice(-1)[0] ?? months[months.length - 1]
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
            `/api/expenses/summary?action=availableDays&scope=combined&onlyDating=1&year=${selectedYear}&month=${pad2(Number(selectedMonth))}`,
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
            `/api/expenses/summary?scope=combined&onlyDating=1&year=${selectedYear}&month=${monthParam}&day=${dayParam}`,
            token
        )

        setTotalAll(Number(json?.total) || 0)
        setTotalsByUser(Array.isArray(json?.totalsByUser) ? json.totalsByUser : [])
    }

    async function fetchTotalCount(token: string) {
        const monthParam = selectedMonth === 'all' ? 'all' : pad2(Number(selectedMonth))
        const dayParam = selectedDay === 'all' ? 'all' : pad2(Number(selectedDay))

        const json = await apiFetch(
            `/api/expenses/summary?action=count&scope=combined&onlyDating=1&year=${selectedYear}&month=${monthParam}&day=${dayParam}`,
            token
        )

        setTotalCount(Number(json?.count) || 0)
    }

    const fetchTransactionsPage = useCallback(async (token: string, pageIndex: number, mode: 'replace' | 'append') => {
        if (loadingMore) return
        setLoadingMore(true)

        const monthParam = selectedMonth === 'all' ? 'all' : pad2(Number(selectedMonth))
        const dayParam = selectedDay === 'all' ? 'all' : pad2(Number(selectedDay))

        const json = await apiFetch(
            `/api/expenses/summary?action=transactions&scope=combined&onlyDating=1&year=${selectedYear}&month=${monthParam}&day=${dayParam}&page=${pageIndex}&limit=${PAGE_SIZE}`,
            token
        )

        const list: ExpenseRow[] = Array.isArray(json?.rows) ? json.rows : []

        if (mode === 'replace') setRows(list)
        else setRows((prev) => [...prev, ...list])

        setPage(pageIndex)
        setHasMore(Boolean(json?.hasMore))
        setLoadingMore(false)
    }, [apiFetch, loadingMore, selectedDay, selectedMonth, selectedYear])

    // Main load + refresh on selection changes
    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true)
                setErrorMsg(null)

                if (!supabase) {
                    setErrorMsg('Missing Supabase env vars.')
                    setLoading(false)
                    return
                }

                const { data: sessionRes } = await supabase.auth.getSession()
                const token = sessionRes.session?.access_token
                const { data: userRes } = await supabase.auth.getUser()

                if (!token || !userRes.user) {
                    setErrorMsg('Not logged in.')
                    setLoading(false)
                    return
                }

                setAuthToken(token)
                setMyUserId(userRes.user.id)

                const okMonths = await fetchAvailableMonths(token)
                if (okMonths) await fetchAvailableDays(token)

                setHasMore(true)
                setPage(0)

                await fetchSummary(token)
                await fetchTotalCount(token)
                await fetchTransactionsPage(token, 0, 'replace')

                setLoading(false)
            } catch (error) {
                setErrorMsg(error instanceof Error ? error.message : 'Failed to load')
                setLoading(false)
            }
        }

        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedYear, selectedMonth, selectedDay, supabase])

    useEffect(() => {
        if (!authToken) return
        fetchTotalCount(authToken)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authToken, selectedYear, selectedMonth, selectedDay])

    // Infinite scroll observer (sentinel MUST be inside scroll div)
    useEffect(() => {
        if (!authToken) return
        if (!hasMore) return
        if (loadingMore) return

        const rootEl = scrollRef.current
        const targetEl = loadMoreRef.current
        if (!rootEl || !targetEl) return

        const obs = new IntersectionObserver(
            (entries) => {
                const e = entries[0]
                if (e.isIntersecting && hasMore && !loadingMore && authToken) {
                    fetchTransactionsPage(authToken, page + 1, 'append')
                }
            },
            { root: rootEl, threshold: 0.2 }
        )

        obs.observe(targetEl)
        return () => obs.disconnect()
    }, [authToken, fetchTransactionsPage, hasMore, loadingMore, page, selectedYear, selectedMonth, selectedDay])

    // Build pills
    const meTotal = totalsByUser.find((t) => myUserId && t.user_id === myUserId)?.total ?? 0
    const partner = totalsByUser.find((t) => !myUserId || t.user_id !== myUserId)
    const partnerTotal = partner?.total ?? 0
    const partnerName = partner?.owner_name || 'Partner'

    return (
        <AppShell title="Dating Bills" subtitle="">
            <div className="px-4 pb-28">
                <div className="max-w-2xl mx-auto space-y-4">
                    {/* Summary Card */}
                    <div className="rounded-[28px] bg-white/80 backdrop-blur border border-white shadow-[0_14px_45px_rgba(0,0,0,0.10)] p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="text-xs font-black uppercase tracking-widest text-stone-400">Combined dating total</div>
                                <div className="mt-2 text-3xl font-black text-stone-800 leading-none">RM {totalAll.toFixed(2)}</div>
                                <div className="mt-2 text-xs font-bold text-stone-500">{monthLabel}</div>
                            </div>

                            <div className="rounded-2xl bg-rose-50 border border-rose-100 px-4 py-3 shadow-sm">
                                <div className="text-2xl">💞</div>
                                <div className="text-[11px] text-stone-600 font-black text-center">bills</div>
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
                                onChange={(v) => {
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
                                onChange={(v) => {
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

                            <CuteSelect label="Day" value={selectedDay} onChange={setSelectedDay}>
                                <option value="all">All</option>
                                {availableDays.map((d) => (
                                    <option key={d} value={String(d)}>
                                        {pad2(d)}
                                    </option>
                                ))}
                            </CuteSelect>
                        </div>
                    </div>

                    {/* Who paid pills */}
                    <div className="rounded-[28px] bg-white/80 backdrop-blur border border-white shadow-[0_14px_45px_rgba(0,0,0,0.10)] p-5">
                        <div className="flex items-end justify-between">
                            <h2 className="text-base font-black text-stone-800">Separated totals</h2>
                            <span className="text-xs font-black text-rose-500 bg-rose-50 px-3 py-1 rounded-full">split</span>
                        </div>

                        {loading ? (
                            <div className="py-10 text-center text-stone-500 font-bold">Loading... ✨</div>
                        ) : (
                            <div className="mt-4 grid grid-cols-1 gap-3">
                                <Pill emoji="🧍" label="My Total" value={`RM ${Number(meTotal || 0).toFixed(2)}`} />
                                <Pill emoji="🧑‍🤝‍🧑" label={`${partnerName} Total`} value={`RM ${Number(partnerTotal || 0).toFixed(2)}`} />
                            </div>
                        )}
                    </div>

                    {/* Transactions Card */}
                    <div className="rounded-[28px] bg-white/80 backdrop-blur border border-white shadow-[0_14px_45px_rgba(0,0,0,0.10)] overflow-hidden">
                        <div className="px-5 pt-5 pb-3 sticky top-0 bg-white/80 backdrop-blur z-10 border-b border-white/60">
                            <div className="flex items-end justify-between">
                                <h2 className="text-base font-black text-stone-800">Transactions</h2>
                                <span className="text-xs font-black text-rose-500 bg-rose-50 px-3 py-1 rounded-full">
                                    {totalCount} items
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
                                    <div className="text-stone-400 text-sm font-bold mt-1">No bills yet for this range.</div>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {rows.map((r) => {
                                        const payer = payerLabel(r.user_id, r.owner_name, r.owner_relation)
                                        return (
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

                                                        <div className="mt-1 flex flex-wrap items-center gap-1">
                                                            <span className="text-[11px] text-stone-400 font-bold">{formatDate(r.spent_at)}</span>

                                                            <span className="text-[10px] font-black text-stone-700 bg-stone-50 px-2 py-0.5 rounded-md border border-stone-100">
                                                                {payer.emoji} {payer.label}
                                                            </span>

                                                            {r.is_dating ? (
                                                                <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                                                                    💞 Dating
                                                                </span>
                                                            ) : null}

                                                            {r.is_for_partner ? (
                                                                <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                                                                    🎁 Partner
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="text-right shrink-0">
                                                    <div className="font-black text-stone-900">RM {Number(r.amount || 0).toFixed(2)}</div>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Sentinel MUST be inside scroll container */}
                                    <div ref={loadMoreRef} className="h-12 flex items-center justify-center">
                                        {hasMore ? (
                                            <span className="text-xs font-bold text-stone-400">
                                                {loadingMore ? 'Loading more... ✨' : 'Scroll for more... 💞'}
                                            </span>
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
