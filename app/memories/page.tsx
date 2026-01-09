'use client'

import { createClient } from '@supabase/supabase-js'
import AOS from 'aos'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import MemorySection from '../components/MemorySection'
import { memoriesByYear } from '../data/memories'

export default function Memories() {

  const router = useRouter()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    AOS.init({
      duration: 1000,
      once: false,
    })

    const clearFirstLogin = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      await supabase
        .from('profiles')
        .update({ is_first_login: false })
        .eq('id', user.id)
    }

    clearFirstLogin()
  }, [])

  return (
    <main className="bg-pink-50 font-sans text-gray-800 overflow-x-hidden">

      {/* ================= HEADER ================= */}
      <header
        className="bg-pink-300 flex min-h-screen items-center justify-center text-white text-center w-full"
        data-aos="fade-up"
      >
        <img src="/assets/spinningbubu.gif" className="w-28 h-28" alt="" />
        <div className="px-4 text-nowrap">
          <h1 className="text-2xl font-bold">💖 BB 两周年快乐 💖</h1>
          <p className="text-sm mt-2">往下滑</p>
        </div>
        <img src="/assets/spinningyier.gif" className="w-28 h-28" alt="" />
      </header>

      {memoriesByYear["2023"].map((memory, index) => (
        <MemorySection
          key={`2024-${index}`}
          text={memory.text}
          date={memory.date}
          media={memory.media}
        />
      ))}

      {/* ================= END 2023 ================= */}
      <section
        className="flex flex-col items-center justify-center min-h-screen text-center"
        data-aos="fade-up"
      >
        <h1 className="text-2xl font-bold">💖 简短的 2023 年就这么过完啦 💖</h1>
        <p className="text-sm mt-2">下面还有很长哦 不得空就不要看了</p>
      </section>

      {/* ================= 2024 ================= */}
      <section
        className="flex flex-col items-center justify-center min-h-screen text-center"
        data-aos="fade-up"
      >
        <h1 className="text-3xl font-bold text-pink-600">2024</h1>
      </section>

      {memoriesByYear["2024"].map((memory, index) => (
        <MemorySection
          key={`2024-${index}`}
          text={memory.text}
          date={memory.date}
          media={memory.media}
        />
      ))}

      <section
        className="py-10 px-4 min-h-screen flex flex-col items-center justify-center"
        data-aos="fade-up">
        <div className="px-4 items-center justify-center text-center text-nowrap">
          <h1 className="text-2xl font-bold">💖 我们的 2024 年就这么过完了 💖</h1>
          <p className="text-sm mt-2">那就看看今年的吧👇🏻</p>
        </div>
      </section>

      <div className="bg-white rounded-lg shadow p-6 flex flex-col md:flex-row items-center" data-aos="fade-left">
        <section
          className="flex flex-col items-center py-10 px-4 min-h-screen justify-center"
          data-aos="fade-up">
          <img src="/assets/IMG_7389.jpeg" alt="第二年"
            className="rounded-lg w-60 h-60 object-cover mb-4 md:mb-0 md:mr-6" />
          <div>
            <h3 className="text-4xl font-bold text-pink-500 text-center">第二年 (2025)</h3>
          </div>
        </section>
      </div>

      {/* ================= 2025 ================= */}
      <section
        className="flex flex-col items-center justify-center min-h-screen text-center"
        data-aos="fade-up"
      >
        <h1 className="text-3xl font-bold text-pink-600">2025</h1>
      </section>

      {memoriesByYear["2025"].map((memory, index) => (
        <MemorySection
          key={`2025-${index}`}
          text={memory.text}
          date={memory.date}
          media={memory.media}
        />
      ))}

      <section
        className="text-center py-10 px-4 max-w-2xl mx-auto min-h-screen flex flex-col items-center justify-center"
        data-aos="fade-up"
      >
        <h2 className="text-3xl font-semibold text-pink-600">
          写给我的爱人 💕
        </h2>
        <p className="mt-4 text-lg">
          谢谢你让我的世界变得更美好，
          谢谢你的关心、体贴和无尽的爱。
          我很幸运遇见你，
          未来的日子里，
          让我们一起走下去 ❤️
        </p>
      </section>

      <footer className="bg-pink-500 text-white text-center py-4 min-h-screen flex items-center justify-center">
        <p>永远爱你 💕 | 2023 - 2025</p>
      </footer>

      {/* ================= BACK TO HOME ================= */}
      <section
        className="min-h-screen flex items-center justify-center bg-pink-100"
        data-aos="fade-up"
      >
        <button
          onClick={() => router.push('/')}
          className="px-8 py-3 rounded-full bg-pink-500 text-white text-lg font-semibold hover:bg-pink-600 transition"
        >
          回到主页 🏠
        </button>
      </section>

    </main>
  )
}