import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
    const isLoggedIn = request.cookies.get('isLoggedIn')?.value === 'true'
    const pathname = request.nextUrl.pathname
    const isLoginPage = pathname === '/login'

    if (!isLoggedIn && !isLoginPage) {
        return NextResponse.redirect(new URL('/login', request.url))
    }

    if (isLoggedIn && isLoginPage) {
        return NextResponse.redirect(new URL('/', request.url))
    }

    return NextResponse.next()
}

export const config = {
    matcher: ['/((?!_next|favicon.ico|assets|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|mp4|mov|css|js)$).*)'],
}