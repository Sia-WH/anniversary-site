import { createClient } from '@supabase/supabase-js'
import {
    parsePendingTransactionInput,
    type ParsedPendingTransaction,
    type PendingTransactionInput,
} from './pending-transactions'

export type PendingImportSource = 'shortcut_http' | 'shortcut_ocr' | 'app_paste'

export type PendingInsertInput = {
    source: PendingImportSource
    rawText: string
    parsed: ParsedPendingTransaction
}

export function getBearerToken(request: Request) {
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) return null
    const token = authorization.slice('Bearer '.length).trim()
    return token && token.length <= 4096 ? token : null
}

export function isPairingToken(token: string) {
    return token.startsWith('pti_')
}

export function createUserSupabaseClient(token: string) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !anonKey) throw new Error('Supabase is not configured.')
    return createClient(
        supabaseUrl,
        anonKey,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
    )
}

export function createServiceSupabaseClient() {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) throw new Error('Shortcut import is not configured: SUPABASE_SERVICE_ROLE_KEY is missing.')
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) throw new Error('Supabase is not configured.')

    return createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

export async function sha256Hex(value: string) {
    const bytes = new TextEncoder().encode(value)
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
}

export function createPairingToken() {
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const value = Buffer.from(bytes).toString('base64url')
    return `pti_${value}`
}

export function normalizePendingSource(value: unknown, fallback: PendingImportSource): PendingImportSource {
    return value === 'shortcut_ocr' || value === 'app_paste' || value === 'shortcut_http' ? value : fallback
}

const inputTextLimits: Record<string, number> = {
    text: 20000,
    currency: 8,
    date: 40,
    merchant: 200,
    source: 120,
    reference: 250,
    event_id: 250,
    type: 32,
    input_source: 32,
}

export function parsePendingAmount(value: unknown): number | null {
    if (typeof value !== 'number' && typeof value !== 'string') return null
    const match = /^\+?(?:(\d+)(?:\.(\d{0,2}))?|\.(\d{1,2}))$/.exec(String(value).trim())
    if (!match) return null

    const cents = Number(match[1] ?? '0') * 100 + Number((match[2] ?? match[3] ?? '').padEnd(2, '0'))
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 999_999_999_999) return null
    return cents / 100
}

export function validatePendingInput(value: unknown): PendingTransactionInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request body must be a JSON object.')
    const body = value as Record<string, unknown>
    const normalized: PendingTransactionInput = {}

    for (const [field, maxLength] of Object.entries(inputTextLimits)) {
        const fieldValue = body[field]
        if (fieldValue === undefined || fieldValue === null) continue
        if (typeof fieldValue !== 'string') throw new Error(`${field} must be text.`)
        if (fieldValue.length > maxLength) throw new Error(`${field} is too long.`)
        normalized[field as keyof PendingTransactionInput] = fieldValue as never
    }

    if (body.amount !== undefined && body.amount !== null && body.amount !== '') {
        if (typeof body.amount !== 'number' && typeof body.amount !== 'string') throw new Error('amount must be a number.')
        const amount = parsePendingAmount(body.amount)
        if (amount === null) {
            throw new Error('amount must be a positive amount with at most two decimal places.')
        }
        normalized.amount = amount
    }

    if (typeof normalized.type === 'string' && !['expense', 'wallet_topup', 'self_transfer', 'payment_to_other', 'unknown'].includes(normalized.type)) {
        throw new Error('type is not supported.')
    }
    if (typeof normalized.input_source === 'string' && !['shortcut_http', 'shortcut_ocr', 'app_paste'].includes(normalized.input_source)) {
        throw new Error('input_source is not supported.')
    }
    return normalized
}

export type ReadJsonResult =
    | { ok: true; value: unknown }
    | { ok: false; status: 400 | 413; error: string }

export async function readJsonRequest(request: Request, maxBytes = 32768): Promise<ReadJsonResult> {
    const contentLength = request.headers.get('content-length')
    if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
        return { ok: false, status: 413, error: 'Request body is too large.' }
    }
    if (!request.body) return { ok: false, status: 400, error: 'A JSON request body is required.' }

    const reader = request.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            totalBytes += value.byteLength
            if (totalBytes > maxBytes) {
                try {
                    await reader.cancel()
                } catch {
                    // The body is rejected even when the sender has already closed its stream.
                }
                return { ok: false, status: 413, error: 'Request body is too large.' }
            }
            chunks.push(value)
        }
    } catch {
        return { ok: false, status: 400, error: 'Request body could not be read.' }
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
    }

    try {
        return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown }
    } catch {
        return { ok: false, status: 400, error: 'Request body must contain valid JSON.' }
    }
}

export function parsePendingBody(body: unknown) {
    const normalized = validatePendingInput(body)
    const rawText = typeof normalized.text === 'string'
        ? normalized.text
        : JSON.stringify({
            amount: normalized.amount,
            currency: normalized.currency,
            date: normalized.date,
            merchant: normalized.merchant,
            source: normalized.source,
            reference: normalized.reference,
            event_id: normalized.event_id,
            type: normalized.type,
        })
    if (rawText.length > 20000) throw new Error('Receipt text is too long.')
    return {
        rawText,
        parsed: parsePendingTransactionInput(normalized),
    }
}

export async function buildPendingInsertInput(
    body: unknown,
    source: PendingImportSource
): Promise<PendingInsertInput> {
    const { rawText, parsed } = parsePendingBody(body)

    return {
        source,
        rawText,
        parsed,
    }
}

export async function authenticateUserToken(token: string) {
    const client = createUserSupabaseClient(token)
    const { data, error } = await client.auth.getUser()
    if (error || !data.user) return null
    return { client, user: data.user }
}

export function pendingDatabaseFailure(error: unknown) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
    if (['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'].includes(code)) {
        return { status: 503, error: 'Pending transaction setup is incomplete. Apply supabase/pending-transactions.sql and reload the API schema.' }
    }
    if (code === '42501') return { status: 403, error: 'This action is not allowed for this account.' }
    if (code === '28000') return { status: 401, error: 'The import token is invalid or expired.' }
    if (code === 'P0002') return { status: 404, error: 'This pending transaction or token could not be found.' }
    if (code === 'P0001') return { status: 409, error: 'This pending transaction has changed. Reload it and review again.' }
    if (code === '22023') return { status: 400, error: 'Review the amount, currency, date, description, category, and transaction kind.' }
    return { status: 500, error: 'Pending transaction service could not complete the request.' }
}

export function rateLimitResponse(value: unknown) {
    if (!value || typeof value !== 'object' || !('rate_limited' in value) || value.rate_limited !== true) return null
    const retry = 'retry_after_seconds' in value ? Number(value.retry_after_seconds) : 60
    return Math.max(1, Math.min(86400, Number.isFinite(retry) ? Math.ceil(retry) : 60))
}

export function isValidIsoDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const [year, month, day] = value.split('-').map(Number)
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}
