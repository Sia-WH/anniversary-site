'use client'

import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ReactNode, useMemo, useState } from 'react'

export default function AppShell({
    title = 'Finance App',
    subtitle = 'Dashboard',
    children,
}: {
    title?: string
    subtitle?: string
    children: ReactNode
}) {
    const safeSubtitle = typeof subtitle === 'string' ? subtitle : ''
    const isMui = safeSubtitle.toLowerCase().includes('mui')
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [logoutOpen, setLogoutOpen] = useState(false)

    const router = useRouter()

    const supabase = useMemo(() => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (!url || !key) return null
        return createBrowserClient(url, key)
    }, [])

    const logout = async () => {
        if (!supabase) {
            router.replace('/login')
            router.refresh()
            return
        }

        await supabase.auth.signOut()
        router.replace('/login')
        router.refresh()
    }

    return (
        <>
            {/* Inject Cute Font Globally if not already present */}
            <style jsx global>{`
                @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
                body { font-family: 'Nunito', sans-serif; }
            `}</style>

            {/* ================= TOP NAVBAR ================= */}
            <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-md border-b-2 border-stone-100">
                <div className="h-16 px-4 flex items-center justify-between w-full">

                    {/* Hamburger Button (Soft & Round) */}
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-3 rounded-2xl hover:bg-rose-50 text-rose-400 transition-colors active:scale-95"
                        aria-label="Open menu"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                            <path fillRule="evenodd" d="M3 6.75A.75.75 0 0 1 3.75 6h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 6.75ZM3 12a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75A.75.75 0 0 1 3 12Zm0 5.25a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 0 1.5H3.75a.75.75 0 0 1-.75-.75Z" clipRule="evenodd" />
                        </svg>
                    </button>

                    <div className="text-center">
                        {subtitle ? (
                            <h1 className="text-xl font-black text-stone-700 tracking-tight">
                                Hi, {subtitle}! <span className="inline-block animate-wave">👋</span>
                            </h1>
                        ) : (
                            <h1 className="text-2xl font-black text-stone-800 tracking-tight">
                                {title}
                            </h1>
                        )}
                    </div>

                    {/* Placeholder for balance icon or empty space to balance header */}
                    <div className="w-12 h-12 rounded-full bg-rose-100 border-2 border-white shadow-md overflow-hidden flex items-center justify-center text-xl">
                        <img
                            src={
                                isMui
                                    ? '/assets/profiles/yier.png'
                                    : '/assets/profiles/bubu.png'
                            }
                            alt="Avatar"
                            className="w-6 h-6"
                        />
                    </div>
                </div>
            </header>

            {/* ================= SIDEBAR (DRAWER) ================= */}
            <div className={`fixed inset-0 z-50 ${sidebarOpen ? '' : 'pointer-events-none'}`}>

                {/* Overlay (Warm tint) */}
                <div
                    onClick={() => setSidebarOpen(false)}
                    className={`absolute inset-0 bg-stone-900/20 backdrop-blur-sm transition-opacity duration-300 ${sidebarOpen ? 'opacity-100' : 'opacity-0'
                        }`}
                />

                {/* Drawer Content */}
                <aside
                    className={`absolute top-0 left-0 h-full w-[85%] max-w-[300px] bg-[#FFF9F5] shadow-2xl transition-transform duration-300 ease-out rounded-r-[2.5rem] border-r-4 border-white ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'
                        }`}
                >
                    <div className="h-24 px-6 flex items-center justify-between">
                        <span className="font-black text-2xl text-stone-700">Menu 🥞</span>
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="w-10 h-10 flex items-center justify-center rounded-full bg-white text-stone-400 shadow-sm hover:text-rose-500 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                    </div>

                    <nav className="flex flex-col h-[calc(100%-6rem)] px-6 pb-6 space-y-3">
                        {/* Menu Items */}
                        <div className="space-y-3 flex-1">
                            <SidebarLink href="/" icon="🏠" label="Dashboard" onClick={() => setSidebarOpen(false)} />
                            <SidebarLink href="/memories" icon="💭" label="Memories" onClick={() => setSidebarOpen(false)} />
                            <SidebarLink href="/expenses" icon="🧾" label="Expenses" onClick={() => setSidebarOpen(false)} />
                            <SidebarLink href="/others" icon="✨" label={`${isMui ? "Zai's" : "Mui's"} Expenses`} onClick={() => setSidebarOpen(false)} />
                            <SidebarLink href="/date" icon="💞" label="Date Expenses" onClick={() => setSidebarOpen(false)} />
                        </div>

                        {/* Bottom Logout Area */}
                        <div className="mt-auto">
                            <button
                                onClick={() => setLogoutOpen(true)}
                                className="w-full py-4 rounded-3xl bg-rose-100 text-rose-500 font-bold hover:bg-rose-200 transition-colors flex items-center justify-center gap-2"
                            >
                                <span>🚪</span> Logout
                            </button>
                        </div>
                    </nav>
                </aside>
            </div>

            {/* ================= LOGOUT CONFIRMATION (POPUP) ================= */}
            <div
                className={`fixed inset-0 z-[60] flex items-center justify-center p-4 ${logoutOpen ? '' : 'pointer-events-none'}`}
            >
                {/* Overlay */}
                <div
                    onClick={() => setLogoutOpen(false)}
                    className={`absolute inset-0 bg-stone-900/30 backdrop-blur-sm transition-opacity duration-300 ${logoutOpen ? 'opacity-100' : 'opacity-0'
                        }`}
                />

                {/* Cute Dialog */}
                <div
                    className={`relative w-full max-w-sm bg-white rounded-[2.5rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] p-8 text-center transition-all duration-300 transform ${logoutOpen ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4'
                        }`}
                >
                    <div className="text-6xl mb-4">🥺</div>
                    <h3 className="text-2xl font-black text-stone-700 mb-2">
                        Leaving so soon?
                    </h3>
                    <p className="text-stone-500 font-medium mb-8">
                        Are you sure you want to log out? Dudu will miss you!
                    </p>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setLogoutOpen(false)}
                            className="flex-1 py-3 rounded-2xl bg-stone-100 text-stone-600 font-bold hover:bg-stone-200 transition-colors"
                        >
                            Stay
                        </button>

                        <button
                            onClick={async () => {
                                setLogoutOpen(false)
                                setSidebarOpen(false)
                                await logout()
                            }}
                            className="flex-1 py-3 rounded-2xl bg-rose-400 text-white font-bold hover:bg-rose-500 shadow-lg shadow-rose-200 transition-colors"
                        >
                            Bye Bye
                        </button>
                    </div>
                </div>
            </div>

            {/* ================= PAGE CONTENT ================= */}
            {/* Added padding top to account for fixed header and background color */}
            <main className="pt-20 min-h-screen bg-[#FFF9F5]">
                {children}
            </main>
        </>
    )
}

// Helper for consistent Sidebar Links
function SidebarLink({ href, icon, label, onClick, highlight }: { href: string, icon: string, label: string, onClick: () => void, highlight?: boolean }) {
    return (
        <Link
            href={href}
            onClick={onClick}
            className={`
                group flex items-center gap-4 px-5 py-4 rounded-3xl transition-all duration-200
                ${highlight
                    ? 'bg-amber-100 text-amber-900 shadow-sm'
                    : 'bg-white text-stone-600 hover:bg-rose-50 hover:text-rose-600 shadow-sm hover:shadow-md'
                }
            `}
        >
            <span className="text-xl group-hover:scale-110 transition-transform">{icon}</span>
            <span className="font-bold">{label}</span>
            {highlight && <span className="ml-auto bg-amber-200 text-[10px] font-black px-2 py-1 rounded-full text-amber-800 uppercase">New</span>}
        </Link>
    )
}