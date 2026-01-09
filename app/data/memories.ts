export type MediaItem = {
    type: 'image' | 'video'
    src: string
}

export type MemoryItem = {
    text: string
    date: string
    media: MediaItem[]
}

export const memoriesByYear: Record<string, MemoryItem[]> = {

    /* ================= 2023 ================= */

    "2023": [
        {
            text: '两年前，我们就是从这一个牵手开始了这段美丽的旅程。💕',
            date: '2023年12月2日 21点20分',
            media: [{ type: 'image', src: '/assets/IMG_4154.jpeg' }],
        },
        {
            text: '我们的第一张合照 毕业照💕',
            date: '2023年11月25日 15点11分（311🤍）',
            media: [{ type: 'image', src: '/assets/IMG_6668.jpeg' }],
        },
        {
            text: '我知道你是我生命中的那个对的人 所以我不想再浪费时间了',
            date: '2023年12月4日 21点02分',
            media: [{ type: 'image', src: '/assets/01997F8C-6E4C-4A6C-8426-8B6E35C2ABBB.jpeg' }],
        },
        {
            text: '送你的第一束花 代表着我对你的心意 也是我们开始的见证 🌷',
            date: '2023年12月9日 16点32分',
            media: [{ type: 'image', src: '/assets/a555c35568a9cdb89fa21003793129e0.jpeg' }],
        },
        {
            text: '不久后 我们就迎来了第一次的跨年 🎉',
            date: '2023年12月31日 22点01分',
            media: [{ type: 'image', src: '/assets/IMG_4399.jpeg' }],
        },
    ],

    /* ================= 2024 ================= */

    "2024": [
        {
            text: '第一次和你家人一起吃饭 还吃了个超大的芒果冰🍧',
            date: '2024年1月1日',
            media: [{ type: 'image', src: '/assets/IMG_9427.jpeg' }],
        },
        {
            text: '你回马六甲留我自己在家的时候 给我的惊喜💕',
            date: '2024年1月18日',
            media: [{ type: 'image', src: '/assets/89c36a266297433d717b2933d2f7e400.jpeg' }],
        },
        {
            text: '我们第一次一起过新年🧧',
            date: '2024年2月9日 12点01分',
            media: [{ type: 'image', src: '/assets/f0d617bfb25dbf8c18773427f4bf3e2a.jpeg' }],
        },
        {
            text: '我们第一次一起上云顶⛰️',
            date: '2024年2月14日 16点08分',
            media: [{ type: 'image', src: '/assets/d16654e2c634fae651e2eeaf8fcd4e47.jpeg' }],
        },
        {
            text: '第一次一起去跟你的亲戚拜年💕 你还哭了🥺',
            date: '2024年2月17日',
            media: [
                { type: 'image', src: '/assets/50B68045-71B0-4D80-8EF9-9992630F4CAB.jpeg' },
                { type: 'image', src: '/assets/D156E2F9-E97E-4A41-ACCD-9F25A390DA42.jpeg' },
            ],
        },
        {
            text: '吵了你很多次 终于第一次做饭给我吃了🙂‍↔️',
            date: '2024年2月27日 12点31分',
            media: [{ type: 'image', src: '/assets/D4E937BA-D863-4A3F-9DA5-1AB944AA72AD.jpeg' }],
        },
        {
            text: '和你过的第一个生日🎂 不懂zmk我没有蛋糕的照片🫡',
            date: '2024年3月11日',
            media: [
                { type: 'image', src: '/assets/IMG_5046.jpeg' },
                { type: 'image', src: '/assets/IMG_5114.jpeg' },
            ],
        },
        {
            text: '我们看过的第一次 也唯一一次的演唱会🎤',
            date: '2024年4月20日',
            media: [
                { type: 'image', src: '/assets/A45495D3-42E1-4576-A346-86CC8F7F9E8E.jpeg' },
                { type: 'image', src: '/assets/IMG_5246.jpeg' },
            ],
        },
        {
            text: '我们第一次在云顶玩 outdoor themepark 🎢',
            date: '2024年4月21日 17点59分',
            media: [{ type: 'image', src: '/assets/IMG_7259.jpeg' }],
        },
        {
            text: '第一次跟你一起回马六甲💕',
            date: '2024年5月19日',
            media: [
                { type: 'image', src: '/assets/IMG_9379.jpeg' },
                { type: 'video', src: '/assets/IMG_9394.MOV' },
            ],
        },
        {
            text: '我们自己第一次一起去旅行 怡宝🧳',
            date: '2024年8月3日 10点38分',
            media: [{ type: 'image', src: '/assets/IMG_6186.jpeg' }],
        },
        {
            text: '你跟我过的第一个生日🎂',
            date: '2024年8月8日 21点49分',
            media: [
                { type: 'image', src: '/assets/7E4E82D8-C176-4FEE-A708-A57B7A1CB4CF.jpeg' },
                { type: 'image', src: '/assets/D9B17B54-5BAB-4140-9659-C2EFB1D92969.jpeg' },
            ],
        },
        {
            text: '我的生日蛋糕 还要是你的aunty买的🙂‍↔️',
            date: '2024年8月10日 21点41分',
            media: [{ type: 'image', src: '/assets/0C552BE8-D170-4333-B945-0812F730E0F2.jpeg' }],
        },
        {
            text: 'Sekinchan之旅 🌾',
            date: '2024年8月25日',
            media: [
                { type: 'image', src: '/assets/4D159D26-2269-4037-9BF2-8213CC2B0674.jpeg' },
                { type: 'image', src: '/assets/0BF0129B-06C5-45F1-90D8-6E2E740BD928.jpeg' },
            ],
        },
        {
            text: '我毕业啦🎓',
            date: '2024年9月8日',
            media: [
                { type: 'image', src: '/assets/IMG_3588.jpeg' },
                { type: 'image', src: '/assets/IMG_3583.jpeg' },
            ],
        },
        {
            text: '很拽哦 要去马六甲玩了🛫',
            date: '2024年9月28日',
            media: [{ type: 'image', src: '/assets/IMG_6816.jpeg' }],
        },
        {
            text: '马六甲一日游🛵',
            date: '2024年9月29日',
            media: [
                { type: 'image', src: '/assets/28f2277faf2b7ab49d8723ff31678ccd.jpeg' },
                { type: 'image', src: '/assets/IMG_6829.jpeg' },
                { type: 'image', src: '/assets/IMG_6835.jpeg' },
            ],
        },
        {
            text: '耳朵痒痒啊 带你去挖大便 挖出个耳结石💩',
            date: '2024年10月6日 16点03分',
            media: [{ type: 'image', src: '/assets/IMG_6854.jpeg' }],
        },
        {
            text: '我可以蹲到 80KG 的 tq （10KG 6片 + 20KG的杆）',
            date: '2024年10月14日 11点12分',
            media: [{ type: 'video', src: '/assets/302D873D-E4EC-4FF5-B9B2-FB47807DA85B.MP4' }],
        },
        {
            text: '我们又去怡宝啦🧳',
            date: '2024年10月25日 15点08分',
            media: [{ type: 'image', src: '/assets/IMG_6917.jpeg' }],
        },
        {
            text: '骗你的 我们是去 Penang 玩🛫',
            date: '2024年10月25日',
            media: [
                { type: 'image', src: '/assets/CCDC5172-BC07-49FE-82A0-86E8066CAF8B.JPG' },
                { type: 'image', src: '/assets/IMG_6927.jpeg' },
            ],
        },
        {
            text: 'Penang之旅 第二天 直接下雨开场☔️',
            date: '2024年10月26日',
            media: [
                { type: 'video', src: '/assets/E1FBA9A2-D428-41F4-B98E-BBB47B9BC0C4.MP4' },
                { type: 'image', src: '/assets/IMG_6933.jpeg' },
                { type: 'image', src: '/assets/IMG_6936.jpeg' },
                { type: 'image', src: '/assets/IMG_6947.jpeg' },
                { type: 'image', src: '/assets/38A8EB79-1DDE-4BBC-8FE4-A1BA4F063488.JPG' },
                { type: 'image', src: '/assets/IMG_6990.jpeg' },
            ],
        },
        {
            text: 'Penang之旅 第三天 晴天啦☀️',
            date: '2024年10月26日',
            media: [
                { type: 'video', src: '/assets/IMG_6994.MOV' },
                { type: 'image', src: '/assets/IMG_6995.jpeg' },
                { type: 'image', src: '/assets/IMG_6997.jpeg' },
                { type: 'image', src: '/assets/IMG_5311.jpeg' },
            ],
        },
        {
            text: '很厉害哦 做gym哦🏋🏻‍♀️',
            date: '2024年11月8日 21点32分',
            media: [{ type: 'video', src: '/assets/IMG_7045.MOV' }],
        },
        {
            text: '你做的紫米饭团🍙',
            date: '2024年11月11日 11点37分',
            media: [{ type: 'image', src: '/assets/5EC151E8-81CD-4AF3-9527-262886FC58F0.jpeg' }],
        },
        {
            text: '用我的才智 换来的pizza😌🍕',
            date: '2024年11月12日 15点37分',
            media: [{ type: 'image', src: '/assets/IMG_7059.jpeg' }],
        },
        {
            text: '我们又去云顶 真的很爱去🫢',
            date: '2024年11月12日',
            media: [
                { type: 'image', src: '/assets/46537813-BA1F-4A23-A1EE-52FC2F7D2A81.jpeg' },
                { type: 'image', src: '/assets/IMG_5582.jpeg' },
            ],
        },
        {
            text: '去Penang的时候买来的照片 都忘记redeem了🫢',
            date: '2024年11月18日',
            media: [
                { type: 'image', src: '/assets/IMG_7114.jpeg' },
                { type: 'image', src: '/assets/IMG_7115.jpeg' },
                { type: 'image', src: '/assets/IMG_7116.jpeg' },
                { type: 'image', src: '/assets/IMG_7117.jpeg' },
            ],
        },
        {
            text: '第一次玩拍照机📸 还是在海底捞🍲',
            date: '2024年11月22日 22点02分',
            media: [{ type: 'image', src: '/assets/IMG_7939.jpeg' }],
        },
        {
            text: 'First Year Anniversary 💕',
            date: '2024年12月9日',
            media: [
                { type: 'image', src: '/assets/IMG_7257.jpeg' },
                { type: 'image', src: '/assets/IMG_5997.jpeg' },
                { type: 'image', src: '/assets/IMG_6016.jpeg' },
                { type: 'video', src: '/assets/IMG_6011.MOV' },
                { type: 'image', src: '/assets/IMG_6019.jpeg' },
                { type: 'image', src: '/assets/IMG_7303.jpeg' },
            ],
        },
        {
            text: '第二次的跨年咯🎉',
            date: '2024年12月31日',
            media: [{ type: 'video', src: '/assets/IMG_7395.MOV' }],
        },
    ],

    /* ================= 2025 ================= */

    "2025": [
        {
            text: '和我的亲戚一起吃饭🍽️',
            date: '2025年1月19日 18点29分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7547.HEIC' },
            ],
        },
        {
            text: '我们还一起去打匹克球🤭',
            date: '2025年1月19日 20点36分',
            media: [
                { type: 'video', src: '/assets/2025/17EF9E30-4061-4D99-9AC3-F3406C2E97AA.MP4' },
            ],
        },
        {
            text: '要去参加annual dinner啊 打扮mui mui🎀',
            date: '2025年1月21日 17点32分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7566.HEIC' },
            ],
        },
        {
            text: '吃annual dinner咯🍸',
            date: '2025年1月19日 19点20分',
            media: [
                { type: 'video', src: '/assets/2025/6A26C30E-C1E7-43E7-BFFC-7CBC55CC026C.MP4' },
                { type: 'video', src: '/assets/2025/31A90A7E-ADC9-477C-AB47-E58F177B005D.MP4' },
            ],
        },
        {
            text: '拿红包害羞啊🤭',
            date: '2025年1月21日 20点18分',
            media: [
                { type: 'video', src: '/assets/2025/VIDEO-2025-01-22-13-32-50.MP4' },
            ],
        },
        {
            text: '第一次在mls喝的luckin😘',
            date: '2025年1月23日 16点49分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7579.HEIC' },
            ],
        },
        {
            text: '蛤？',
            date: '2025年1月26日 15点06分',
            media: [
                { type: 'video', src: '/assets/2025/0fdf4fc22ab84accb65e8f4860bee103.MOV' },
            ],
        },
        {
            text: '一起吃团圆饭🥰',
            date: '2025年1月28日 12点12分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7598.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_7601.HEIC' },
            ],
        },
        {
            text: '初一一起去拜拜🧧',
            date: '2025年1月29日 11点18分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_6975.HEIC' },
            ],
        },
        {
            text: '还想拿柑pok我的头😌',
            date: '2025年1月29日 18点02分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7008.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_7034.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_7074.HEIC' },
            ],
        },
        {
            text: '我去泰国啦 byebye🤭',
            date: '2025年1月31日 08点41分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7678.HEIC' },
            ],
        },
        {
            text: '去完旅行回来跟你打麻将✌️😁',
            date: '2025年2月5日 21点15分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7787.HEIC' },
            ],
        },
        {
            text: 'hou cute啊😘',
            date: '2025年2月9日 17点47分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7805.HEIC' },
            ],
        },
        {
            text: '第二次的情人节快乐🤍（延迟庆祝）',
            date: '2025年2月15日 19点52分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7830.HEIC' },
            ],
        },
        {
            text: 'casting做model啊🤭',
            date: '2025年2月18日 10点19分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7846.HEIC' },
                { type: 'video', src: '/assets/2025/IMG_7847.MOV' },
            ],
        },
        {
            text: 'chocolate好吃吗🤭',
            date: '2025年3月10日 19点19分',
            media: [
                { type: 'video', src: '/assets/2025/IMG_7956.MOV' },
            ],
        },
        {
            text: '第二次跟你庆祝生日🎂',
            date: '2025年3月11日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_7991.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_7997.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8001.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8009.HEIC' },
            ],
        },
        {
            text: '和两妈一起去马六甲🤭',
            date: '2025年3月23日 13点50分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8090.HEIC' },
            ],
        },
        {
            text: '我们还去看husky🐶',
            date: '2025年3月23日 13点50分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8092.HEIC' },
                { type: 'video', src: '/assets/2025/IMG_8098.MOV' },
                { type: 'video', src: '/assets/2025/IMG_8924.MOV' },
                { type: 'image', src: '/assets/2025/IMG_8107.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8929.JPG' },
            ],
        },
        {
            text: '带你第一次坐飞机✈️ 怕怕🤭',
            date: '2025年5月24日 10点53分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8513.heic' },
                { type: 'video', src: '/assets/2025/IMG_8516.MOV' },
            ],
        },
        {
            text: 'Johor之旅💕',
            date: '2025年5月25日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8517.HEIC' },
                { type: 'image', src: '/assets/2025/A7B08508-42CD-495E-82D3-E90661672B52.JPG' },
                { type: 'image', src: '/assets/2025/IMG_8521.HEIC' },
            ],
        },
        {
            text: 'Port Dickson之旅 第一天🏖️',
            date: '2025年5月29日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8541.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8542.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8544.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8551.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8561.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9630.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8578.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8583.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8588.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9721.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9728.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8596.HEIC' },
            ],
        },
        {
            text: 'Port Dickson之旅 第二天🏝️',
            date: '2025年5月29日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8598.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8601.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9788.JPG' },
                { type: 'image', src: '/assets/2025/IMG_9843.HEIC' },
            ],
        },
        {
            text: 'Port Dickson之旅 第三天⛱️',
            date: '2025年5月29日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8604.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8610.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9872.JPG' },
            ],
        },
        {
            text: '真的是一直去玩啊 刚回来不久就去云顶🚙',
            date: '2025年6月2日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8612.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8614.HEIC' },
                { type: 'video', src: '/assets/2025/IMG_9924.MOV' },
                { type: 'video', src: '/assets/2025/cc1f00f683fa4a5bb57760d189552a26.MOV' },
                { type: 'image', src: '/assets/2025/IMG_9930.JPG' },
            ],
        },
        {
            text: '因为要开始做Zenth了 所以要玩完他🤭',
            date: '2025年6月4日 10点10分',
            media: [
                { type: 'video', src: '/assets/2025/IMG_8619.MOV' },
            ],
        },
        {
            text: '然后又去bentong玩了 还连上云顶😌',
            date: '2025年6月9日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8633.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_0018.HEIC' },
                { type: 'video', src: '/assets/2025/IMG_0043.MOV' },
                { type: 'video', src: '/assets/2025/IMG_0044.MOV' },
                { type: 'video', src: '/assets/2025/IMG_0045.MOV' },
                { type: 'image', src: '/assets/2025/IMG_0058.HEIC' },
            ],
        },
        {
            text: '很cute叻你😘',
            date: '2025年6月10日 10点13分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8644.heic' },
            ],
        },
        {
            text: '还想跟我打羽球啊🏸',
            date: '2025年6月60日 1点28分',
            media: [
                { type: 'video', src: '/assets/2025/a6773f6cd1e44dec9a25a837341ad296.MOV' },
                { type: 'image', src: '/assets/2025/56E1B7F1-71D4-4B06-B65E-DA0229D85658.JPG' },
            ],
        },
        {
            text: '探班🤭',
            date: '2025年6月17日',
            media: [
                { type: 'video', src: '/assets/2025/IMG_8748.MOV' },
                { type: 'image', src: '/assets/2025/IMG_8752.HEIC' },
            ],
        },
        {
            text: '原本要记录减肥的 现在记录原本有多瘦🥺',
            date: '2025年6月29日 23点49分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8808.HEIC' },
            ],
        },
        {
            text: '你在干嘛🤭',
            date: '2025年6月30日 20点12分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8812.HEIC' },
            ],
        },
        {
            text: '看到网红的车车 偷拍🤭',
            date: '2025年7月6日 21点42分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8837.HEIC' },
            ],
        },
        {
            text: '爱心喵❤️',
            date: '2025年7月28日 9点53分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8931.HEIC' },
            ],
        },
        {
            text: '跟你一次去吃ikea🍰',
            date: '2025年8月4日 13点43分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_8946.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_8949.HEIC' },
            ],
        },
        {
            text: '小莓在one u被撞了🥺',
            date: '2025年8月4日 18点06分',
            media: [
                { type: 'video', src: '/assets/2025/IMG_0449.MOV' },
                { type: 'image', src: '/assets/2025/IMG_8954.jpg' },
            ],
        },
        {
            text: '我的生日🎂（比较像你的）',
            date: '2025年8月11日 16点14分',
            media: [
                { type: 'image', src: '/assets/2025/B6C22770-2035-41B9-93D2-7748A90D0485.JPG' },
                { type: 'image', src: '/assets/2025/A6DAED70-1528-43DC-A2A6-7FB8492512E6.JPG' },
                { type: 'image', src: '/assets/2025/IMG_9025.HEIC' },
            ],
        },
        {
            text: '你看你怎样吃东西的🙂‍↔️',
            date: '2025年8月21日 22点22分',
            media: [
                { type: 'video', src: '/assets/2025/IMG_9096.MOV' },
            ],
        },
        {
            text: '堪忧啊🙂‍↔️',
            date: '2025年8月21日 22点22分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9120.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9121.HEIC' },
            ],
        },
        {
            text: '还要带我买天珠戴🫢',
            date: '2025年8月24日 21点38分',
            media: [
                { type: 'image', src: '/assets/2025/67829610-31EE-4675-980C-0167B9E74B1F.JPG' },
            ],
        },
        {
            text: '小学生放学回家啊🤭',
            date: '2025年8月24日 22点53分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9153.HEIC' },
            ],
        },
        {
            text: '偷拍网红📸',
            date: '2025年8月25日 18点06分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9158.HEIC' },
            ],
        },
        {
            text: '吃海底捞还要做功课🙂‍↔️',
            date: '2025年8月25日 20点02分',
            media: [
                { type: 'image', src: '/assets/2025/53E2939F-E29D-47F6-B0DC-967D7D8E99A4.JPG' },
            ],
        },
        {
            text: '好睡吗🤭',
            date: '2025年8月31日 00点14分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9196.HEIC' },
            ],
        },
        {
            text: '又又又去云顶☁️',
            date: '2025年9月15日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_1015.JPG' },
                { type: 'image', src: '/assets/2025/IMG_1017.JPG' },
                { type: 'image', src: '/assets/2025/IMG_1020.JPG' },
                { type: 'image', src: '/assets/2025/IMG_1021.JPG' },
                { type: 'image', src: '/assets/2025/IMG_9343.HEIC' },
            ],
        },
        {
            text: '小姐 我们要关店了哦😌',
            date: '2025年10月6日 20点51分',
            media: [
                { type: 'video', src: '/assets/2025/IMG_9452.MOV' },
            ],
        },
        {
            text: '很dulan啊 生气气要哭了😿',
            date: '2025年10月18日 19点59分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_1398.JPG' },
            ],
        },
        {
            text: '什么来的🤭',
            date: '2025年10月20日 9点50分',
            media: [
                { type: 'video', src: '/assets/2025/IMG_9555.MOV' },
            ],
        },
        {
            text: 'Penang之旅 2.0✌️ Day 1',
            date: '2025年10月27日',
            media: [
                { type: 'image', src: '/assets/2025/79DAB4E4-348D-4098-AB4E-0C6D2AFA4611.JPG' },
                { type: 'image', src: '/assets/2025/2B280BA4-B875-4341-85AB-20745B5FF604.JPG' },
                { type: 'image', src: '/assets/2025/IMG_9605.HEIC' },
            ],
        },
        {
            text: 'Penang之旅 2.0✌️ Day 2',
            date: '2025年10月28日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9615.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9623.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9635.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9651.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9656.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9675.HEIC' },
            ],
        },
        {
            text: 'Penang之旅 2.0✌️ Day 3',
            date: '2025年10月29日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9678.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9679.HEIC' },
            ],
        },
        {
            text: '带你体验玩game🎮',
            date: '2025年11月3日 17点30分',
            media: [
                { type: 'video', src: '/assets/2025/IMG_9690.MOV' },
                { type: 'video', src: '/assets/2025/IMG_9691.MOV' },
            ],
        },
        {
            text: 'Facial痛痛😣',
            date: '2025年11月3日 11点42分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9692.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9693.HEIC' },
            ],
        },
        {
            text: '谢谢BB送的钱包😘',
            date: '2025年11月10日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9711.HEIC' },
            ],
        },
        {
            text: 'qiong gan啊啊啊',
            date: '2025年11月17日 17点11分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9735.HEIC' },
            ],
        },
        {
            text: '嘻嘻 不嘻嘻',
            date: '2025年12月1日 12点42分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9771.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9770.HEIC' },
            ],
        },
        {
            text: '非常嘻嘻😁',
            date: '2025年12月2日 20点30分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9774.HEIC' },
            ],
        },
        {
            text: '你：拍我拍我✌️',
            date: '2025年12月2日 11点06分',
            media: [
                { type: 'video', src: '/assets/2025/IMG_9775.MOV' },
            ],
        },
        {
            text: 'Second year anniversary💕',
            date: '2025年12月9日 18点44分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9805.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9825.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9828.HEIC' },
                { type: 'image', src: '/assets/2025/844D4B56-93DF-4576-93A3-9C5CC07EA592.JPG' },
            ],
        },
        {
            text: 'xiao zha bo🤭',
            date: '2025年12月10日 22点48分',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9840.HEIC' },
            ],
        },
        {
            text: 'BB买给我的游戏机 爱死你啊😘😘',
            date: '2025年12月12日',
            media: [
                { type: 'image', src: '/assets/2025/3EB4C667-42EB-499E-9B89-78ED04699BF0.JPG' },
            ],
        },
        {
            text: '金马伦之旅 Day 1🌲',
            date: '2025年12月15日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9870.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9872.HEIC' },
                { type: 'video', src: '/assets/2025/IMG_9874.MOV' },
                { type: 'image', src: '/assets/2025/IMG_9875.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9877.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9881.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9882.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9885.HEIC' },
            ],
        },
        {
            text: '金马伦之旅 Day 2🌳',
            date: '2025年12月16日',
            media: [
                { type: 'image', src: '/assets/2025/IMG_9888.HEIC' },
                { type: 'image', src: '/assets/2025/IMG_9891.HEIC' },
            ],
        },
        {
            text: '小姐不好意思啊 前面有人坐了🫢',
            date: '2025年12月12日',
            media: [
                { type: 'video', src: '/assets/2025/IMG_9907.MOV' },
            ],
        },
        {
            text: '第三次跨年啦🎉',
            date: '2025年12月31日',
            media: [
                { type: 'video', src: '/assets/2025/IMG_9947.MOV' },
            ],
        },
    ]
}