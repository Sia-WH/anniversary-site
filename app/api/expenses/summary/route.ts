import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type ExpenseDateRow = {
    spent_at: string | null
}

type ExpenseSummaryRow = {
    amount: number | string | null
    category: string | null
    user_id: string | null
}

type ExpenseTransactionRow = {
    id: string
    user_id: string
    amount: number | string | null
    category: string | null
    description: string | null
    spent_at: string
    created_at: string | null
    is_dating: boolean | null
    is_for_partner: boolean | null
}

function parseDateRange(url: URL) {
    const yearParam = url.searchParams.get('year') ?? 'all'
    const monthParam = url.searchParams.get('month') ?? 'all'
    const dayParam = url.searchParams.get('day') ?? 'all'

    const yearIsAll = yearParam === 'all'
    const monthIsAll = monthParam === 'all'
    const dayIsAll = dayParam === 'all'

    const year = yearIsAll ? NaN : Number(yearParam)
    const month = monthIsAll ? NaN : Number(monthParam)
    const day = dayIsAll ? NaN : Number(dayParam)

    if (!yearIsAll && !Number.isFinite(year)) return { error: 'Invalid year' }
    if (!monthIsAll && (!Number.isFinite(month) || month < 1 || month > 12)) return { error: 'Invalid month' }
    if (!dayIsAll && (!Number.isFinite(day) || day < 1 || day > 31)) return { error: 'Invalid day' }

    if (!yearIsAll && monthIsAll) {
        const start = new Date(Date.UTC(year, 0, 1))
        const end = new Date(Date.UTC(year + 1, 0, 1))
        return { startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10) }
    }

    if (!yearIsAll && !monthIsAll && dayIsAll) {
        const start = new Date(Date.UTC(year, month - 1, 1))
        const end = new Date(Date.UTC(year, month, 1))
        return { startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10) }
    }

    if (!yearIsAll && !monthIsAll && !dayIsAll) {
        const start = new Date(Date.UTC(year, month - 1, day))
        const end = new Date(Date.UTC(year, month - 1, day + 1))
        return { startISO: start.toISOString().slice(0, 10), endISO: end.toISOString().slice(0, 10) }
    }

    return { startISO: null, endISO: null }
}

function toAmount(value: number | string | null) {
    const amount = Number(value)
    return Number.isFinite(amount) ? amount : 0
}

export async function GET(req: Request) {
    const auth = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) {
        return NextResponse.json({ error: 'Missing token' }, { status: 401 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            global: {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            },
        }
    )

    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userRes.user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    const scope = url.searchParams.get('scope') ?? 'me'
    const onlyDating =
        url.searchParams.get('onlyDating') === '1' || url.searchParams.get('onlyDating') === 'true'
    const userId = userRes.user.id

    if (action === 'availableMonths') {
        let query = supabase.from('expenses').select('spent_at').eq('user_id', userId)
        if (onlyDating) query = query.eq('is_dating', true)

        const { data, error } = await query
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        const monthSet = new Set<string>()
        ;((data ?? []) as ExpenseDateRow[]).forEach((row) => {
            if (!row.spent_at) return
            const [year, month] = row.spent_at.split('-').map(Number)
            if (Number.isFinite(year) && Number.isFinite(month)) monthSet.add(`${year}-${month}`)
        })

        const months = Array.from(monthSet)
            .map((key) => {
                const [year, month] = key.split('-').map(Number)
                return { year, month }
            })
            .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))

        return NextResponse.json({ months })
    }

    if (action === 'availableDays') {
        const year = Number(url.searchParams.get('year'))
        const month = Number(url.searchParams.get('month'))

        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
            return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 })
        }

        const start = new Date(Date.UTC(year, month - 1, 1))
        const end = new Date(Date.UTC(year, month, 1))
        const startISO = start.toISOString().slice(0, 10)
        const endISO = end.toISOString().slice(0, 10)

        let query = supabase
            .from('expenses')
            .select('spent_at')
            .eq('user_id', userId)
            .gte('spent_at', startISO)
            .lt('spent_at', endISO)
        if (onlyDating) query = query.eq('is_dating', true)

        const { data, error } = await query
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        const daySet = new Set<number>()
        ;((data ?? []) as ExpenseDateRow[]).forEach((row) => {
            if (!row.spent_at) return
            const day = Number(row.spent_at.split('-')[2])
            if (Number.isFinite(day)) daySet.add(day)
        })

        return NextResponse.json({ days: Array.from(daySet).sort((a, b) => a - b) })
    }

    const range = parseDateRange(url)
    if ('error' in range) {
        return NextResponse.json({ error: range.error }, { status: 400 })
    }

    if (action === 'transactions') {
        const page = Math.max(0, Number(url.searchParams.get('page') ?? '0') || 0)
        const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? '10') || 10))
        const from = page * limit
        const to = from + limit - 1

        let query = supabase
            .from('expenses')
            .select('id, user_id, amount, category, description, spent_at, created_at, is_dating, is_for_partner')
            .eq('user_id', userId)
            .order('spent_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to)

        if (onlyDating) query = query.eq('is_dating', true)
        if (range.startISO && range.endISO) {
            query = query.gte('spent_at', range.startISO).lt('spent_at', range.endISO)
        }

        const { data, error } = await query
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        const rows = ((data ?? []) as ExpenseTransactionRow[]).map((row) => ({
            ...row,
            amount: toAmount(row.amount),
        }))

        return NextResponse.json({ rows, hasMore: rows.length === limit })
    }

    if (action === 'count') {
        let query = supabase
            .from('expenses')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)

        if (onlyDating) query = query.eq('is_dating', true)
        if (range.startISO && range.endISO) {
            query = query.gte('spent_at', range.startISO).lt('spent_at', range.endISO)
        }

        const { count, error } = await query
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        return NextResponse.json({ count: Number(count) || 0 })
    }

    let query = supabase
        .from('expenses')
        .select('amount, category, user_id')
        .eq('user_id', userId)

    if (onlyDating) query = query.eq('is_dating', true)
    if (range.startISO && range.endISO) {
        query = query.gte('spent_at', range.startISO).lt('spent_at', range.endISO)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let total = 0
    const categoryTotals = new Map<string, number>()

    ;((data ?? []) as ExpenseSummaryRow[]).forEach((row) => {
        const amount = toAmount(row.amount)
        const category = row.category || 'Uncategorized'
        total += amount
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount)
    })

    const categories = Array.from(categoryTotals.entries()).map(([category, amount]) => ({ category, amount }))

    if (scope === 'all') {
        return NextResponse.json({ total, categories, totalsByUser: [{ user_id: userId, total }] })
    }

    return NextResponse.json({ total, categories })
}
