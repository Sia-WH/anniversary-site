'use client'

type MediaItem = {
    type: 'image' | 'video'
    src: string
}

type MemorySectionProps = {
    text: string
    media: MediaItem[]
    date: string
    aos?: string
}

export default function MemorySection({
    text,
    media,
    date,
    aos = 'fade-up',
}: MemorySectionProps) {
    return (
        <section
            className="flex flex-col items-center py-10 px-4 min-h-screen justify-center"
            data-aos={aos}
        >
            <p className="max-w-2xl text-center text-lg">
                {text}
            </p>

            {/* Media list */}
            <div className="flex flex-col gap-6 mt-6">
                {media.map((item, index) => {
                    if (item.type === 'image') {
                        return (
                            <img
                                key={index}
                                src={item.src}
                                alt=""
                                className="rounded-2xl shadow-lg max-w-sm"
                            />
                        )
                    }

                    if (item.type === 'video') {
                        return (
                            <video
                                key={index}
                                playsInline
                                loop
                                controls
                                className="rounded-2xl shadow-lg max-w-sm"
                            >
                                <source src={item.src} type="video/mp4" />
                            </video>
                        )
                    }

                    return null
                })}
            </div>

            <p className="max-w-2xl text-center text-sm mt-4 text-gray-600">
                {date}
            </p>
        </section>
    )
}