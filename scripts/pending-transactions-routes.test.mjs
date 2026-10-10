import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const root = process.cwd()
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'

function loadTypeScriptModule(relativePath, mocks = {}) {
    const source = readFileSync(join(root, relativePath), 'utf8')
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            esModuleInterop: true,
        },
    }).outputText
    const testModule = { exports: {} }
    const fakeRequire = (specifier) => {
        if (Object.hasOwn(mocks, specifier)) return mocks[specifier]
        throw new Error(`Unexpected test import: ${specifier}`)
    }
    new Function('require', 'module', 'exports', output)(fakeRequire, testModule, testModule.exports)
    return testModule.exports
}

function makeDatabase(rpcHandler = null) {
    const calls = { rpc: [], insert: [], update: [] }
    const client = {
        auth: {
            async getUser() {
                return { data: { user: { id: 'user-1' } }, error: null }
            },
        },
        async rpc(name, args) {
            calls.rpc.push({ name, args })
            if (rpcHandler) return rpcHandler(name, args)
            if (name === 'create_pending_transaction') {
                return { data: { duplicate: false, pending_id: 'pending-1', status: 'pending' }, error: null }
            }
            if (name === 'create_pending_import_token') {
                return { data: { id: 'token-1', label: args.p_label, created_at: '2026-10-10T00:00:00Z', expires_at: '2027-01-08T00:00:00Z' }, error: null }
            }
            return { data: { status: 'confirmed', expense_id: 'expense-1' }, error: null }
        },
        from(table) {
            const query = {
                select() { return query },
                eq() { return query },
                neq() { return query },
                is() { return query },
                order() { return query },
                insert(value) { calls.insert.push({ table, value }); return query },
                update(value) { calls.update.push({ table, value }); return query },
                async single() { return { data: { id: 'pending-1', label: 'iPhone Shortcuts' }, error: null } },
                async maybeSingle() { return { data: null, error: null } },
                then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject) },
            }
            return query
        },
    }
    return { client, calls }
}

function loadEndpoint(path, { database, rpcHandler } = {}) {
    const db = database ?? makeDatabase(rpcHandler)
    const supabaseModule = { createClient: () => db.client }
    const parser = loadTypeScriptModule('app/lib/pending-transactions.ts')
    const server = loadTypeScriptModule('app/lib/pending-transactions-server.ts', {
        '@supabase/supabase-js': supabaseModule,
        './pending-transactions': parser,
    })
    const nextServer = {
        NextResponse: {
            json(body, init = {}) {
                return new Response(JSON.stringify(body), init)
            },
        },
    }
    const endpoint = loadTypeScriptModule(path, {
        'next/server': nextServer,
        '@/app/lib/pending-transactions-server': server,
        '@/app/lib/pending-transactions': parser,
    })
    return { endpoint, db }
}

function request(url, method, body, authorization = 'Bearer valid-jwt') {
    return new Request(`https://example.test${url}`, {
        method,
        headers: { authorization, 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

const amountHandlerScenarios = [
    {
        name: 'explicit import POST',
        endpoint: 'app/api/pending-transactions/route.ts',
        method: 'POST',
        url: '/api/pending-transactions',
        rpc: 'create_pending_transaction',
        acceptedStatus: 201,
        body: (amount) => ({ amount, currency: 'MYR', date: '2026-10-08', merchant: 'Kopi House', input_source: 'app_paste' }),
    },
    {
        name: 'pending PATCH',
        endpoint: 'app/api/pending-transactions/route.ts',
        method: 'PATCH',
        url: '/api/pending-transactions',
        rpc: 'edit_pending_transaction',
        acceptedStatus: 200,
        body: (amount) => ({
            pending_id: '00000000-0000-4000-8000-000000000001',
            amount,
            currency: 'MYR',
            manual_conversion: false,
            date: '2026-10-08',
            description: 'Kopi House',
            category_id: null,
            category: null,
            kind: 'expense',
            reclassification_confirmed: false,
            is_dating: false,
            is_for_partner: false,
        }),
    },
    {
        name: 'confirm POST',
        endpoint: 'app/api/pending-transactions/confirm/route.ts',
        method: 'POST',
        url: '/api/pending-transactions/confirm',
        rpc: 'confirm_pending_transaction',
        acceptedStatus: 200,
        body: (amount) => ({
            pending_id: '00000000-0000-4000-8000-000000000001',
            amount,
            currency: 'MYR',
            manual_conversion: false,
            date: '2026-10-08',
            kind: 'expense',
            reclassification_confirmed: false,
            description: 'Kopi House',
            category_id: '00000000-0000-4000-8000-000000000002',
            category: 'Food',
            is_dating: false,
            is_for_partner: false,
        }),
    },
]

for (const scenario of amountHandlerScenarios) {
    for (const [label, input, expected] of [['1.10', 1.1, 1.1], ['0.29', 0.29, 0.29]]) {
        test(`${scenario.name} accepts ${label} as exact cents`, async () => {
            const { endpoint, db } = loadEndpoint(scenario.endpoint)
            const response = await endpoint[scenario.method](request(scenario.url, scenario.method, scenario.body(input)))
            const call = db.calls.rpc.find((entry) => entry.name === scenario.rpc)

            assert.equal(response.status, scenario.acceptedStatus, await response.clone().text())
            assert.equal(call.args.p_amount, expected)
        })
    }

    test(`${scenario.name} rejects fractional cents without invoking its RPC`, async () => {
        const { endpoint, db } = loadEndpoint(scenario.endpoint)
        const response = await endpoint[scenario.method](request(scenario.url, scenario.method, scenario.body(1.001)))

        assert.equal(response.status, 400)
        assert.equal(db.calls.rpc.some((entry) => entry.name === scenario.rpc), false)
    })
}

test('pending import persists only through the restricted create RPC', async () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/route.ts')
    const response = await endpoint.POST(request('/api/pending-transactions', 'POST', {
        text: 'Merchant: Kopi House\nTotal: RM 10.00\nDate: 2026-10-08\nRef: AP-123',
        input_source: 'app_paste',
    }))

    assert.equal(response.status, 201)
    assert.equal(db.calls.insert.length, 0)
    assert.ok(db.calls.rpc.some((call) => call.name === 'create_pending_transaction'))
})

test('new import acknowledgement never returns receipt text or duplicate history', async () => {
    const { endpoint } = loadEndpoint('app/api/pending-transactions/route.ts', {
        rpcHandler: async () => ({
            data: {
                duplicate: false,
                pending: {
                    id: '00000000-0000-4000-8000-000000000101',
                    status: 'pending',
                    raw_text: 'private receipt details',
                    possible_duplicates: [{ id: 'expense-secret', description: 'private history' }],
                },
            },
            error: null,
        }),
    })
    const response = await endpoint.POST(request('/api/pending-transactions', 'POST', { text: 'RM 10.00' }, 'Bearer pti_test-token'))

    assert.equal(response.status, 201)
    assert.deepEqual(await response.json(), {
        duplicate: false,
        pending_id: '00000000-0000-4000-8000-000000000101',
        status: 'pending',
    })
})

test('duplicate import acknowledgement never returns the existing pending row', async () => {
    const { endpoint } = loadEndpoint('app/api/pending-transactions/route.ts', {
        rpcHandler: async () => ({
            data: {
                duplicate: true,
                pending: {
                    id: '00000000-0000-4000-8000-000000000102',
                    status: 'confirmed',
                    raw_text: 'private previous receipt',
                    possible_duplicates: [{ id: 'expense-secret', description: 'private confirmed transaction' }],
                },
            },
            error: null,
        }),
    })
    const response = await endpoint.POST(request('/api/pending-transactions', 'POST', { text: 'RM 10.00' }, 'Bearer pti_test-token'))

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
        duplicate: true,
        pending_id: '00000000-0000-4000-8000-000000000102',
        status: 'confirmed',
    })
})

test('pending GET attaches category suggestions returned by the owner-scoped RPC', async () => {
    const rows = [{ id: 'pending-1', parsed_merchant: 'Kopi House', category_id: null }]
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/route.ts', {
        rpcHandler: async (name) => {
            if (name === 'suggest_pending_transaction_categories') {
                return { data: [{ pending_id: 'pending-1', category_id: 'category-1' }], error: null }
            }
            return { data: {}, error: null }
        },
    })
    db.client.from = (table) => {
        assert.equal(table, 'pending_transactions')
        const query = {
            select() { return query },
            eq() { return query },
            order() { return query },
            then(resolve, reject) { return Promise.resolve({ data: rows, error: null }).then(resolve, reject) },
        }
        return query
    }

    const response = await endpoint.GET(new Request('https://example.test/api/pending-transactions', {
        headers: { authorization: 'Bearer valid-jwt' },
    }))
    const payload = await response.json()

    assert.equal(response.status, 200)
    assert.deepEqual(payload.pending.map(({ id, suggested_category_id }) => ({ id, suggested_category_id })), [
        { id: 'pending-1', suggested_category_id: 'category-1' },
    ])
    assert.ok(db.calls.rpc.some(({ name }) => name === 'suggest_pending_transaction_categories'))
})

test('repeated receipt text without a stable provider ID is submitted as separate pending imports', async () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/route.ts')
    const body = { text: 'Merchant: Kopi House\nTotal: RM 10.00\nDate: 2026-10-08', input_source: 'app_paste' }

    await endpoint.POST(request('/api/pending-transactions', 'POST', body))
    await endpoint.POST(request('/api/pending-transactions', 'POST', body))

    const imports = db.calls.rpc.filter((call) => call.name === 'create_pending_transaction')
    assert.equal(imports.length, 2)
    assert.equal(imports[0].args.p_reference, null)
    assert.equal(imports[1].args.p_event_id, null)
})

test('provider reference and event IDs keep their case and opaque punctuation through the RPC', async () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/route.ts')
    const response = await endpoint.POST(request('/api/pending-transactions', 'POST', {
        text: 'Total: RM 10.00',
        input_source: 'app_paste',
        source: 'Apple Pay',
        reference: 'Ref:A/B:Case',
        event_id: 'Event:A/B:Case',
    }))
    const call = db.calls.rpc.find((entry) => entry.name === 'create_pending_transaction')

    assert.equal(response.status, 201)
    assert.equal(call.args.p_reference, 'Ref:A/B:Case')
    assert.equal(call.args.p_event_id, 'Event:A/B:Case')
})

test('unauthenticated imports stop before any database call', async () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/route.ts')
    const response = await endpoint.POST(request('/api/pending-transactions', 'POST', { text: 'RM 10.00' }, ''))

    assert.equal(response.status, 401)
    assert.equal(db.calls.rpc.length, 0)
    assert.equal(db.calls.insert.length, 0)
})

test('pairing token imports pass only a hash into the locked create RPC', async () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/route.ts')
    const response = await endpoint.POST(request('/api/pending-transactions', 'POST', {
        text: 'Merchant: Cafe\nTotal: RM 4.00',
        input_source: 'shortcut_ocr',
    }, 'Bearer pti_test-shortcut-token'))
    const call = db.calls.rpc.find((entry) => entry.name === 'create_pending_transaction')

    assert.equal(response.status, 201)
    assert.equal(typeof call.args.p_pairing_token_hash, 'string')
    assert.notEqual(call.args.p_pairing_token_hash, 'pti_test-shortcut-token')
    assert.equal(db.calls.insert.length, 0)
    assert.equal(db.calls.update.length, 0)
})

test('expired pairing tokens return 401 without exposing database details', async () => {
    const { endpoint } = loadEndpoint('app/api/pending-transactions/route.ts', {
        rpcHandler: async () => ({ data: null, error: { code: '28000', message: 'expired token row details' } }),
    })
    const response = await endpoint.POST(request('/api/pending-transactions', 'POST', { text: 'RM 4.00' }, 'Bearer pti_expired-token'))
    const payload = await response.json()

    assert.equal(response.status, 401)
    assert.doesNotMatch(payload.error, /expired token row details/)
})

test('token revocation uses the owner-checked RPC and never updates the table directly', async () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/tokens/[id]/route.ts')
    const response = await endpoint.DELETE(request('/api/pending-transactions/tokens/token-id', 'DELETE'), {
        params: Promise.resolve({ id: '00000000-0000-4000-8000-000000000003' }),
    })

    assert.equal(response.status, 200)
    assert.ok(db.calls.rpc.some((call) => call.name === 'revoke_pending_import_token'))
    assert.equal(db.calls.update.length, 0)
})

test('oversized streamed import requests return 413 before body parsing or database writes', async () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/route.ts')
    const oversized = JSON.stringify({ text: 'x'.repeat(40000), input_source: 'app_paste' })
    const bytes = new TextEncoder().encode(oversized)
    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(bytes.slice(0, 20000))
            controller.enqueue(bytes.slice(20000))
            controller.close()
        },
    })
    const response = await endpoint.POST(new Request('https://example.test/api/pending-transactions', {
        method: 'POST',
        headers: { authorization: 'Bearer valid-jwt', 'content-type': 'application/json' },
        body: stream,
        duplex: 'half',
    }))

    assert.equal(response.status, 413)
    assert.equal(db.calls.insert.length, 0)
    assert.equal(db.calls.rpc.length, 0)
})

test('malformed text fields return 400 without invoking a write path', async () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/route.ts')
    const response = await endpoint.POST(request('/api/pending-transactions', 'POST', {
        text: { forged: 'object instead of receipt text' },
        amount: 10,
    }))

    assert.equal(response.status, 400)
    assert.equal(db.calls.insert.length, 0)
    assert.equal(db.calls.rpc.length, 0)
})

test('pending edits are exposed as an authenticated PATCH handler', () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/route.ts')

    assert.equal(typeof endpoint.PATCH, 'function', 'pending edits must use an authenticated edit RPC')
    const pendingId = '00000000-0000-4000-8000-000000000001'
    return endpoint.PATCH(request('/api/pending-transactions', 'PATCH', {
        pending_id: pendingId,
        amount: 12.5,
        currency: 'MYR',
        manual_conversion: false,
        date: '2026-10-08',
        description: 'Kopi House',
        category_id: '00000000-0000-4000-8000-000000000002',
        category: 'Food',
        kind: 'expense',
        reclassification_confirmed: false,
        is_dating: false,
        is_for_partner: false,
    })).then(async (response) => {
        assert.equal(response.status, 200)
        const call = db.calls.rpc.find((entry) => entry.name === 'edit_pending_transaction')
        assert.equal(call.args.p_pending_id, pendingId)
        assert.equal(call.args.p_description, 'Kopi House')
        assert.equal(call.args.p_kind, 'expense')
    })
})

test('authenticated edit business failures return a sanitized mapped error', async () => {
    const { endpoint } = loadEndpoint('app/api/pending-transactions/route.ts', {
        rpcHandler: async () => ({ data: { failure_code: '22023' }, error: null }),
    })
    const response = await endpoint.PATCH(request('/api/pending-transactions', 'PATCH', {
        pending_id: '00000000-0000-4000-8000-000000000001',
        amount: 12.5,
        currency: 'MYR',
        manual_conversion: false,
        date: '2026-10-08',
        description: 'Kopi House',
        category_id: null,
        category: null,
        kind: 'expense',
        reclassification_confirmed: false,
        is_dating: false,
        is_for_partner: false,
    }))
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.match(payload.error, /Review the amount/)
    assert.doesNotMatch(JSON.stringify(payload), /22023/)
})

test('confirm handler enforces database rate limits with 429 and Retry-After', async () => {
    const { endpoint } = loadEndpoint('app/api/pending-transactions/confirm/route.ts', {
        rpcHandler: async () => ({ data: { rate_limited: true, retry_after_seconds: 47 }, error: null }),
    })
    const response = await endpoint.POST(request('/api/pending-transactions/confirm', 'POST', {
        pending_id: '00000000-0000-4000-8000-000000000001',
        amount: 10,
        currency: 'MYR',
        manual_conversion: false,
        date: '2026-10-08',
        kind: 'expense',
        reclassification_confirmed: false,
        description: 'Coffee',
        category_id: '00000000-0000-4000-8000-000000000002',
        category: 'Food',
        is_dating: false,
        is_for_partner: false,
    }))

    assert.equal(response.status, 429)
    assert.equal(response.headers.get('retry-after'), '47')
})

test('confirm RPC receives the reviewed kind and explicit manual currency conversion', async () => {
    const { endpoint, db } = loadEndpoint('app/api/pending-transactions/confirm/route.ts')
    const response = await endpoint.POST(request('/api/pending-transactions/confirm', 'POST', {
        pending_id: '00000000-0000-4000-8000-000000000001',
        amount: 9.5,
        currency: 'MYR',
        manual_conversion: true,
        date: '2026-10-08',
        kind: 'expense',
        reclassification_confirmed: false,
        description: 'Coffee',
        category_id: '00000000-0000-4000-8000-000000000002',
        category: 'Food',
        is_dating: false,
        is_for_partner: false,
    }))
    const call = db.calls.rpc.find((entry) => entry.name === 'confirm_pending_transaction')

    assert.equal(response.status, 200, await response.clone().text())
    assert.equal(call.args.p_currency, 'MYR')
    assert.equal(call.args.p_manual_conversion, true)
    assert.equal(call.args.p_date, '2026-10-08')
    assert.equal(call.args.p_kind, 'expense')
})

test('authenticated confirm business failures return a sanitized mapped error', async () => {
    const { endpoint } = loadEndpoint('app/api/pending-transactions/confirm/route.ts', {
        rpcHandler: async () => ({ data: { failure_code: '22023' }, error: null }),
    })
    const response = await endpoint.POST(request('/api/pending-transactions/confirm', 'POST', {
        pending_id: '00000000-0000-4000-8000-000000000001',
        amount: 10,
        currency: 'MYR',
        manual_conversion: false,
        date: '2026-10-08',
        kind: 'expense',
        reclassification_confirmed: false,
        description: 'Coffee',
        category_id: '00000000-0000-4000-8000-000000000002',
        category: 'Food',
        is_dating: false,
        is_for_partner: false,
    }))
    const payload = await response.json()

    assert.equal(response.status, 400)
    assert.match(payload.error, /Review the amount/)
    assert.doesNotMatch(JSON.stringify(payload), /22023/)
})

test('database errors never disclose SQL details and explain how to enable the feature', async () => {
    const { endpoint } = loadEndpoint('app/api/pending-transactions/confirm/route.ts', {
        rpcHandler: async () => ({ data: null, error: { code: '42P01', message: 'relation private_schema.pending_transactions does not exist' } }),
    })
    const response = await endpoint.POST(request('/api/pending-transactions/confirm', 'POST', {
        pending_id: '00000000-0000-4000-8000-000000000001',
        amount: 10,
        currency: 'MYR',
        manual_conversion: false,
        date: '2026-10-08',
        kind: 'expense',
        reclassification_confirmed: false,
        description: 'Coffee',
        category_id: '00000000-0000-4000-8000-000000000002',
        category: 'Food',
        is_dating: false,
        is_for_partner: false,
    }))
    const payload = await response.json()

    assert.equal(response.status, 503)
    assert.doesNotMatch(payload.error, /private_schema|does not exist/)
    assert.match(payload.error, /pending-transactions\.sql/)
})

test('pairing token creation returns a visible expiry and prevents response caching', async () => {
    const { endpoint } = loadEndpoint('app/api/pending-transactions/tokens/route.ts')
    const response = await endpoint.POST(request('/api/pending-transactions/tokens', 'POST', { label: 'My iPhone' }))
    const payload = await response.json()

    assert.equal(response.status, 201)
    assert.match(response.headers.get('cache-control') ?? '', /no-store/i)
    assert.equal(typeof payload.token_record.expires_at, 'string')
    assert.equal(typeof payload.token, 'string')
})
