import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
    // 1. Read access token from header
    const auth = req.headers.get('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

    if (!token) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Create Supabase client
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

    // 3. Validate user
    const { data: userRes, error: userErr } = await supabase.auth.getUser(token)
    if (userErr || !userRes.user) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // 4. Fetch categories (id + name only)
    const { data, error } = await supabase
        .from('expense_categories')
        .select('id, name')
        .or(`user_id.is.null,user_id.eq.${userRes.user.id}`)
        .order('name', { ascending: true })

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
        categories: data ?? [],
    })
}