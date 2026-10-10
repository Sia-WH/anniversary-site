import { NextResponse } from 'next/server'
import {
    authenticateUserToken,
    getBearerToken,
    isPairingToken,
    pendingDatabaseFailure,
    rateLimitResponse,
    readJsonRequest,
} from '@/app/lib/pending-transactions-server'

function respond(value: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

export async function POST(request: Request) {
    const token = getBearerToken(request)
    if (!token || isPairingToken(token)) return respond({ error: 'A signed-in app session is required.' }, 401)

    const bodyResult = await readJsonRequest(request, 4096)
    if (!bodyResult.ok) return respond({ error: bodyResult.error }, bodyResult.status)
    if (!bodyResult.value || typeof bodyResult.value !== 'object' || Array.isArray(bodyResult.value)) {
        return respond({ error: 'Request body must be a JSON object.' }, 400)
    }
    const body = bodyResult.value as { pending_id?: unknown }

    if (typeof body.pending_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.pending_id)) {
        return respond({ error: 'pending_id must be a valid transaction ID.' }, 400)
    }

    let auth
    try {
        auth = await authenticateUserToken(token)
    } catch {
        return respond({ error: 'Pending transaction service is not configured.' }, 503)
    }
    if (!auth) return respond({ error: 'Invalid or expired session.' }, 401)

    let result
    try {
        result = await auth.client.rpc('ignore_pending_transaction', { p_pending_id: body.pending_id })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
    const { data, error } = result
    if (error) {
        const failure = pendingDatabaseFailure(error)
        return respond({ error: failure.error }, failure.status)
    }
    const retryAfter = rateLimitResponse(data)
    if (retryAfter !== null) return respond({ error: 'Too many requests. Please wait and try again.' }, 429, { 'Retry-After': String(retryAfter) })
    return respond({ result: data })
}
