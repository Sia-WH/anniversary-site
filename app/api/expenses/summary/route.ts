import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
    // 1) Read the user's access token from Authorization header
    const auth = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) {
        return NextResponse.json({ error: 'Missing token' }, { status: 401 })
    }

    // 2) Create supabase client that runs queries as the authenticated user (RLS-friendly)
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

    // 3) Validate user from token
    const { data: userRes, error: userErr } = await supabase.auth.getUser()
    if (userErr || !userRes.user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const url = new URL(req.url)
    const action = url.searchParams.get('action')
    // Optional filter: only return dating expenses when onlyDating=1 (or true)
    const onlyDating =
        url.searchParams.get('onlyDating') === '1' || url.searchParams.get('onlyDating') === 'true'

    // scope:
    // - default (or "me"): current authenticated user (RLS-friendly)
    // - "other": view the ONE other user's data (requires SUPABASE_SERVICE_ROLE_KEY)
    // - "all": view ALL users' data (requires SUPABASE_SERVICE_ROLE_KEY)
    const scope = url.searchParams.get('scope') ?? 'me'

    let targetUserId = userRes.user.id
    let queryClient: any = supabase

    if (scope === 'other' || scope === 'all') {
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
        if (!serviceKey) {
            return NextResponse.json(
                { error: 'Missing SUPABASE_SERVICE_ROLE_KEY in env (required for scope=other/all)' },
                { status: 500 }
            )
        }

        // Admin client bypasses RLS (server-only)
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

        if (scope === 'all') {
            targetUserId = '__all__'
            queryClient = admin
        } else {
            // Find ONE other user id from expenses (neq current user)
            const { data: otherRows, error: otherErr } = await admin
                .from('expenses')
                .select('user_id')
                .neq('user_id', userRes.user.id)
                .order('spent_at', { ascending: false })
                .limit(1)

            if (otherErr) {
                return NextResponse.json({ error: otherErr.message }, { status: 500 })
            }

            const otherId = (otherRows?.[0] as any)?.user_id as string | undefined
            targetUserId = otherId ?? '__none__'
            queryClient = admin
        }
    }

    // =======================
    // A) availableMonths action
    // GET /api/expenses/summary?action=availableMonths
    // =======================
    if (action === 'availableMonths') {
        if (targetUserId === '__none__') return NextResponse.json({ months: [] })

        let q: any = queryClient.from('expenses').select('spent_at')
        if (onlyDating) q = q.eq('is_dating', true)
        if (targetUserId !== '__all__') q = q.eq('user_id', targetUserId)

        const { data, error } = await q

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const set = new Set<string>()
        for (const row of data ?? []) {
            if (!row.spent_at) continue
            const d = new Date(row.spent_at as any)
            const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`
            set.add(key)
        }

        const months = Array.from(set)
            .map((k) => {
                const [year, month] = k.split('-').map(Number)
                return { year, month }
            })
            .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))

        return NextResponse.json({ months })
    }

    // =======================
    // A2) availableDays action
    // GET /api/expenses/summary?action=availableDays&year=YYYY&month=MM
    // =======================
    if (action === 'availableDays') {
        if (targetUserId === '__none__') return NextResponse.json({ days: [] })

        const yearStr = url.searchParams.get('year')
        const monthStr = url.searchParams.get('month') // "01".."12"

        const year = yearStr ? Number(yearStr) : NaN
        const month = monthStr ? Number(monthStr) : NaN

        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
            return NextResponse.json({ error: 'Invalid year/month' }, { status: 400 })
        }

        const start = new Date(Date.UTC(year, month - 1, 1))
        const end = new Date(Date.UTC(year, month, 1))
        const startISO = start.toISOString().slice(0, 10)
        const endISO = end.toISOString().slice(0, 10)

        let q: any = queryClient
            .from('expenses')
            .select('spent_at')
            .gte('spent_at', startISO)
            .lt('spent_at', endISO)

        if (onlyDating) q = q.eq('is_dating', true)

        if (targetUserId !== '__all__') q = q.eq('user_id', targetUserId)

        const { data, error } = await q

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const daySet = new Set<number>()
        for (const row of data ?? []) {
            if (!row.spent_at) continue
            const d = new Date(row.spent_at as any)
            daySet.add(d.getUTCDate())
        }

        const days = Array.from(daySet).sort((a, b) => a - b)
        return NextResponse.json({ days })
    }

    // =======================
    // A3) transactions action (paged)
    // GET /api/expenses/summary?action=transactions&scope=me|other&year=all|YYYY&month=all|MM&day=all|DD&page=0&limit=10
    // =======================
    if (action === 'transactions') {
        if (targetUserId === '__none__') return NextResponse.json({ rows: [], hasMore: false })

        const yearStrT = url.searchParams.get('year') ?? 'all'
        const monthStrT = url.searchParams.get('month') ?? 'all'
        const dayStrT = url.searchParams.get('day') ?? 'all'

        const yearIsAllT = yearStrT === 'all'
        const monthIsAllT = monthStrT === 'all'
        const dayIsAllT = dayStrT === 'all'

        const yearT = yearIsAllT ? NaN : Number(yearStrT)
        const monthT = monthIsAllT ? NaN : Number(monthStrT)
        const dayT = dayIsAllT ? NaN : Number(dayStrT)

        if (!yearIsAllT && !Number.isFinite(yearT)) {
            return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
        }
        if (!monthIsAllT && (!Number.isFinite(monthT) || monthT < 1 || monthT > 12)) {
            return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
        }
        if (!dayIsAllT && (!Number.isFinite(dayT) || dayT < 1 || dayT > 31)) {
            return NextResponse.json({ error: 'Invalid day' }, { status: 400 })
        }

        let startISO: string | null = null
        let endISO: string | null = null

        if (!yearIsAllT && monthIsAllT) {
            const start = new Date(Date.UTC(yearT, 0, 1))
            const end = new Date(Date.UTC(yearT + 1, 0, 1))
            startISO = start.toISOString().slice(0, 10)
            endISO = end.toISOString().slice(0, 10)
        } else if (!yearIsAllT && !monthIsAllT && dayIsAllT) {
            const start = new Date(Date.UTC(yearT, monthT - 1, 1))
            const end = new Date(Date.UTC(yearT, monthT, 1))
            startISO = start.toISOString().slice(0, 10)
            endISO = end.toISOString().slice(0, 10)
        } else if (!yearIsAllT && !monthIsAllT && !dayIsAllT) {
            const start = new Date(Date.UTC(yearT, monthT - 1, dayT))
            const end = new Date(Date.UTC(yearT, monthT - 1, dayT + 1))
            startISO = start.toISOString().slice(0, 10)
            endISO = end.toISOString().slice(0, 10)
        }

        const pageStr = url.searchParams.get('page') ?? '0'
        const limitStr = url.searchParams.get('limit') ?? '10'
        const page = Math.max(0, Number(pageStr) || 0)
        const limit = Math.min(50, Math.max(1, Number(limitStr) || 10))

        const from = page * limit
        const to = from + limit - 1

        let q: any = queryClient
            .from('expenses')
            .select('id, user_id, amount, category, description, spent_at, created_at, is_dating, is_for_partner')
            .order('spent_at', { ascending: false })
            .order('id', { ascending: false })

        if (onlyDating) q = q.eq('is_dating', true)

        if (targetUserId !== '__all__') q = q.eq('user_id', targetUserId)
        if (startISO && endISO) {
            q = q.gte('spent_at', startISO).lt('spent_at', endISO)
        }

        const { data, error } = await q.range(from, to)

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const rows = (data ?? []).map((r: any) => ({
            ...r,
            amount: Number(r.amount) || 0,
        }))

        return NextResponse.json({ rows, hasMore: rows.length === limit })
    }

    // =======================
    // A4) count action (total matching rows)
    // GET /api/expenses/summary?action=count&scope=me|other|all&year=all|YYYY&month=all|MM&day=all|DD
    // =======================
    if (action === 'count') {
        if (targetUserId === '__none__') return NextResponse.json({ count: 0 })

        const yearStrT = url.searchParams.get('year') ?? 'all'
        const monthStrT = url.searchParams.get('month') ?? 'all'
        const dayStrT = url.searchParams.get('day') ?? 'all'

        const yearIsAllT = yearStrT === 'all'
        const monthIsAllT = monthStrT === 'all'
        const dayIsAllT = dayStrT === 'all'

        const yearT = yearIsAllT ? NaN : Number(yearStrT)
        const monthT = monthIsAllT ? NaN : Number(monthStrT)
        const dayT = dayIsAllT ? NaN : Number(dayStrT)

        if (!yearIsAllT && !Number.isFinite(yearT)) {
            return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
        }
        if (!monthIsAllT && (!Number.isFinite(monthT) || monthT < 1 || monthT > 12)) {
            return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
        }
        if (!dayIsAllT && (!Number.isFinite(dayT) || dayT < 1 || dayT > 31)) {
            return NextResponse.json({ error: 'Invalid day' }, { status: 400 })
        }

        let startISO: string | null = null
        let endISO: string | null = null

        if (!yearIsAllT && monthIsAllT) {
            const start = new Date(Date.UTC(yearT, 0, 1))
            const end = new Date(Date.UTC(yearT + 1, 0, 1))
            startISO = start.toISOString().slice(0, 10)
            endISO = end.toISOString().slice(0, 10)
        } else if (!yearIsAllT && !monthIsAllT && dayIsAllT) {
            const start = new Date(Date.UTC(yearT, monthT - 1, 1))
            const end = new Date(Date.UTC(yearT, monthT, 1))
            startISO = start.toISOString().slice(0, 10)
            endISO = end.toISOString().slice(0, 10)
        } else if (!yearIsAllT && !monthIsAllT && !dayIsAllT) {
            const start = new Date(Date.UTC(yearT, monthT - 1, dayT))
            const end = new Date(Date.UTC(yearT, monthT - 1, dayT + 1))
            startISO = start.toISOString().slice(0, 10)
            endISO = end.toISOString().slice(0, 10)
        }

        let q: any = queryClient
            .from('expenses')
            .select('id', { count: 'exact', head: true })

        if (onlyDating) q = q.eq('is_dating', true)
        if (targetUserId !== '__all__') q = q.eq('user_id', targetUserId)
        if (startISO && endISO) q = q.gte('spent_at', startISO).lt('spent_at', endISO)

        const { count, error } = await q

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ count: Number(count) || 0 })
    }

    // =======================
    // B) Monthly summary
    // GET /api/expenses/summary?year=YYYY&month=MM
    // =======================
    if (targetUserId === '__none__') return NextResponse.json({ total: 0, categories: [] })

    const yearStr = url.searchParams.get('year') ?? 'all'
    const monthStr = url.searchParams.get('month') ?? 'all'
    const dayStr = url.searchParams.get('day') ?? 'all'

    const yearIsAll = yearStr === 'all'
    const monthIsAll = monthStr === 'all'
    const dayIsAll = dayStr === 'all'

    const year = yearIsAll ? NaN : Number(yearStr)
    const month = monthIsAll ? NaN : Number(monthStr) // 1..12
    const day = dayIsAll ? NaN : Number(dayStr) // 1..31

    if (!yearIsAll && !Number.isFinite(year)) {
        return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    }
    if (!monthIsAll && (!Number.isFinite(month) || month < 1 || month > 12)) {
        return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
    }
    if (!dayIsAll && (!Number.isFinite(day) || day < 1 || day > 31)) {
        return NextResponse.json({ error: 'Invalid day' }, { status: 400 })
    }

    // Build [start, end) UTC range based on selection
    // - all years: no date filter
    // - year only: whole year
    // - year+month: whole month
    // - year+month+day: that day
    let startISO: string | null = null
    let endISO: string | null = null

    if (!yearIsAll && monthIsAll) {
        const start = new Date(Date.UTC(year, 0, 1))
        const end = new Date(Date.UTC(year + 1, 0, 1))
        startISO = start.toISOString().slice(0, 10)
        endISO = end.toISOString().slice(0, 10)
    } else if (!yearIsAll && !monthIsAll && dayIsAll) {
        const start = new Date(Date.UTC(year, month - 1, 1))
        const end = new Date(Date.UTC(year, month, 1))
        startISO = start.toISOString().slice(0, 10)
        endISO = end.toISOString().slice(0, 10)
    } else if (!yearIsAll && !monthIsAll && !dayIsAll) {
        const start = new Date(Date.UTC(year, month - 1, day))
        const end = new Date(Date.UTC(year, month - 1, day + 1))
        startISO = start.toISOString().slice(0, 10)
        endISO = end.toISOString().slice(0, 10)
    }

    let query: any = queryClient
        .from('expenses')
        .select('amount, category, spent_at, user_id')

    if (onlyDating) query = query.eq('is_dating', true)
    if (targetUserId !== '__all__') query = query.eq('user_id', targetUserId)

    if (startISO && endISO) {
        query = query.gte('spent_at', startISO).lt('spent_at', endISO)
    }

    const { data, error } = await query

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Aggregate
    let total = 0
    const map: Record<string, number> = {}
    const byUser: Record<string, number> = {}

    for (const row of data ?? []) {
        const amt = Number((row as any).amount)
        total += amt

        const cat = String((row as any).category ?? 'Uncategorized')
        map[cat] = (map[cat] || 0) + amt

        const uid = String((row as any).user_id ?? '')
        if (uid) byUser[uid] = (byUser[uid] || 0) + amt
    }

    const categories = Object.entries(map).map(([category, amount]) => ({
        category,
        amount,
    }))

    const totalsByUser = Object.entries(byUser).map(([user_id, total]) => ({
        user_id,
        total,
    }))

    if (scope === 'all') {
        return NextResponse.json({ total, categories, totalsByUser })
    }

    return NextResponse.json({ total, categories })
}