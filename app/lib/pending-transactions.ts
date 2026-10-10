export type PendingTransactionKind = 'expense' | 'wallet_topup' | 'self_transfer' | 'payment_to_other' | 'unknown'

export type PendingTransactionInput = {
    text?: unknown
    amount?: unknown
    currency?: unknown
    date?: unknown
    merchant?: unknown
    source?: unknown
    input_source?: unknown
    reference?: unknown
    event_id?: unknown
    type?: unknown
}

export type ParsedPendingTransaction = {
    amount: number | null
    currency: string | null
    date: string | null
    merchant: string | null
    source: string | null
    reference: string | null
    kind: PendingTransactionKind
    warning: string | null
    event_id: string | null
}

function textValue(value: unknown) {
    if (typeof value !== 'string' && typeof value !== 'number') return null
    const normalized = String(value).trim()
    return normalized || null
}

function normalizeWhitespace(value: string) {
    return value.replace(/\s+/g, ' ').trim()
}

function parseNumericAmount(value: string | null) {
    if (!value) return null
    const normalized = value.replace(/,/g, '').trim()
    const parsed = Number(normalized)
    return Number.isFinite(parsed) && parsed > 0 ? Number(parsed.toFixed(2)) : null
}

function parseCurrency(value: string | null) {
    if (!value) return null
    const original = value.trim()
    const normalized = original.toUpperCase()
    if (normalized === 'RM' || normalized === 'MYR' || normalized === 'RINGGIT') return 'MYR'
    return /^[A-Z]{3}$/.test(original) ? original : null
}

function parseDate(value: string | null) {
    if (!value) return null
    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
    if (iso) {
        const candidate = `${iso[1]}-${iso[2]}-${iso[3]}`
        const date = new Date(`${candidate}T00:00:00Z`)
        return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null
    }

    const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value.trim())
    if (!slash) return null
    const first = Number(slash[1])
    const second = Number(slash[2])
    if (first <= 12 && second <= 12) return null
    const month = first > 12 ? second : first
    const day = first > 12 ? first : second
    const candidate = `${slash[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const date = new Date(`${candidate}T00:00:00Z`)
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === candidate ? candidate : null
}

function labelledValue(text: string, labels: string[]) {
    const pattern = new RegExp(`(?:${labels.join('|')})\\s*[:=]\\s*([^\\n\\r]+)`, 'i')
    return text.match(pattern)?.[1]?.trim() ?? null
}

function detectKind(text: string, explicitType: string | null): PendingTransactionKind {
    const normalized = text.toLowerCase()
    if (/\b(failed|declined|rejected|pending|processing|cancelled|canceled|voided|reversed)\b/.test(normalized)) return 'unknown'
    if (/wallet\s*top[- ]?up|top[- ]?up|reload/.test(normalized)) return 'wallet_topup'
    if (/\b(self[- ]?transfer|transfer between my (?:own )?accounts|between my (?:own )?accounts|my own account)\b/.test(normalized)) return 'self_transfer'
    if (/\btransfer\s+to\s+\S+|\bpayment\s+to\s+\S+/.test(normalized)) return 'payment_to_other'
    if (/\btransfer\b/.test(normalized)) return 'unknown'
    if (/\b(unknown|unclear|unrecognized)\b/.test(normalized)) return 'unknown'
    if (explicitType === 'unknown') return 'unknown'
    if (explicitType === 'wallet_topup' || explicitType === 'self_transfer' || explicitType === 'payment_to_other') return explicitType
    if (explicitType === 'expense') return 'expense'
    return 'expense'
}

function parseAmountAndCurrency(text: string, explicitAmount: unknown, explicitCurrency: unknown) {
    const explicitCurrencyValue = parseCurrency(textValue(explicitCurrency))
    const labelledMatches = Array.from(
        text.matchAll(/(?:grand\s+total|total|amount\s+paid|amount|paid|payment)[ \t]*[:=]?[ \t]*(?:(RM|MYR|[A-Z]{3})[ \t]*)?([0-9][0-9,.]*)(?:[ \t]*(RM|MYR|[A-Z]{3}))?/gi)
    )
    const currencyMatches = Array.from(
        text.matchAll(/\b(RM|MYR|[A-Z]{3})[ \t]*([0-9][0-9,.]*)\b|\b([0-9][0-9,.]*)[ \t]*(RM|MYR|[A-Z]{3})\b/gi)
    )

    const labelledAmounts = labelledMatches.map((match) => parseNumericAmount(match[2])).filter((value) => value !== null)
    const currencies = new Set<string>()
    for (const match of labelledMatches) {
        const currency = parseCurrency(match[1] ?? match[3] ?? null)
        if (currency) currencies.add(currency)
    }
    for (const match of currencyMatches) {
        const currency = parseCurrency(match[1] ?? match[4] ?? null)
        if (currency) currencies.add(currency)
    }

    let detectedCurrency = explicitCurrencyValue ?? (currencies.size === 1 ? Array.from(currencies)[0] ?? null : null)
    const explicitAmountValue = parseNumericAmount(textValue(explicitAmount))
    let amount = explicitAmountValue
    let ambiguousAmount = false
    if (amount === null) {
        const sourceAmounts = labelledAmounts.length > 0
            ? labelledAmounts
            : currencyMatches.map((match) => parseNumericAmount(match[2] ?? match[3] ?? null)).filter((value) => value !== null)
        const uniqueAmounts = new Set(sourceAmounts)
        if (uniqueAmounts.size === 1) amount = Array.from(uniqueAmounts)[0] ?? null
        else if (uniqueAmounts.size > 1) ambiguousAmount = true
    }

    const conflictingExplicitCurrency = explicitCurrencyValue !== null && currencies.size > 0 &&
        (currencies.size !== 1 || !currencies.has(explicitCurrencyValue))
    const ambiguousCurrency = currencies.size > 1 || conflictingExplicitCurrency
    if (ambiguousCurrency) detectedCurrency = null
    const unsupportedCurrency = detectedCurrency !== null && detectedCurrency !== 'MYR'
    return {
        amount: unsupportedCurrency || ambiguousCurrency || ambiguousAmount ? null : amount,
        currency: detectedCurrency,
        warning: unsupportedCurrency ? 'unsupported_currency' : ambiguousCurrency ? 'ambiguous_currency' : ambiguousAmount ? 'ambiguous_amount_and_date' : null,
    }
}

function extractDateCandidates(text: string) {
    return Array.from(text.matchAll(/\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})\b/g), (match) => match[0])
}

export function parsePendingTransactionInput(input: PendingTransactionInput | string): ParsedPendingTransaction {
    const objectInput = typeof input === 'string' ? {} : input
    const rawText = typeof input === 'string' ? input : textValue(input.text) ?? ''
    const amount = parseAmountAndCurrency(rawText, objectInput.amount, objectInput.currency)
    const explicitDateValue = textValue(objectInput.date)
    const dateCandidates = explicitDateValue
        ? [explicitDateValue]
        : extractDateCandidates(rawText)
    const normalizedDates = dateCandidates.map(parseDate)
    const validDates = new Set(normalizedDates.filter((value) => value !== null))
    const ambiguousDate = dateCandidates.length > 1 && validDates.size !== 1
        ? true
        : dateCandidates.length > 1 && validDates.size > 1
    const date = ambiguousDate ? null : validDates.size === 1 && dateCandidates.every((value) => parseDate(value) !== null)
        ? Array.from(validDates)[0] ?? null
        : null
    const merchant = textValue(objectInput.merchant) ?? labelledValue(rawText, ['merchant', 'merchant name', 'store', 'shop', 'vendor'])
    const source = textValue(objectInput.source) ?? labelledValue(rawText, ['source', 'paid with', 'payment method'])
    const reference = textValue(objectInput.reference) ?? labelledValue(rawText, ['ref', 'reference', 'transaction id', 'receipt no', 'receipt number'])
    const eventId = textValue(objectInput.event_id)
    const kind = detectKind(rawText, textValue(objectInput.type))
    const warnings = [amount.warning]
    if (ambiguousDate || (dateCandidates.length > 0 && date === null)) warnings.push('ambiguous_date')
    if (/\b(failed|declined|rejected|pending|processing|cancelled|canceled|voided|reversed)\b/i.test(rawText)) warnings.push('transaction_not_confirmed')
    else if (kind === 'unknown' && /\btransfer\b/i.test(rawText)) warnings.push('transfer_requires_review')
    if (amount.amount === null && !amount.warning && /\b(?:RM|MYR)\s*[0-9]/i.test(rawText)) warnings.push('ambiguous_amount_and_date')
    const warning = Array.from(new Set(warnings.filter((value): value is string => Boolean(value)))).join(',') || null

    return {
        amount: amount.amount,
        currency: amount.currency,
        date,
        merchant: merchant ? normalizeWhitespace(merchant) : null,
        source: source ? normalizeWhitespace(source) : null,
        reference: reference ? normalizeWhitespace(reference) : null,
        event_id: eventId ? normalizeWhitespace(eventId) : null,
        kind,
        warning,
    }
}

