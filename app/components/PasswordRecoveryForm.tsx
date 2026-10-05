'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'
import { supabaseBrowser } from '../lib/supabase-browser'

export default function PasswordRecoveryForm({ mode }: { mode: 'request' | 'reset' }) {
    const isReset = mode === 'reset'
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [access, setAccess] = useState<'checking' | 'ready' | 'invalid'>(isReset ? 'checking' : 'ready')
    const [errorMsg, setErrorMsg] = useState<string | null>(null)
    const [success, setSuccess] = useState(false)
    const [retryAt, setRetryAt] = useState(0)

    useEffect(() => {
        if (!isReset) return
        let active = true
        async function verifySession() {
            try {
                if (new URLSearchParams(window.location.search).has('error')) {
                    if (active) setAccess('invalid')
                    return
                }
                const { data, error } = await supabaseBrowser().auth.getUser()
                if (active) setAccess(!error && data.user ? 'ready' : 'invalid')
            } catch {
                if (active) setAccess('invalid')
            }
        }
        void verifySession()
        return () => { active = false }
    }, [isReset])

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        if (loading || access !== 'ready') return
        setErrorMsg(null)
        if (isReset && password !== confirmPassword) {
            setErrorMsg('Passwords do not match.')
            return
        }
        if (!isReset && Date.now() < retryAt) {
            setErrorMsg('Please wait a minute before requesting another email.')
            return
        }
        setLoading(true)
        try {
            const supabase = supabaseBrowser()
            if (isReset) {
                // Check with Auth again, rather than trusting cached session data.
                const { data, error: userError } = await supabase.auth.getUser()
                if (userError || !data.user) {
                    setAccess('invalid')
                    return
                }
                const { error } = await supabase.auth.updateUser({ password })
                if (error) throw error
                setPassword('')
                setConfirmPassword('')
                setSuccess(true)
                const { error: signOutError } = await supabase.auth.signOut()
                if (signOutError) setErrorMsg('Your password was changed, but automatic sign-out failed. Please log out before signing in again.')
            } else {
                const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                    redirectTo: `${window.location.origin}/auth/callback`,
                })
                if (error) throw error
                setRetryAt(Date.now() + 60_000)
                setSuccess(true)
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.'
            setErrorMsg(isReset ? message : 'Unable to send the reset email. Please try again later. If this continues, contact the site owner.')
        } finally {
            setLoading(false)
        }
    }

    const inputClass = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-black outline-none focus:ring-2 focus:ring-pink-300'

    return (
        <main className="min-h-screen flex flex-col items-center justify-center bg-pink-100 px-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
                <h1 className="text-2xl font-bold mb-1 text-black text-center">
                    {isReset ? 'Reset password 💖' : 'Forgot password? 💌'}
                </h1>
                <p className="text-sm text-gray-600 text-center mb-6">
                    {isReset ? 'Choose a new password for your account.' : 'Enter your account email to receive a reset link.'}
                </p>

                {access === 'checking' && <p role="status" className="text-sm text-gray-600">Checking your reset link...</p>}
                {access === 'invalid' && (
                    <div role="alert" className="text-sm text-red-700">
                        This link is invalid or has expired. Request a new link and open it in the same browser where you requested it.
                        <Link href="/forgot-password" className="mt-3 block text-pink-600 hover:underline">Request a new link</Link>
                    </div>
                )}
                {success && (
                    <p role="status" className="mb-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
                        {isReset ? 'Your password has been changed. You can now sign in with your new password.' : 'If an account exists for this email, you will receive a reset link. Check your inbox and spam folder, and open the link in this browser.'}
                    </p>
                )}
                {errorMsg && <p role="alert" className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{errorMsg}</p>}

                {access === 'ready' && !(isReset && success) && (
                    <form onSubmit={submit}>
                        {isReset ? (
                            <>
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    New password
                                    <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} disabled={loading} aria-describedby="password-help" />
                                </label>
                                <p id="password-help" className="mb-3 text-xs text-gray-600">Use at least 8 characters.</p>
                                <label className="block text-sm font-medium text-gray-700 mb-4">
                                    Confirm password
                                    <input type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className={inputClass} disabled={loading} />
                                </label>
                            </>
                        ) : (
                            <label className="block text-sm font-medium text-gray-700 mb-4">
                                Email
                                <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className={inputClass} disabled={loading} />
                            </label>
                        )}
                        <button type="submit" disabled={loading} className="w-full px-6 py-2 bg-pink-500 disabled:opacity-60 text-white rounded-lg cursor-pointer hover:bg-pink-600 transition">
                            {loading ? 'Please wait...' : isReset ? 'Update password' : success ? 'Send another link' : 'Send reset link'}
                        </button>
                    </form>
                )}
                <Link href="/login" className="mt-4 block text-center text-sm text-pink-600 hover:underline">Back to login</Link>
            </div>
        </main>
    )
}
