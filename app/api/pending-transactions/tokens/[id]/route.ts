import { NextResponse } from 'next/server'
import {
    authenticateUserToken,
    getBearerToken,
    isPairingToken,
    pendingDatabaseFailure,
} from '@/app/lib/pending-transactions-server'

function respond(value: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    const token = getBearerToken(request)
    if (!token || isPairingToken(token)) return respond({ error: 'A signed-in app session is required.' }, 401)
    let auth
    try {
        auth = await authenticateUserToken(token)
    } catch {
        return respond({ error: 'Pending transaction service is not configured.' }, 503)
    }
    if (!auth) return respond({ error: 'Invalid or expired session.' }, 401)
    const { id } = await context.params
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return respond({ error: 'Token ID is invalid.' }, 400)
    }

    let result
    try {
        result = await auth.client.rpc('revoke_pending_import_token', { p_token_id: id })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
    const { data, error } = result
    if (error) {
        const failure = pendingDatabaseFailure(error)
        return respond({ error: failure.error }, failure.status)
    }
    if (data && typeof data === 'object' && 'rate_limited' in data && data.rate_limited === true) {
        const value = 'retry_after_seconds' in data ? Number(data.retry_after_seconds) : 60
        const retryAfter = Math.max(1, Math.min(86400, Number.isFinite(value) ? Math.ceil(value) : 60))
        return respond({ error: 'Too many requests. Please wait and try again.' }, 429, { 'Retry-After': String(retryAfter) })
    }
    return respond({ result: data })
}
