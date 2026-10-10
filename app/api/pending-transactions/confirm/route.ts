import { NextResponse } from 'next/server'
import {
    authenticateUserToken,
    getBearerToken,
    isValidIsoDate,
    isPairingToken,
    parsePendingAmount,
    pendingDatabaseFailure,
    rateLimitResponse,
    readJsonRequest,
} from '@/app/lib/pending-transactions-server'

type ConfirmBody = {
    pending_id?: unknown
    amount?: unknown
    currency?: unknown
    manual_conversion?: unknown
    date?: unknown
    kind?: unknown
    reclassification_confirmed?: unknown
    description?: unknown
    category_id?: unknown
    category?: unknown
    is_dating?: unknown
    is_for_partner?: unknown
}

function respond(value: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

function databaseFailure(error: unknown) {
    const failure = pendingDatabaseFailure(error)
    return respond({ error: failure.error }, failure.status)
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
    const token = getBearerToken(request)
    if (!token || isPairingToken(token)) return respond({ error: 'A signed-in app session is required.' }, 401)

    try {
        const bodyResult = await readJsonRequest(request, 8192)
        if (!bodyResult.ok) return respond({ error: bodyResult.error }, bodyResult.status)
        if (!bodyResult.value || typeof bodyResult.value !== 'object' || Array.isArray(bodyResult.value)) {
            return respond({ error: 'Request body must be a JSON object.' }, 400)
        }
        const body = bodyResult.value as ConfirmBody
        if (typeof body.pending_id !== 'string' || !uuidPattern.test(body.pending_id)) {
            return respond({ error: 'pending_id must be a valid transaction ID.' }, 400)
        }

        if (body.amount !== null && body.amount !== undefined && body.amount !== '' &&
            typeof body.amount !== 'number' && typeof body.amount !== 'string') {
            return respond({ error: 'Amount must be a number.' }, 400)
        }
        const hasAmount = body.amount !== null && body.amount !== undefined && body.amount !== ''
        const amount = hasAmount ? parsePendingAmount(body.amount) : null
        if (hasAmount && amount === null) {
            return respond({ error: 'Amount must be positive with at most two decimal places.' }, 400)
        }
        if (typeof body.currency !== 'string' || body.currency.length > 8) return respond({ error: 'Choose the transaction currency.' }, 400)
        if (typeof body.manual_conversion !== 'boolean') return respond({ error: 'Confirm whether the amount was manually converted.' }, 400)
        if (typeof body.date !== 'string' || (body.date !== '' && !isValidIsoDate(body.date))) {
            return respond({ error: 'Choose a valid transaction date.' }, 400)
        }
        if (typeof body.reclassification_confirmed !== 'boolean') return respond({ error: 'Confirm any transaction reclassification.' }, 400)
        if (typeof body.kind !== 'string' || !['expense', 'wallet_topup', 'self_transfer', 'payment_to_other', 'unknown'].includes(body.kind)) {
            return respond({ error: 'Choose a supported transaction kind.' }, 400)
        }
        if (typeof body.description !== 'string' || body.description.trim().length === 0 || body.description.length > 500) {
            return respond({ error: 'Description is required and must be at most 500 characters.' }, 400)
        }
        if (body.category !== null && body.category !== undefined && (typeof body.category !== 'string' || body.category.length > 120)) {
            return respond({ error: 'Category must be text with at most 120 characters.' }, 400)
        }
        if (typeof body.is_dating !== 'boolean' || typeof body.is_for_partner !== 'boolean') {
            return respond({ error: 'Dating and Partner values must be explicitly reviewed.' }, 400)
        }
        if (body.category_id !== null && body.category_id !== undefined &&
            (typeof body.category_id !== 'string' || !uuidPattern.test(body.category_id))) {
            return respond({ error: 'category_id must be a valid category ID.' }, 400)
        }

        const auth = await authenticateUserToken(token)
        if (!auth) return respond({ error: 'Invalid or expired session.' }, 401)

        const { data, error } = await auth.client.rpc('confirm_pending_transaction', {
            p_pending_id: body.pending_id,
            p_amount: amount,
            p_currency: body.currency.trim().toUpperCase(),
            p_manual_conversion: body.manual_conversion,
            p_date: body.date || null,
            p_kind: body.kind,
            p_reclassification_confirmed: body.reclassification_confirmed,
            p_description: body.description.trim(),
            p_category_id: typeof body.category_id === 'string' && body.category_id ? body.category_id : null,
            p_category: typeof body.category === 'string' ? body.category.trim() : null,
            p_is_dating: body.is_dating,
            p_is_for_partner: body.is_for_partner,
        })

        if (error) return databaseFailure(error)
        if (data && typeof data === 'object' && 'failure_code' in data && typeof data.failure_code === 'string') {
            return databaseFailure({ code: data.failure_code })
        }
        const retryAfter = rateLimitResponse(data)
        if (retryAfter !== null) return respond({ error: 'Too many requests. Please wait and try again.' }, 429, { 'Retry-After': String(retryAfter) })
        return respond({ result: data })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
}
