import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: Request) {
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope') ?? 'self'
    let targetUserId = url.searchParams.get('user_id') ?? '__none__'

    let queryClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

    if (scope === 'other' || scope === 'all') {
        // Admin client bypasses RLS (server-only)
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)

        if (scope === 'all') {
            targetUserId = '__all__'
            queryClient = admin
        } else {
            // Find ONE other user id to show (for demo)
            const { data: otherRows } = await admin
                .from('profiles')
                .select('user_id')
                .neq('user_id', targetUserId)
                .limit(1)
            const otherId = (otherRows?.[0] as any)?.user_id as string | undefined
            targetUserId = otherId ?? '__none__'
            queryClient = admin
        }
    }

    // Available months
    if (url.pathname.endsWith('/availableMonths')) {
        if (targetUserId === '__none__') return NextResponse.json({ months: [] })

        let q: any = queryClient.from('expenses').select('spent_at')
        if (targetUserId !== '__all__') q = q.eq('user_id', targetUserId)

        const { data, error } = await q
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        const monthsSet = new Set<string>()
        for (const row of data ?? []) {
            const d = new Date((row as any).spent_at)
            const month = d.toISOString().slice(0, 7)
            monthsSet.add(month)
        }
        const months = Array.from(monthsSet).sort()
        return NextResponse.json({ months })
    }

    // Available days
    if (url.pathname.endsWith('/availableDays')) {
        const month = url.searchParams.get('month')
        if (!month) return NextResponse.json({ days: [] })

        const startISO = new Date(`${month}-01T00:00:00Z`).toISOString()
        const endDate = new Date(new Date(startISO).setMonth(new Date(startISO).getMonth() + 1))
        const endISO = endDate.toISOString()

        let q: any = queryClient
            .from('expenses')
            .select('spent_at')
            .gte('spent_at', startISO)
            .lt('spent_at', endISO)

        if (targetUserId !== '__all__') q = q.eq('user_id', targetUserId)

        const { data, error } = await q
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        const daysSet = new Set<string>()
        for (const row of data ?? []) {
            const d = new Date((row as any).spent_at)
            const day = d.toISOString().slice(0, 10)
            daysSet.add(day)
        }
        const days = Array.from(daysSet).sort()
        return NextResponse.json({ days })
    }

    // Transactions
    if (url.pathname.endsWith('/transactions')) {
        let q: any = queryClient
            .from('expenses')
            .select('id, user_id, amount, category, description, spent_at, created_at, is_dating, is_for_partner')
            .order('spent_at', { ascending: false })
            .order('id', { ascending: false })

        if (targetUserId !== '__all__') q = q.eq('user_id', targetUserId)

        const { data, error } = await q
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        return NextResponse.json({ transactions: data })
    }

    // Summary (default)
    let query: any = queryClient
        .from('expenses')
        .select('amount, category, spent_at, user_id')
    if (targetUserId !== '__all__') query = query.eq('user_id', targetUserId)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

    const categories = Object.entries(map).map(([category, amount]) => ({ category, amount }))
    const totalsByUser = Object.entries(byUser).map(([user_id, total]) => ({ user_id, total }))

    // For scope=all, return per-user totals so UI can show who pays
    if (scope === 'all') {
        return NextResponse.json({ total, categories, totalsByUser })
    }

    return NextResponse.json({ total, categories })
}
