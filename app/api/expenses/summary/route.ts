import { SupabaseClient, createClient } from '@supabase/supabase-js'
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

type VisibleProfileRow = {
    user_id: string
    display_name: string | null
    relation: 'me' | 'partner'
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

async function loadVisibleProfiles(
    supabase: SupabaseClient,
    currentUserId: string,
    scope: string
) {
    const normalizedScope = scope.toLowerCase()
    const { data, error } = await supabase.rpc('finance_visible_profiles')
    const fallback = [{ user_id: currentUserId, display_name: null, relation: 'me' as const }]

    const allProfiles: VisibleProfileRow[] = error
        ? fallback
        : ((data ?? []) as Array<{ user_id: unknown; display_name: unknown; relation: unknown }>)
            .map((row) => ({
                user_id: String(row.user_id),
                display_name: row.display_name ? String(row.display_name) : null,
                relation: row.relation === 'partner' ? ('partner' as const) : ('me' as const),
            }))
            .filter((row) => row.user_id)

    const profiles = allProfiles.length > 0 ? allProfiles : fallback

    if (normalizedScope === 'me' || normalizedScope === 'self' || normalizedScope === 'personal') {
        return profiles.filter((profile) => profile.user_id === currentUserId)
    }

    if (normalizedScope === 'other' || normalizedScope === 'partner') {
        return profiles.filter((profile) => profile.user_id !== currentUserId)
    }

    if (normalizedScope === 'all' || normalizedScope === 'couple' || normalizedScope === 'combined') {
        return profiles
    }

    return profiles.filter((profile) => profile.user_id === currentUserId)
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
    const visibleProfiles = await loadVisibleProfiles(supabase, userId, scope)
    const visibleUserIds = visibleProfiles.map((profile) => profile.user_id)
    const profileById = new Map(visibleProfiles.map((profile) => [profile.user_id, profile]))

    if (visibleUserIds.length === 0) {
        if (action === 'availableMonths') return NextResponse.json({ months: [] })
        if (action === 'availableDays') return NextResponse.json({ days: [] })
        if (action === 'transactions') return NextResponse.json({ rows: [], hasMore: false })
        if (action === 'count') return NextResponse.json({ count: 0 })
        return NextResponse.json({ total: 0, categories: [], totalsByUser: [] })
    }

    if (action === 'availableMonths') {
        let query = supabase.from('expenses').select('spent_at').in('user_id', visibleUserIds)
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
            .in('user_id', visibleUserIds)
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
            .in('user_id', visibleUserIds)
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
            owner_name: profileById.get(row.user_id)?.display_name ?? null,
            owner_relation: profileById.get(row.user_id)?.relation ?? 'partner',
        }))

        return NextResponse.json({ rows, hasMore: rows.length === limit })
    }

    if (action === 'count') {
        let query = supabase
            .from('expenses')
            .select('id', { count: 'exact', head: true })
            .in('user_id', visibleUserIds)

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
        .in('user_id', visibleUserIds)

    if (onlyDating) query = query.eq('is_dating', true)
    if (range.startISO && range.endISO) {
        query = query.gte('spent_at', range.startISO).lt('spent_at', range.endISO)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let total = 0
    const categoryTotals = new Map<string, number>()
    const userTotals = new Map<string, number>()

    ;((data ?? []) as ExpenseSummaryRow[]).forEach((row) => {
        const amount = toAmount(row.amount)
        const category = row.category || 'Uncategorized'
        const ownerUserId = row.user_id || userId
        total += amount
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount)
        userTotals.set(ownerUserId, (userTotals.get(ownerUserId) ?? 0) + amount)
    })

    const categories = Array.from(categoryTotals.entries()).map(([category, amount]) => ({ category, amount }))
    const totalsByUser = visibleProfiles.map((profile) => ({
        user_id: profile.user_id,
        total: userTotals.get(profile.user_id) ?? 0,
        owner_name: profile.display_name,
        owner_relation: profile.relation,
    }))

    return NextResponse.json({ total, categories, totalsByUser })
}
