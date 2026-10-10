import { NextResponse } from 'next/server'
import {
    authenticateUserToken,
    createPairingToken,
    getBearerToken,
    isPairingToken,
    pendingDatabaseFailure,
    rateLimitResponse,
    readJsonRequest,
    sha256Hex,
} from '@/app/lib/pending-transactions-server'

function respond(value: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

function databaseFailure(error: unknown) {
    const failure = pendingDatabaseFailure(error)
    return respond({ error: failure.error }, failure.status)
}

function rateLimited(value: unknown) {
    const retryAfter = rateLimitResponse(value)
    return retryAfter === null
        ? null
        : respond({ error: 'Too many requests. Please wait and try again.' }, 429, { 'Retry-After': String(retryAfter) })
}

export async function GET(request: Request) {
    const token = getBearerToken(request)
    if (!token || isPairingToken(token)) return respond({ error: 'A signed-in app session is required.' }, 401)
    let auth
    try {
        auth = await authenticateUserToken(token)
    } catch {
        return respond({ error: 'Pending transaction service is not configured.' }, 503)
    }
    if (!auth) return respond({ error: 'Invalid or expired session.' }, 401)

    let limit
    try {
        limit = await auth.client.rpc('enforce_pending_rate_limit', { p_action: 'token_list' })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
    if (limit.error) return databaseFailure(limit.error)
    const limited = rateLimited(limit.data)
    if (limited) return limited

    let result
    try {
        result = await auth.client
            .from('pending_import_tokens')
            .select('id, label, created_at, last_used_at, expires_at, revoked_at')
            .eq('user_id', auth.user.id)
            .order('created_at', { ascending: false })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
    const { data, error } = result

    if (error) return databaseFailure(error)
    return respond({ tokens: data ?? [] })
}

export async function POST(request: Request) {
    const token = getBearerToken(request)
    if (!token || isPairingToken(token)) return respond({ error: 'A signed-in app session is required.' }, 401)
    const bodyResult = await readJsonRequest(request, 4096)
    if (!bodyResult.ok) return respond({ error: bodyResult.error }, bodyResult.status)
    if (!bodyResult.value || typeof bodyResult.value !== 'object' || Array.isArray(bodyResult.value)) {
        return respond({ error: 'Request body must be a JSON object.' }, 400)
    }
    const body = bodyResult.value as { label?: unknown }
    if (body.label !== undefined && body.label !== null && typeof body.label !== 'string') {
        return respond({ error: 'label must be text.' }, 400)
    }
    if (typeof body.label === 'string' && body.label.length > 80) return respond({ error: 'label must be at most 80 characters.' }, 400)
    let auth
    try {
        auth = await authenticateUserToken(token)
    } catch {
        return respond({ error: 'Pending transaction service is not configured.' }, 503)
    }
    if (!auth) return respond({ error: 'Invalid or expired session.' }, 401)

    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : 'iPhone Shortcuts'

    let pairingToken: string
    let result
    try {
        pairingToken = createPairingToken()
        result = await auth.client.rpc('create_pending_import_token', {
            p_token_hash: await sha256Hex(pairingToken),
            p_label: label,
        })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
    const { data, error } = result

    if (error) return databaseFailure(error)
    const limited = rateLimited(data)
    if (limited) return limited
    if (!data || typeof data !== 'object' || !('expires_at' in data)) {
        return respond({ error: 'The token could not be created. Apply the pending transaction setup and try again.' }, 503)
    }

    return respond({
        token: pairingToken,
        import_url: new URL('/api/pending-transactions', request.url).toString(),
        token_record: data,
        warning: 'Save this token now. It expires in 90 days and will not be shown again.',
    }, 201)
}
