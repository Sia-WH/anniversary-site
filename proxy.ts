import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
    // Create a response so Supabase can attach refreshed cookies
    let response = NextResponse.next()

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                // NEW (non-deprecated) API
                getAll() {
                    return request.cookies.getAll().map((c) => ({
                        name: c.name,
                        value: c.value,
                    }))
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set({ name, value, ...options })
                    })
                },
            },
        }
    )

    const pathname = request.nextUrl.pathname
    const isLoginPage = pathname === '/login'

    return supabase.auth
        // This call BOTH reads the session AND refreshes it if needed
        .getSession()
        .then(({ data }) => {
            const isAuthed = Boolean(data.session)

            // Not logged in → force login
            if (!isAuthed && !isLoginPage) {
                return NextResponse.redirect(new URL('/login', request.url))
            }

            // Already logged in → don’t show login page
            if (isAuthed && isLoginPage) {
                return NextResponse.redirect(new URL('/', request.url))
            }

            return response
        })
        .catch(() => {
            // Fail closed: require login except for /login
            if (!isLoginPage) {
                return NextResponse.redirect(new URL('/login', request.url))
            }
            return response
        })
}

export const config = {
    matcher: ['/((?!_next|favicon.ico|assets|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|mov|css|js)$).*)'],
}