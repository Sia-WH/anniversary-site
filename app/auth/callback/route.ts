import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
    const invalidLink = () => NextResponse.redirect(new URL('/reset-password?error=invalid_link', request.url))
    const code = request.nextUrl.searchParams.get('code')
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!code || !url || !key) return invalidLink()

    const response = NextResponse.redirect(new URL('/reset-password', request.url))
    const supabase = createServerClient(url, key, {
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookies) => {
                cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
            },
        },
    })
    try {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) return invalidLink()
        return response
    } catch {
        return invalidLink()
    }
}
