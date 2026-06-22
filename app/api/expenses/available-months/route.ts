import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

type ExpenseMonthRow = {
    spent_at: string | null
}

type VisibleProfileRow = {
    user_id: string
}

export async function GET(req: Request) {
    const auth = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

    const { data: visibleProfileRows } = await supabase.rpc('finance_visible_profiles')
    const visibleUserIds = ((visibleProfileRows ?? []) as VisibleProfileRow[])
        .map((row) => String(row.user_id))
        .filter(Boolean)
    const scopedUserIds = visibleUserIds.length > 0 ? visibleUserIds : [userRes.user.id]

    const { data, error } = await supabase
        .from('expenses')
        .select('spent_at')
        .in('user_id', scopedUserIds)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const set = new Set<string>()

    ;((data ?? []) as ExpenseMonthRow[]).forEach((row) => {
        if (!row.spent_at) return
        const [year, month] = row.spent_at.split('-').map(Number)
        if (Number.isFinite(year) && Number.isFinite(month)) {
            set.add(`${year}-${month}`)
        }
    })

    const result = Array.from(set)
        .map((key) => {
            const [year, month] = key.split('-').map(Number)
            return { year, month }
        })
        .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year))

    return NextResponse.json({ months: result })
}
