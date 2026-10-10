import { NextResponse } from 'next/server'
import {
    authenticateUserToken,
    buildPendingInsertInput,
    createServiceSupabaseClient,
    getBearerToken,
    isValidIsoDate,
    isPairingToken,
    normalizePendingSource,
    parsePendingAmount,
    pendingDatabaseFailure,
    rateLimitResponse,
    readJsonRequest,
    sha256Hex,
    validatePendingInput,
} from '@/app/lib/pending-transactions-server'

function respond(value: unknown, status = 200, headers: Record<string, string> = {}) {
    return NextResponse.json(value, {
        status,
        headers: { 'Cache-Control': 'no-store', ...headers },
    })
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
    if (!token || isPairingToken(token)) {
        return respond({ error: 'A signed-in app session is required.' }, 401)
    }

    let auth
    try {
        auth = await authenticateUserToken(token)
    } catch {
        return respond({ error: 'Pending transaction service is not configured.' }, 503)
    }
    if (!auth) return respond({ error: 'Invalid or expired session.' }, 401)

    let limit
    try {
        limit = await auth.client.rpc('enforce_pending_rate_limit', { p_action: 'pending_list' })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
    if (limit.error) return databaseFailure(limit.error)
    const limited = rateLimited(limit.data)
    if (limited) return limited

    let result
    try {
        result = await auth.client
            .from('pending_transactions')
            .select('id, source, raw_text, parsed_amount, parsed_currency, selected_currency, manual_conversion, parsed_date, parsed_merchant, parsed_source, parsed_reference, parsed_event_id, parsed_type, parse_warning, possible_duplicates, status, description, category, category_id, reclassification_confirmed, is_dating, is_for_partner, created_at, updated_at')
            .eq('user_id', auth.user.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
    const { data, error } = result

    if (error) return databaseFailure(error)
    const suggestedCategoryByPendingId = new Map<string, string>()
    try {
        const suggestions = await auth.client.rpc('suggest_pending_transaction_categories')
        if (!suggestions.error && Array.isArray(suggestions.data)) {
            for (const suggestion of suggestions.data) {
                if (!suggestion || typeof suggestion !== 'object') continue
                const value = suggestion as Record<string, unknown>
                if (typeof value.pending_id === 'string' && typeof value.category_id === 'string') {
                    suggestedCategoryByPendingId.set(value.pending_id, value.category_id)
                }
            }
        }
    } catch {
        // Suggestions are optional; the owner can still choose a category manually.
    }
    const pending = (data ?? []).map((row) => ({
        ...row,
        suggested_category_id: suggestedCategoryByPendingId.get(row.id) ?? null,
    }))
    return respond({ pending })
}

export async function POST(request: Request) {
    const token = getBearerToken(request)
    if (!token) return respond({ error: 'Missing authentication token.' }, 401)

    const bodyResult = await readJsonRequest(request)
    if (!bodyResult.ok) return respond({ error: bodyResult.error }, bodyResult.status)

    let normalizedBody
    let insertInput
    try {
        normalizedBody = validatePendingInput(bodyResult.value)
        const fallbackSource = isPairingToken(token) ? 'shortcut_http' : 'app_paste'
        const source = normalizePendingSource(normalizedBody.input_source, fallbackSource)
        insertInput = await buildPendingInsertInput(normalizedBody, source)
    } catch (error) {
        return respond({ error: error instanceof Error ? error.message : 'Invalid pending transaction.' }, 400)
    }

    let database
    let pairingTokenHash: string | null = null
    if (isPairingToken(token)) {
        try {
            database = createServiceSupabaseClient()
            pairingTokenHash = await sha256Hex(token)
        } catch {
            return respond({ error: 'Shortcut imports are not configured. Set SUPABASE_SERVICE_ROLE_KEY on the server.' }, 503)
        }
    } else {
        try {
            const auth = await authenticateUserToken(token)
            if (!auth) return respond({ error: 'Invalid or expired session.' }, 401)
            database = auth.client
        } catch {
            return respond({ error: 'Pending transaction service is not configured.' }, 503)
        }
    }

    let result
    try {
        result = await database.rpc('create_pending_transaction', {
            p_pairing_token_hash: pairingTokenHash,
            p_import_source: insertInput.source,
            p_raw_text: insertInput.rawText,
            p_amount: insertInput.parsed.amount,
            p_currency: insertInput.parsed.currency,
            p_date: insertInput.parsed.date,
            p_merchant: insertInput.parsed.merchant,
            p_provider: insertInput.parsed.source,
            p_reference: insertInput.parsed.reference,
            p_event_id: insertInput.parsed.event_id,
            p_kind: insertInput.parsed.kind,
            p_warning: insertInput.parsed.warning,
        })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
    const { data, error } = result
    if (error) return databaseFailure(error)

    const limited = rateLimited(data)
    if (limited) return limited
    if (!data || typeof data !== 'object' || !('duplicate' in data) || typeof data.duplicate !== 'boolean') {
        return respond({ error: 'Pending transaction service could not complete the request.' }, 503)
    }
    const duplicate = data.duplicate
    const pending = 'pending' in data && data.pending && typeof data.pending === 'object' ? data.pending : data
    const pendingId = 'pending_id' in pending && typeof pending.pending_id === 'string'
        ? pending.pending_id
        : 'id' in pending && typeof pending.id === 'string'
            ? pending.id
            : null
    const status = 'status' in pending && typeof pending.status === 'string' ? pending.status : null
    if (!pendingId || !status) return respond({ error: 'Pending transaction service could not complete the request.' }, 503)
    return respond({ duplicate, pending_id: pendingId, status }, duplicate ? 200 : 201)
}

export async function PATCH(request: Request) {
    const token = getBearerToken(request)
    if (!token || isPairingToken(token)) return respond({ error: 'A signed-in app session is required.' }, 401)
    const bodyResult = await readJsonRequest(request, 8192)
    if (!bodyResult.ok) return respond({ error: bodyResult.error }, bodyResult.status)
    if (!bodyResult.value || typeof bodyResult.value !== 'object' || Array.isArray(bodyResult.value)) {
        return respond({ error: 'Request body must be a JSON object.' }, 400)
    }
    const body = bodyResult.value as Record<string, unknown>
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

    const textFields = ['currency', 'date', 'description', 'category', 'kind'] as const
    for (const field of textFields) {
        if (body[field] !== undefined && body[field] !== null && typeof body[field] !== 'string') {
            return respond({ error: `${field} must be text.` }, 400)
        }
    }
    if (typeof body.description === 'string' && body.description.length > 500) return respond({ error: 'description is too long.' }, 400)
    if (typeof body.category === 'string' && body.category.length > 120) return respond({ error: 'category is too long.' }, 400)
    if (typeof body.date === 'string' && body.date.length > 10) return respond({ error: 'date is invalid.' }, 400)
    if (typeof body.date === 'string' && body.date !== '' && !isValidIsoDate(body.date)) return respond({ error: 'date must be a valid YYYY-MM-DD date.' }, 400)
    if (typeof body.currency === 'string' && body.currency.length > 8) return respond({ error: 'currency is invalid.' }, 400)
    if (typeof body.currency === 'string' && body.currency !== '' && !/^[A-Za-z]{2,8}$/.test(body.currency)) return respond({ error: 'currency must be a currency code.' }, 400)
    if (typeof body.kind !== 'string' || !['expense', 'wallet_topup', 'self_transfer', 'payment_to_other', 'unknown'].includes(body.kind)) {
        return respond({ error: 'Choose a supported transaction kind.' }, 400)
    }
    if (typeof body.manual_conversion !== 'boolean' || typeof body.reclassification_confirmed !== 'boolean' ||
        typeof body.is_dating !== 'boolean' || typeof body.is_for_partner !== 'boolean') {
        return respond({ error: 'Currency conversion and transaction tags must be explicitly reviewed.' }, 400)
    }
    if (body.amount !== null && body.amount !== '' && typeof body.amount !== 'number' && typeof body.amount !== 'string') {
        return respond({ error: 'amount must be a number.' }, 400)
    }
    const amount = body.amount === null || body.amount === '' ? null : parsePendingAmount(body.amount)
    if (body.amount !== null && body.amount !== '' && amount === null) {
        return respond({ error: 'amount must be a positive amount with at most two decimal places.' }, 400)
    }
    const categoryId = body.category_id === null || body.category_id === '' ? null : body.category_id
    if (categoryId !== null && (typeof categoryId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(categoryId))) {
        return respond({ error: 'category_id must be a valid category ID.' }, 400)
    }

    let result
    try {
        result = await auth.client.rpc('edit_pending_transaction', {
            p_pending_id: body.pending_id,
            p_amount: amount,
            p_currency: typeof body.currency === 'string' ? body.currency.trim().toUpperCase() : null,
            p_manual_conversion: body.manual_conversion,
            p_date: typeof body.date === 'string' && body.date ? body.date : null,
            p_description: typeof body.description === 'string' ? body.description.trim() : null,
            p_category_id: categoryId,
            p_category: typeof body.category === 'string' ? body.category.trim() : null,
            p_kind: body.kind,
            p_reclassification_confirmed: body.reclassification_confirmed,
            p_is_dating: body.is_dating,
            p_is_for_partner: body.is_for_partner,
        })
    } catch {
        return respond({ error: 'Pending transaction service is temporarily unavailable.' }, 503)
    }
    const { data, error } = result
    if (error) return databaseFailure(error)
    if (data && typeof data === 'object' && 'failure_code' in data && typeof data.failure_code === 'string') {
        return databaseFailure({ code: data.failure_code })
    }
    const limited = rateLimited(data)
    if (limited) return limited
    return respond({ result: data })
}
