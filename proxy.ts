import { createServerClient } from '@supabase/ssr'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname
    // Recovery must work before a user has a session. The form verifies the user before updating.
    if (['/forgot-password', '/reset-password', '/auth/callback'].includes(pathname)) {
        return NextResponse.next()
    }
    // Create a response so Supabase can attach refreshed cookies
    const response = NextResponse.next()

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

    const isLoginPage = pathname === '/login'
    const redirect = (path: string) => {
        const redirected = NextResponse.redirect(new URL(path, request.url))
        response.cookies.getAll().forEach((cookie) => redirected.cookies.set(cookie))
        return redirected
    }

    return supabase.auth
        // This call BOTH reads the session AND refreshes it if needed
        .getUser()
        .then(({ data, error }) => {
            const isAuthed = !error && Boolean(data.user)

            // Not logged in → force login
            if (!isAuthed && !isLoginPage) {
                return redirect('/login')
            }

            // Already logged in → don’t show login page
            if (isAuthed && isLoginPage) {
                return redirect('/')
            }

            return response
        })
        .catch(() => {
            // Fail closed: require login except for /login
            if (!isLoginPage) {
                return redirect('/login')
            }
            return response
        })
}

export const config = {
    matcher: ['/((?!_next|favicon.ico|assets|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|mov|css|js)$).*)'],
}
