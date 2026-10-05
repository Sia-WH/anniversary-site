import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Exercise the actual route/proxy; only replace the external Auth service and HTTP adapter.
function load(path, auth) {
    const filename = join(process.cwd(), path)
    assert.ok(existsSync(filename), `${path} must exist`)
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText
    const exports = {}
    const response = (url) => ({ url: url?.toString(), cookies: {
        values: [],
        set(...args) { this.values.push(args.length === 1 ? [args[0].name, args[0].value, args[0]] : args) },
        getAll() { return this.values.map(([name, value, options]) => ({ name, value, ...options })) },
    } })
    vm.runInNewContext(code, {
        exports, URL, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-key' } },
        require(name) {
            if (name === 'next/server') return { NextResponse: { next: () => response(), redirect: response } }
            if (name === '@supabase/ssr') return { createServerClient: (_url, _key, options) => ({ auth: auth(options.cookies) }) }
            throw new Error(`Unexpected import: ${name}`)
        },
    })
    return exports
}

function request(path) {
    const url = `https://anniversary.vercel.app${path}`
    return { url, nextUrl: new URL(url), cookies: { getAll: () => [] } }
}

test('recovery callback exchanges a code and keeps session cookies on its fixed redirect', async () => {
    const { GET } = load('app/auth/callback/route.ts', (cookies) => ({
        async exchangeCodeForSession(code) {
            assert.equal(code, 'valid-code')
            cookies.setAll([{ name: 'session', value: 'verified', options: { httpOnly: true } }])
            return { error: null }
        },
    }))
    const result = await GET(request('/auth/callback?code=valid-code&next=https://evil.example'))
    assert.equal(result.url, 'https://anniversary.vercel.app/reset-password')
    assert.equal(result.cookies.values[0][0], 'session')
    assert.equal(result.cookies.values[0][1], 'verified')
})

for (const mode of ['missing', 'expired', 'network']) {
    test(`recovery callback rejects ${mode} codes`, async () => {
        const { GET } = load('app/auth/callback/route.ts', () => ({
            async exchangeCodeForSession() {
                assert.notEqual(mode, 'missing', 'Missing code must not be exchanged')
                if (mode === 'network') throw new Error('Offline')
                return { error: { message: 'Expired' } }
            },
        }))
        const result = await GET(request(`/auth/callback${mode === 'missing' ? '' : '?code=bad-code'}`))
        assert.equal(result.url, 'https://anniversary.vercel.app/reset-password?error=invalid_link')
    })
}

test('signed-out visitors can reach all recovery entry points without an Auth request', async () => {
    const { proxy } = load('proxy.ts', () => { throw new Error('Public recovery route must bypass auth') })
    for (const path of ['/forgot-password', '/auth/callback?code=valid', '/reset-password']) {
        assert.equal((await proxy(request(path))).url, undefined)
    }
})

test('private pages require a verified user even if untrusted session cookies exist', async () => {
    const { proxy } = load('proxy.ts', () => ({ async getUser() { return { data: { user: null }, error: null } } }))
    assert.equal((await proxy(request('/memories'))).url, 'https://anniversary.vercel.app/login')
    assert.equal((await proxy(request('/login'))).url, undefined)
})

test('verified users retain refreshed cookies when redirected away from login', async () => {
    const { proxy } = load('proxy.ts', (cookies) => ({
        async getUser() {
            cookies.setAll([{ name: 'session', value: 'refreshed', options: { httpOnly: true } }])
            return { data: { user: { id: 'user-1' } }, error: null }
        },
    }))
    const result = await proxy(request('/login'))
    assert.equal(result.url, 'https://anniversary.vercel.app/')
    assert.equal(result.cookies.values[0][1], 'refreshed')
})
