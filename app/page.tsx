'use client'

import { createClient } from '@supabase/supabase-js'
import { useEffect, useMemo, useState } from 'react'
import AppShell from './components/AppShell'

// --- CUTE STYLES & HELPERS ---

// A soft pastel palette generator for the chart
// A cute-but-more-distinct palette generator for the chart
function hashToInt(input: string) {
    let h = 0
    for (let i = 0; i < input.length; i++) {
        h = (h << 5) - h + input.charCodeAt(i)
        h |= 0
    }
    return Math.abs(h)
}

function colorForCategory(category: string) {
    const h = hashToInt(category.toLowerCase())

    // Hue: 0..359
    const hue = h % 360

    // Sat: 72..92 (still vibrant)
    const sat = 72 + (h % 21)

    // Light: 52..66 (darker than before so slices are easier to tell apart)
    const light = 52 + ((h >> 8) % 15)

    return `hsl(${hue}, ${sat}%, ${light}%)`
}

function pad2(n: number) {
    return String(n).padStart(2, '0')
}

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// --- COMPONENTS ---

type CategoryTotal = {
    category: string
    amount: number
}

function PieChart({ data }: { data: CategoryTotal[] }) {
    const cleaned = (data ?? [])
        .map((d) => ({ category: String(d.category), amount: Number(d.amount) || 0 }))
        .filter((d) => d.amount > 0)

    const total = cleaned.reduce((sum, d) => sum + d.amount, 0)

    // No data (or all zeros)
    if (!Number.isFinite(total) || total <= 0) {
        return (
            <svg viewBox="0 0 32 32" className="w-64 h-64 mx-auto">
                <circle
                    cx="16"
                    cy="16"
                    r="14"
                    fill="none"
                    stroke="#fbcfe8" // pink-200
                    strokeWidth="4"
                    className="opacity-50"
                />
                <text
                    x="16"
                    y="16"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="3"
                    fill="#a855f7" // purple-500
                >
                    No data
                </text>
            </svg>
        )
    }

    // Donut chart settings
    const r = 14
    const stroke = 4
    const cx = 16
    const cy = 16
    const C = 2 * Math.PI * r

    // Create tiny gaps between segments (in circumference units)
    const GAP = 1.2

    let offset = 0

    return (
        <div className="relative w-64 h-64 mx-auto">
            <svg viewBox="0 0 32 32" className="w-64 h-64">
                {/* background ring (soft pastel track) */}
                <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="#ffe4f1" // soft pink track
                    strokeWidth={stroke}
                />

                {/* segments */}
                {cleaned.map((item) => {
                    const fraction = item.amount / total
                    const segLenRaw = fraction * C
                    const segLen = Math.max(0, segLenRaw - GAP)

                    const dashArray = `${segLen} ${C - segLen}`
                    const dashOffset = -offset

                    // advance offset by full segment length (raw) to preserve correct total coverage with gaps
                    offset += segLenRaw

                    const color = colorForCategory(item.category)
                    const percent = Math.round(fraction * 100)

                    return (
                        <circle
                            key={item.category}
                            cx={cx}
                            cy={cy}
                            r={r}
                            fill="none"
                            stroke={color}
                            strokeWidth={stroke}
                            strokeDasharray={dashArray}
                            strokeDashoffset={dashOffset}
                            strokeLinecap="round" // rounded edges look more modern
                            transform="rotate(-90 16 16)"
                            className="transition-all duration-300 hover:opacity-80"
                        >
                            <title>
                                {item.category}: RM {item.amount.toFixed(2)} ({percent}%)
                            </title>
                        </circle>
                    )
                })}

                {/* inner hole - match light card background */}
                <circle cx={cx} cy={cy} r={r - stroke + 0.5} fill="#ffffff" />
            </svg>

            {/* center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="bg-white/90 backdrop-blur-sm rounded-full w-24 h-24 flex flex-col items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.05)] border-2 border-white">
                    <span className="text-[10px] uppercase font-bold text-stone-400">Total</span>
                    <span className="text-sm font-black text-rose-500">RM {total.toFixed(2)}</span>
                </div>
            </div>
        </div>
    )
}

// Custom "Pill" Select for Mobile
function CuteSelect({
    label,
    value,
    onChange,
    disabled,
    children,
    icon
}: {
    label: string
    value: string
    onChange: (val: string) => void
    disabled?: boolean
    children: React.ReactNode
    icon?: React.ReactNode
}) {
    return (
        <div className={`relative flex-1 min-w-[100px] group ${disabled ? 'opacity-50' : ''}`}>
            <div className="absolute top-2 left-3 z-10 text-rose-400 pointer-events-none">
                {icon}
            </div>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="w-full appearance-none bg-white border-2 border-stone-100 text-stone-600 font-bold rounded-2xl py-3 pl-9 pr-8 text-sm focus:outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100 transition-all shadow-sm"
            >
                {children}
            </select>
            {/* Custom Arrow */}
            <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-rose-300">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 3a1 1 0 01.707.293l3 3a1 1 0 01-1.414 1.414L10 5.414 7.707 7.707a1 1 0 01-1.414-1.414l3-3A1 1 0 0110 3zm-3.707 9.293a1 1 0 011.414 0L10 14.586l2.293-2.293a1 1 0 011.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
            </div>
        </div>
    )
}

export default function Dashboard() {
    // --- STATE & SUPABASE LOGIC (Unchanged from original mostly) ---
    const supabase = useMemo(() => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !key) throw new Error('Missing Supabase Keys')
        return createClient(url, key)
    }, [])

    const [userName, setUserName] = useState<string>('Bubu') // Default to cute name
    const [total, setTotal] = useState(0)
    const [categories, setCategories] = useState<CategoryTotal[]>([])
    const [loading, setLoading] = useState(true)
    const [availableMonths, setAvailableMonths] = useState<{ year: number; month: number }[]>([])

    const now = useMemo(() => new Date(), [])
    const [selectedYear, setSelectedYear] = useState<string>(String(now.getFullYear()))
    const [selectedMonth, setSelectedMonth] = useState<string>(String(now.getMonth() + 1))
    const [selectedDay, setSelectedDay] = useState<string>('all')
    const [availableDays, setAvailableDays] = useState<number[]>([])

    // Logic blocks for fetching data (Same as original, just condensed for readability)
    useEffect(() => {
        const load = async () => {
            setLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (user) setUserName(user.user_metadata?.display_name ?? 'User')

            const { data: sessionRes } = await supabase.auth.getSession()
            const accessToken = sessionRes.session?.access_token
            if (!accessToken) { setLoading(false); return }

            // Fetch Months
            const monthsRes = await fetch('/api/expenses/summary?action=availableMonths&scope=me', { headers: { Authorization: `Bearer ${accessToken}` } })
            const monthsJson = await monthsRes.json()
            let months = (monthsRes.ok && Array.isArray(monthsJson?.months)) ? monthsJson.months : []
            if (months.length === 0) months = [{ year: now.getFullYear(), month: now.getMonth() + 1 }]
            setAvailableMonths(months)

            // Filter Logic
            if (selectedYear === 'all') {
                if (selectedMonth !== 'all') setSelectedMonth('all')
                if (selectedDay !== 'all') setSelectedDay('all')
                setAvailableDays([])
            } else if (selectedMonth === 'all') {
                if (selectedDay !== 'all') setSelectedDay('all')
                setAvailableDays([])
            }

            if (selectedYear !== 'all') {
                const y = Number(selectedYear)
                if (!months.some((m: any) => m.year === y)) {
                    const last = months[months.length - 1]
                    setSelectedYear(String(last.year)); setSelectedMonth(String(last.month)); setSelectedDay('all')
                    setAvailableDays([]); setLoading(false); return
                }
                if (selectedMonth !== 'all') {
                    const mo = Number(selectedMonth)
                    if (!months.some((m: any) => m.year === y && m.month === mo)) {
                        const last = months.filter((m: any) => m.year === y).slice(-1)[0] ?? months[months.length - 1]
                        setSelectedMonth(String(last.month)); setSelectedDay('all')
                        setAvailableDays([]); setLoading(false); return
                    }
                }
            }

            // Fetch Days
            if (selectedYear !== 'all' && selectedMonth !== 'all') {
                const daysRes = await fetch(`/api/expenses/summary?action=availableDays&year=${selectedYear}&month=${pad2(Number(selectedMonth))}&scope=me`, { headers: { Authorization: `Bearer ${accessToken}` } })
                const daysJson = await daysRes.json()
                const days = (daysRes.ok && Array.isArray(daysJson?.days)) ? daysJson.days : []
                setAvailableDays(days)
                if (selectedDay !== 'all' && !days.includes(Number(selectedDay))) {
                    setSelectedDay('all'); setLoading(false); return
                }
            } else {
                setAvailableDays([])
                if (selectedDay !== 'all') setSelectedDay('all')
            }

            // Fetch Summary
            const res = await fetch(`/api/expenses/summary?year=${selectedYear}&month=${selectedMonth === 'all' ? 'all' : pad2(Number(selectedMonth))}&day=${selectedDay === 'all' ? 'all' : pad2(Number(selectedDay))}&scope=me`, { headers: { Authorization: `Bearer ${accessToken}` } })
            const json = await res.json()
            if (res.ok) {
                setTotal(Number(json.total) || 0)
                setCategories((json.categories || []).map((c: any) => ({ category: String(c.category), amount: Number(c.amount) || 0 })))
            }
            setLoading(false)
        }
        load()
    }, [selectedYear, selectedMonth, selectedDay])

    // --- LOADING STATE ---
    if (loading) {
        return (
            <AppShell>
                <div className="min-h-screen bg-[#FFF9F5] flex flex-col items-center justify-center p-6 text-center">
                    <div className="animate-bounce mb-4 text-4xl">🐻</div>
                    <p className="font-nunito font-bold text-stone-400">Loading snacks...</p>
                </div>
            </AppShell>
        )
    }

    // --- MAIN RENDER ---
    const monthLabel = selectedYear === 'all' ? 'All time' : selectedMonth === 'all' ? `All of ${selectedYear}` : selectedDay === 'all' ? `${MONTHS[Number(selectedMonth) - 1]} ${selectedYear}` : `${pad2(Number(selectedDay))} ${MONTHS[Number(selectedMonth) - 1]}`

    return (
        <AppShell title="Finance App" subtitle={`${userName}`}>
            {/* Inject Nunito Font for Cuteness */}
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
                body { font-family: 'Nunito', sans-serif; }
            `}</style>

            <div className="min-h-screen bg-[#FFF9F5] pb-20 w-full">

                <div className="max-w-md mx-auto px-4 space-y-6">

                    {/* 2. DATE FILTERS (Horizontal Bubbles) */}
                    <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-stone-100">
                        <div className="flex gap-2">
                            <CuteSelect
                                label="Year"
                                value={selectedYear}
                                onChange={v => { setSelectedYear(v); if (v === 'all') { setSelectedMonth('all'); setSelectedDay('all') } }}
                                icon={<span className="text-xs">📅</span>}
                            >
                                <option value="all">Years</option>
                                {Array.from(new Set(availableMonths.map((m) => m.year))).map((y) => <option key={y} value={String(y)}>{y}</option>)}
                            </CuteSelect>

                            <CuteSelect
                                label="Month"
                                value={selectedMonth}
                                onChange={v => { setSelectedMonth(v); if (v === 'all') setSelectedDay('all') }}
                                disabled={selectedYear === 'all'}
                                icon={<span className="text-xs">🍂</span>}
                            >
                                <option value="all">Months</option>
                                {availableMonths.filter((m) => m.year === Number(selectedYear)).map((m) => <option key={m.month} value={String(m.month)}>{MONTHS[m.month - 1]}</option>)}
                            </CuteSelect>

                            <CuteSelect
                                label="Day"
                                value={selectedDay}
                                onChange={setSelectedDay}
                                disabled={selectedYear === 'all' || selectedMonth === 'all'}
                                icon={<span className="text-xs">☀️</span>}
                            >
                                <option value="all">Days</option>
                                {availableDays.map((d) => <option key={d} value={String(d)}>{pad2(d)}</option>)}
                            </CuteSelect>
                        </div>
                    </div>

                    {/* 3. TOTAL SPENT CARD */}
                    <div className="relative overflow-hidden bg-gradient-to-br from-pink-200 via-rose-200 to-fuchsia-200 rounded-[2.5rem] p-8 text-center shadow-[0_10px_40px_-10px_rgba(244,114,182,0.45)]">
                        {/* Decorative background blobs */}
                        <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-white/25 rounded-full blur-2xl"></div>
                        <div className="absolute bottom-[-20px] left-[-20px] w-28 h-28 bg-fuchsia-300/20 rounded-full blur-xl"></div>

                        <div className="relative z-10">
                            <p className="text-fuchsia-900/55 font-bold uppercase text-xs tracking-widest mb-2">
                                {monthLabel}
                            </p>

                            <h2 className="text-5xl font-black text-fuchsia-950 mb-2">
                                <span className="text-2xl align-top opacity-50 mr-1">RM</span>
                                {total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </h2>

                            <div className="inline-flex items-center gap-2 bg-white/40 px-4 py-1.5 rounded-full text-fuchsia-900 font-bold text-sm backdrop-blur-md">
                                <span>You spent this much!</span>
                            </div>
                        </div>

                        {/* Image Placeholder for Dudu */}
                        <img
                            src="/assets/profiles/yierbubu.png"
                            alt="bubu dudu"
                            className="absolute bottom-0 right-0 w-36 opacity-80"
                        />
                    </div>

                    {/* 4. PIE CHART CARD */}
                    <div className="bg-white rounded-[2.5rem] p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-50">
                        <h3 className="text-center font-bold text-stone-700 text-lg mb-4">Where did it go? 🤔</h3>
                        <PieChart data={categories} />
                    </div>

                    {/* 5. CATEGORY LIST */}
                    <div className="space-y-3">
                        <h3 className="px-2 font-bold text-stone-400 text-sm uppercase tracking-wider">Details</h3>

                        {categories.length === 0 ? (
                            <div className="text-center py-10 opacity-50">
                                <p className="text-4xl mb-2">💤</p>
                                <p>No spending records here.</p>
                            </div>
                        ) : (
                            categories
                                .sort((a, b) => b.amount - a.amount)
                                .map((item, i) => (
                                    <div
                                        key={item.category}
                                        className="group bg-white p-4 rounded-3xl flex items-center justify-between border-b-4 border-stone-50 hover:border-rose-100 transition-all active:scale-95"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div
                                                className="w-10 h-10 rounded-2xl flex items-center justify-center text-lg shadow-inner"
                                                style={{ backgroundColor: colorForCategory(item.category), color: 'white' }}
                                            >
                                                {/* You can replace this with specific icons per category later */}
                                                {item.category[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-bold text-stone-700 text-base">{item.category}</p>
                                                <div className="h-1.5 w-16 bg-stone-100 rounded-full mt-1 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{ width: `${Math.min((item.amount / total) * 100, 100)}%`, backgroundColor: colorForCategory(item.category) }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-black text-stone-700">
                                                RM {item.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-xs font-bold text-stone-400">{((item.amount / total) * 100).toFixed(0)}%</p>
                                        </div>
                                    </div>
                                ))
                        )}
                    </div>

                </div>
            </div>
        </AppShell>
    )
}