'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/app/lib/supabase-browser'
import type { PendingTransactionKind } from '@/app/lib/pending-transactions'

type CategoryOption = { id: string; name: string }

type PendingRow = {
    id: string
    source: string
    raw_text: string
    parsed_amount: number | string | null
    parsed_currency: string | null
    selected_currency: string | null
    manual_conversion: boolean
    parsed_date: string | null
    parsed_merchant: string | null
    parsed_source: string | null
    parsed_reference: string | null
    parsed_event_id: string | null
    parsed_type: PendingTransactionKind
    parse_warning: string | null
    possible_duplicates: Array<{
        record_type: 'pending' | 'expense'
        id: string
        description: string
        amount: number | string
        date: string
    }> | null
    status: 'pending' | 'confirmed' | 'ignored'
    description: string | null
    category_id: string | null
    suggested_category_id: string | null
    reclassification_confirmed: boolean
    is_dating: boolean
    is_for_partner: boolean
}

type TokenRow = {
    id: string
    label: string
    expires_at: string
    revoked_at: string | null
}

type Draft = {
    amount: string
    date: string
    description: string
    categoryId: string
    currency: string
    manualConversion: boolean
    kind: PendingTransactionKind
    reclassificationConfirmed: boolean
    dating: boolean
    partner: boolean
}

function toAmount(value: number | string | null) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
}

function OriginalReceiptText({ text }: { text: string | null }) {
    if (!text) return null

    return (
        <details className="rounded-2xl bg-white p-3 text-xs text-stone-600">
            <summary className="cursor-pointer font-black text-stone-600">Original receipt text</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans">{text}</pre>
        </details>
    )
}

function draftFor(row: PendingRow): Draft {
    const amount = toAmount(row.parsed_amount)

    return {
        amount: amount === null ? '' : amount.toFixed(2),
        date: row.parsed_date ?? '',
        description: row.description ?? row.parsed_merchant ?? '',
        categoryId: row.category_id ?? row.suggested_category_id ?? '',
        currency: row.selected_currency ?? row.parsed_currency ?? '',
        manualConversion: row.manual_conversion,
        kind: row.parsed_type,
        reclassificationConfirmed: row.reclassification_confirmed,
        dating: row.is_dating,
        partner: row.is_for_partner,
    }
}

async function accessToken() {
    const { data } = await supabaseBrowser().auth.getSession()
    if (!data.session?.access_token) throw new Error('Please sign in again before managing pending transactions.')
    return data.session.access_token
}

export default function PendingTransactionsInbox({
    categories,
    onConfirmed,
}: {
    categories: CategoryOption[]
    onConfirmed?: () => Promise<void>
}) {
    const [pending, setPending] = useState<PendingRow[]>([])
    const [tokens, setTokens] = useState<TokenRow[]>([])
    const [drafts, setDrafts] = useState<Record<string, Draft>>({})
    const [pasteText, setPasteText] = useState('')
    const [newToken, setNewToken] = useState<string | null>(null)
    const [newTokenExpiresAt, setNewTokenExpiresAt] = useState<string | null>(null)
    const [notice, setNotice] = useState<string | null>(null)
    const [expanded, setExpanded] = useState(false)
    const [loading, setLoading] = useState(true)
    const [savingId, setSavingId] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const categoryOptions = useMemo(() => categories.filter((category) => category.id && category.name), [categories])

    const load = useCallback(async (resetDraftId?: string) => {
        try {
            setError(null)
            const token = await accessToken()
            const headers = { Authorization: `Bearer ${token}` }
            const [pendingResponse, tokensResponse] = await Promise.all([
                fetch('/api/pending-transactions', { headers }),
                fetch('/api/pending-transactions/tokens', { headers }),
            ])
            const pendingPayload = await pendingResponse.json() as { pending?: PendingRow[]; error?: string }
            const tokensPayload = await tokensResponse.json() as { tokens?: TokenRow[]; error?: string }
            if (!pendingResponse.ok) throw new Error(pendingPayload.error ?? 'Unable to load pending transactions.')
            if (!tokensResponse.ok) throw new Error(tokensPayload.error ?? 'Unable to load import tokens.')
            const rows = pendingPayload.pending ?? []
            setPending(rows)
            setTokens(tokensPayload.tokens ?? [])
            setDrafts((current) => Object.fromEntries(rows.map((row) => [
                row.id,
                row.id === resetDraftId ? draftFor(row) : current[row.id] ?? draftFor(row),
            ])))
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Unable to load pending transactions.')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        void load()
    }, [load])

    function updateDraft(id: string, patch: Partial<Draft>) {
        setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }))
    }

    async function submitPaste() {
        if (!pasteText.trim()) return
        setSavingId('paste')
        setError(null)
        try {
            const token = await accessToken()
            const response = await fetch('/api/pending-transactions', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: pasteText, input_source: 'app_paste' }),
            })
            const payload = await response.json() as { error?: string; duplicate?: boolean }
            if (!response.ok) throw new Error(payload.error ?? 'Unable to import receipt text.')
            setNotice(payload.duplicate ? 'This provider reference was already imported. The existing item remains available for review.' : 'Receipt added to the pending inbox.')
            setPasteText('')
            await load()
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : 'Unable to import receipt text.')
        } finally {
            setSavingId(null)
        }
    }

    async function createToken() {
        setSavingId('token')
        setError(null)
        try {
            const token = await accessToken()
            const response = await fetch('/api/pending-transactions/tokens', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: 'iPhone Shortcuts' }),
            })
            const payload = await response.json() as {
                token?: string
                token_record?: { expires_at?: string }
                error?: string
            }
            if (!response.ok || !payload.token) throw new Error(payload.error ?? 'Unable to create import token.')
            setNewToken(payload.token)
            setNewTokenExpiresAt(payload.token_record?.expires_at ?? null)
            await load()
        } catch (tokenError) {
            setError(tokenError instanceof Error ? tokenError.message : 'Unable to create import token.')
        } finally {
            setSavingId(null)
        }
    }

    async function revokeToken(id: string) {
        setSavingId(`token:${id}`)
        setError(null)
        try {
            const token = await accessToken()
            const response = await fetch(`/api/pending-transactions/tokens/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            })
            const payload = await response.json() as { error?: string }
            if (!response.ok) throw new Error(payload.error ?? 'Unable to revoke token.')
            await load()
        } catch (revokeError) {
            setError(revokeError instanceof Error ? revokeError.message : 'Unable to revoke token.')
        } finally {
            setSavingId(null)
        }
    }

    async function confirm(row: PendingRow) {
        const draft = drafts[row.id]
        if (!draft) return
        if (draft.kind !== 'expense') {
            setError('Choose Expense only if you reviewed this transaction and it is an actual purchase. Top-ups and self-transfers should stay selected and be ignored.')
            return
        }
        if (row.parsed_type !== 'expense' && !draft.reclassificationConfirmed) {
            setError('Confirm that you reviewed the original transfer/top-up/unknown record before classifying it as an expense.')
            return
        }
        if (draft.currency.trim().toUpperCase() !== 'MYR') {
            setError('Choose MYR before confirming an expense.')
            return
        }
        if (row.parsed_currency !== 'MYR' && !draft.manualConversion) {
            setError('For an unknown or foreign currency, enter the converted RM amount and confirm the manual conversion.')
            return
        }
        if (!draft.amount || !draft.date || !draft.description.trim() || !draft.categoryId) {
            setError('Before confirming, provide amount, date, description, and category.')
            return
        }
        setSavingId(row.id)
        setError(null)
        try {
            const token = await accessToken()
            const category = categoryOptions.find((option) => option.id === draft.categoryId)
            const response = await fetch('/api/pending-transactions/confirm', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pending_id: row.id,
                    amount: Number(draft.amount),
                    currency: draft.currency.trim().toUpperCase(),
                    manual_conversion: draft.manualConversion,
                    date: draft.date,
                    kind: draft.kind,
                    reclassification_confirmed: draft.reclassificationConfirmed,
                    description: draft.description,
                    category_id: draft.categoryId,
                    category: category?.name ?? null,
                    is_dating: draft.dating,
                    is_for_partner: draft.partner,
                }),
            })
            const payload = await response.json() as { error?: string }
            if (!response.ok) throw new Error(payload.error ?? 'Unable to confirm transaction.')
            await load()
            await onConfirmed?.()
        } catch (confirmError) {
            setError(confirmError instanceof Error ? confirmError.message : 'Unable to confirm transaction.')
        } finally {
            setSavingId(null)
        }
    }

    async function saveReview(row: PendingRow) {
        const draft = drafts[row.id]
        if (!draft) return
        setSavingId(row.id)
        setError(null)
        try {
            const token = await accessToken()
            const category = categoryOptions.find((option) => option.id === draft.categoryId)
            const response = await fetch('/api/pending-transactions', {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    pending_id: row.id,
                    amount: draft.amount ? Number(draft.amount) : null,
                    currency: draft.currency.trim().toUpperCase(),
                    manual_conversion: draft.manualConversion,
                    date: draft.date,
                    description: draft.description,
                    category_id: draft.categoryId || null,
                    category: category?.name ?? null,
                    kind: draft.kind,
                    reclassification_confirmed: draft.reclassificationConfirmed,
                    is_dating: draft.dating,
                    is_for_partner: draft.partner,
                }),
            })
            const payload = await response.json() as { error?: string }
            if (!response.ok) throw new Error(payload.error ?? 'Unable to save review changes.')
            setNotice('Review changes saved. The transaction is still pending until you confirm it.')
            await load(row.id)
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : 'Unable to save review changes.')
        } finally {
            setSavingId(null)
        }
    }

    async function ignore(row: PendingRow) {
        setSavingId(row.id)
        setError(null)
        try {
            const token = await accessToken()
            const response = await fetch('/api/pending-transactions/ignore', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ pending_id: row.id }),
            })
            const payload = await response.json() as { error?: string }
            if (!response.ok) throw new Error(payload.error ?? 'Unable to ignore transaction.')
            await load()
        } catch (ignoreError) {
            setError(ignoreError instanceof Error ? ignoreError.message : 'Unable to ignore transaction.')
        } finally {
            setSavingId(null)
        }
    }

    return (
        <section className="space-y-3 rounded-[2rem] bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-black uppercase tracking-widest text-sky-500">Import inbox</p>
                    <h2 className="text-lg font-black text-stone-800">Pending Transactions</h2>
                    <p className="mt-1 text-xs font-bold text-stone-400">Nothing enters your finances until you confirm it.</p>
                </div>
                <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-2xl bg-stone-100 px-3 py-2 text-xs font-black text-stone-600" aria-expanded={expanded}>
                    {expanded ? 'Hide' : `${pending.length} pending`}
                </button>
            </div>
            {error ? <div className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-600">{error}</div> : null}
            {notice ? <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{notice}</div> : null}
            {expanded ? (
                <>
                    <div className="space-y-2 rounded-3xl bg-stone-50 p-3">
                        <p className="text-xs font-black text-stone-700">Paste receipt text fallback</p>
                        <textarea value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder="Paste receipt text here..." rows={4} maxLength={20000} className="w-full rounded-2xl border-0 bg-white p-3 text-sm font-bold text-stone-700 outline-none ring-1 ring-stone-100 focus:ring-2 focus:ring-rose-200" />
                        <button type="button" onClick={submitPaste} disabled={!pasteText.trim() || savingId === 'paste'} className="w-full rounded-2xl bg-stone-800 px-4 py-3 text-xs font-black text-white disabled:opacity-40">
                            {savingId === 'paste' ? 'Importing...' : 'Add to pending inbox'}
                        </button>
                    </div>
                    <div className="space-y-2 rounded-3xl bg-sky-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-xs font-black text-sky-800">iPhone Shortcuts connection</p>
                                <p className="mt-1 text-[11px] font-bold text-sky-600">Tokens expire after 90 days. Create a replacement and update the Shortcut before expiry; revoke the old token afterward. The token is shown once and stored only as a hash.</p>
                            </div>
                            <button type="button" onClick={createToken} disabled={savingId === 'token'} className="rounded-2xl bg-white px-3 py-2 text-xs font-black text-sky-700 disabled:opacity-40">New token</button>
                        </div>
                        {newToken ? (
                            <div className="space-y-2 rounded-2xl bg-white p-3">
                                <p className="break-all font-mono text-[11px] text-stone-700">{newToken}</p>
                                {newTokenExpiresAt ? <p className="text-[11px] font-bold text-amber-700">Expires {new Date(newTokenExpiresAt).toLocaleDateString()}.</p> : null}
                                <button type="button" onClick={() => void navigator.clipboard?.writeText(newToken)} className="rounded-xl bg-stone-100 px-3 py-2 text-[11px] font-black text-stone-600">Copy token</button>
                            </div>
                        ) : null}
                        {tokens.filter((token) => !token.revoked_at).map((token) => {
                            const expired = Date.parse(token.expires_at) <= Date.now()
                            return (
                                <div key={token.id} className="flex items-center justify-between gap-3 text-[11px] font-bold text-sky-700">
                                    <span>{token.label} · {expired ? 'Expired; replace it in Shortcuts' : `Expires ${new Date(token.expires_at).toLocaleDateString()}`}</span>
                                    <button type="button" onClick={() => void revokeToken(token.id)} disabled={savingId === `token:${token.id}`} className="rounded-xl bg-white px-3 py-2 font-black text-red-500 disabled:opacity-40">Revoke</button>
                                </div>
                            )
                        })}
                    </div>
                    {loading ? <p className="rounded-2xl bg-stone-50 p-4 text-center text-xs font-black text-stone-400">Loading pending imports...</p> : null}
                    {!loading && pending.length === 0 ? <p className="rounded-2xl bg-stone-50 p-4 text-center text-xs font-black text-stone-400">No pending imports.</p> : null}
                    <div className="space-y-3">
                        {pending.map((row) => {
                            const draft = drafts[row.id] ?? draftFor(row)
                            const needsReclassification = row.parsed_type !== 'expense' && draft.kind === 'expense'
                            const needsManualConversion = row.parsed_currency !== 'MYR'
                            const canConfirm = draft.kind === 'expense'
                                && (!needsReclassification || draft.reclassificationConfirmed)
                                && draft.currency.trim().toUpperCase() === 'MYR'
                                && (!needsManualConversion || draft.manualConversion)
                                && Boolean(draft.amount && draft.date && draft.description.trim() && draft.categoryId)
                            return (
                                <article key={row.id} className="space-y-3 rounded-3xl border border-stone-100 bg-stone-50 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate font-black text-stone-800">{row.parsed_merchant || 'Unlabelled import'}</p>
                                            <p className="mt-1 text-[11px] font-bold text-stone-400">{row.source} · {row.parsed_reference || row.parsed_event_id || 'no stable reference'}{row.parsed_source ? ` · ${row.parsed_source}` : ''}</p>
                                        </div>
                                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${row.parsed_type === 'expense' ? 'bg-white text-stone-500' : 'bg-amber-100 text-amber-700'}`}>{row.parsed_type.replaceAll('_', ' ')}</span>
                                    </div>
                                    {row.parsed_type === 'wallet_topup' || row.parsed_type === 'self_transfer' ? <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-700">This was detected as a {row.parsed_type.replaceAll('_', ' ')}. It stays out of expenses unless you deliberately choose Expense and confirm the review below.</p> : null}
                                    {row.parsed_type === 'payment_to_other' || row.parsed_type === 'unknown' ? <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-700">The transaction type needs your review. Choose Expense only if this was an actual purchase; otherwise leave the detected type and Ignore it.</p> : null}
                                    {row.parsed_currency && row.parsed_currency !== 'MYR' ? <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-700">Detected {row.parsed_currency}; this amount is not treated as RM. Enter the converted amount, choose MYR, and confirm the manual conversion.</p> : null}
                                    {row.parsed_currency === null ? <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-700">Currency was not identified. Confirm MYR only after you verify the receipt and amount yourself.</p> : null}
                                    {row.parse_warning ? <p className="rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-700">{row.parse_warning.split(',').map((warning) => warning.replaceAll('_', ' ')).join(' · ')}. Please review the fields.</p> : null}
                                    <OriginalReceiptText text={row.raw_text} />
                                    {row.possible_duplicates?.length ? (
                                        <div className="space-y-1 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800" role="status">
                                            <p>Possible duplicate match. This import is still kept; review both records before deciding.</p>
                                            {row.possible_duplicates.map((duplicate) => <p key={`${duplicate.record_type}-${duplicate.id}`}>{duplicate.description} · RM {Number(duplicate.amount).toFixed(2)} · {duplicate.date}</p>)}
                                        </div>
                                    ) : null}
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Amount<input value={draft.amount} onChange={(event) => updateDraft(row.id, { amount: event.target.value })} type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm font-black text-stone-700 ring-1 ring-stone-100" /></label>
                                        <label className="text-[10px] font-black uppercase tracking-widest text-stone-400">Date<input value={draft.date} onChange={(event) => updateDraft(row.id, { date: event.target.value })} type="date" className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm font-black text-stone-700 ring-1 ring-stone-100" /></label>
                                    </div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">Currency code<input value={draft.currency} maxLength={8} onChange={(event) => {
                                        const currency = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8)
                                        updateDraft(row.id, { currency, manualConversion: currency === 'MYR' ? draft.manualConversion : false })
                                    }} placeholder="MYR" className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm font-black text-stone-700 ring-1 ring-stone-100" /></label>
                                    {row.parsed_currency !== 'MYR' ? <label className="flex items-start gap-2 rounded-2xl bg-white p-3 text-xs font-bold text-stone-600"><input type="checkbox" checked={draft.manualConversion} onChange={(event) => updateDraft(row.id, { manualConversion: event.target.checked })} className="mt-0.5 accent-emerald-600" /><span>I manually converted the amount above to MYR and verified the conversion.</span></label> : null}
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">Description<input value={draft.description} maxLength={500} onChange={(event) => updateDraft(row.id, { description: event.target.value })} className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm font-black text-stone-700 ring-1 ring-stone-100" /></label>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">Category · review before confirming<select value={draft.categoryId} onChange={(event) => updateDraft(row.id, { categoryId: event.target.value })} className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm font-black text-stone-700 ring-1 ring-stone-100"><option value="">Choose category</option>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
                                    {!row.category_id && row.suggested_category_id ? <p className="-mt-2 text-[11px] font-bold text-sky-700">Suggested from your confirmed imports for this exact merchant. Please review it.</p> : null}
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400">Transaction kind<select value={draft.kind} onChange={(event) => updateDraft(row.id, { kind: event.target.value as PendingTransactionKind, reclassificationConfirmed: false })} className="mt-1 w-full rounded-xl border-0 bg-white px-3 py-2 text-sm font-black text-stone-700 ring-1 ring-stone-100"><option value="unknown">Needs review</option><option value="expense">Expense</option><option value="wallet_topup">Wallet top-up</option><option value="self_transfer">Transfer between my accounts</option><option value="payment_to_other">Payment to another person</option></select></label>
                                    {draft.kind === 'expense' && row.parsed_type !== 'expense' ? <label className="flex items-start gap-2 rounded-2xl bg-white p-3 text-xs font-bold text-stone-600"><input type="checkbox" checked={draft.reclassificationConfirmed} onChange={(event) => updateDraft(row.id, { reclassificationConfirmed: event.target.checked })} className="mt-0.5 accent-emerald-600" /><span>I reviewed this {row.parsed_type.replaceAll('_', ' ')} and confirm it was a real expense.</span></label> : null}
                                    <div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={draft.dating} onClick={() => updateDraft(row.id, { dating: !draft.dating })} className={`rounded-xl px-3 py-2 text-xs font-black ${draft.dating ? 'bg-rose-400 text-white' : 'bg-white text-rose-500'}`}>Dating</button><button type="button" aria-pressed={draft.partner} onClick={() => updateDraft(row.id, { partner: !draft.partner })} className={`rounded-xl px-3 py-2 text-xs font-black ${draft.partner ? 'bg-amber-400 text-white' : 'bg-white text-amber-700'}`}>Partner</button></div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button type="button" onClick={() => void saveReview(row)} disabled={savingId === row.id} className="rounded-2xl bg-white px-3 py-3 text-xs font-black text-stone-600 disabled:opacity-40">Save review</button>
                                        <button type="button" onClick={() => void confirm(row)} disabled={savingId === row.id || !canConfirm} className="rounded-2xl bg-emerald-500 px-3 py-3 text-xs font-black text-white disabled:opacity-40">{savingId === row.id ? 'Saving...' : 'Confirm expense'}</button>
                                        <button type="button" onClick={() => void ignore(row)} disabled={savingId === row.id} className="rounded-2xl bg-stone-200 px-3 py-3 text-xs font-black text-stone-600 disabled:opacity-40">Ignore</button>
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                </>
            ) : null}
        </section>
    )
}
