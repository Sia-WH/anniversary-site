'use client'

import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

export default function LoginPage() {
    const router = useRouter()

    const supabase = useMemo(() => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !key) return null
        return createBrowserClient(url, key)
    }, [])

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    const handleLogin = async () => {
        setErrorMsg(null)

        if (!supabase) {
            setErrorMsg('Missing Supabase env vars. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.')
            return
        }

        if (!email.trim() || !password) {
            setErrorMsg('Please enter email and password.')
            return
        }

        try {
            setLoading(true)

            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            })

            if (error || !data.session) {
                setErrorMsg(error?.message || 'Login failed')
                return
            }

            const user = data.session.user

            // Ensure session cookies are present (cookie-based auth for proxy.ts)
            await supabase.auth.getSession()

            // Check if this is first login (profiles row missing or flag still true)
            const { data: profile, error: profileReadErr } = await supabase
                .from('profiles')
                .select('is_first_login')
                .eq('id', user.id)
                .maybeSingle()

            // If profiles table doesn't exist yet, tell user clearly
            if (profileReadErr && /relation .*profiles.* does not exist/i.test(profileReadErr.message)) {
                setErrorMsg('profiles table not found. Please create the profiles table in Supabase first (see SQL in chat).')
                return
            }

            // First login: no profile row yet
            if (!profile) {
                const { error: insertErr } = await supabase.from('profiles').insert({
                    id: user.id,
                    display_name:
                        (user.user_metadata?.display_name as string | undefined) ??
                        user.email?.split('@')[0] ??
                        'User',
                    is_first_login: true,
                    first_login_at: new Date().toISOString(),
                })

                if (insertErr) {
                    setErrorMsg(insertErr.message || 'Failed to create profile.')
                    return
                }

                router.push('/memories')
                router.refresh()
                return
            }

            // Not first login anymore

            if (profile.is_first_login) {
                router.push('/memories')
            } else {
                router.push('/')
            }
            router.refresh()
            return
        } catch (e: any) {
            setErrorMsg(e?.message || 'Login failed.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-pink-100 px-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
                <h1 className="text-2xl font-bold mb-1 text-black text-center">Login 💖</h1>
                <p className="text-sm text-gray-600 text-center mb-6">
                    Sign in with your lovely account
                </p>

                <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                    <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        type="email"
                        placeholder="you@example.com"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-pink-300"
                        autoComplete="email"
                    />
                </label>

                <label className="block text-sm font-medium text-gray-700 mb-3">
                    Password
                    <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type="password"
                        placeholder="••••••••"
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-pink-300"
                        autoComplete="current-password"
                    />
                </label>

                {errorMsg && (
                    <div className="mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
                        {errorMsg}
                    </div>
                )}

                <button
                    onClick={handleLogin}
                    disabled={loading}
                    className="w-full px-6 py-2 bg-pink-500 disabled:opacity-60 text-white rounded-lg cursor-pointer hover:bg-pink-600 transition"
                >
                    {loading ? 'Logging in...' : 'Login'}
                </button>

            </div>
        </main>
    )
}