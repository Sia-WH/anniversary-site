import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
    const auth = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userRes.user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Get distinct year-month from expenses
    const { data, error } = await supabase
        .from('expenses')
        .select('spent_at')
        .eq('user_id', userRes.user.id)

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const set = new Set<string>()

    data.forEach(row => {
        const d = new Date(row.spent_at)
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`
        set.add(key)
    })

    const result = Array.from(set)
        .map(k => {
            const [year, month] = k.split('-').map(Number)
            return { year, month }
        })
        .sort((a, b) =>
            a.year === b.year ? a.month - b.month : a.year - b.year
        )

    return NextResponse.json({ months: result })
}