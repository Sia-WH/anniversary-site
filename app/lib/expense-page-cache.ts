export type ExpensePageScope = 'partner' | 'dating'

export type ExpensePageCacheInput = {
    userId: string
    scope: ExpensePageScope
    year: string
    month: string
    day: string
    page?: number
}

type CachedValue<T> = {
    savedAt: number
    value: T
}

export const EXPENSE_PAGE_CACHE_TTL_MS = 1000 * 60 * 5

function pad2(value: string) {
    if (value === 'all') return 'all'
    return String(Number(value)).padStart(2, '0')
}

export function createExpensePageCacheKey(input: ExpensePageCacheInput) {
    const dateKey =
        input.year === 'all'
            ? 'all'
            : `${input.year}-${pad2(input.month)}-${pad2(input.day)}`
    const pageKey = typeof input.page === 'number' ? `:p${input.page}` : ''

    return `expense-page:v1:${input.scope}:${input.userId}:${dateKey}${pageKey}`
}

export function readExpensePageCache<T>(input: ExpensePageCacheInput): T | null {
    if (typeof window === 'undefined') return null

    try {
        const raw = window.localStorage.getItem(createExpensePageCacheKey(input))
        if (!raw) return null

        const parsed = JSON.parse(raw) as CachedValue<T>
        if (!parsed || Date.now() - parsed.savedAt > EXPENSE_PAGE_CACHE_TTL_MS) return null
        return parsed.value
    } catch {
        return null
    }
}

export function writeExpensePageCache<T>(input: ExpensePageCacheInput, value: T) {
    if (typeof window === 'undefined') return

    try {
        window.localStorage.setItem(
            createExpensePageCacheKey(input),
            JSON.stringify({
                savedAt: Date.now(),
                value,
            })
        )
    } catch {
        // Cache is a speed-up only. The API/database remains the source of truth.
    }
}

export function mergeUniqueExpenseRows<T extends { id: string }>(previousRows: T[], nextRows: T[]) {
    const seen = new Set(previousRows.map((row) => row.id))
    const merged = [...previousRows]

    nextRows.forEach((row) => {
        if (seen.has(row.id)) return
        seen.add(row.id)
        merged.push(row)
    })

    return merged
}
