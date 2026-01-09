'use client'

import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
    const router = useRouter()

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const logout = async () => {
        // 1️⃣ Supabase sign out
        await supabase.auth.signOut()

        // 2️⃣ Remove guard cookie
        document.cookie = 'isLoggedIn=; Max-Age=0; path=/; SameSite=Lax'

        // 3️⃣ Redirect to login
        router.push('/login')
        router.refresh()
    }

    return (
        <button
            onClick={logout}
            className="px-4 py-2 rounded bg-pink-500 text-white cursor-pointer hover:bg-pink-600 transition"
        >
            Logout
        </button>
    )
}