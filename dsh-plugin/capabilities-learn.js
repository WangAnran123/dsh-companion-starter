/**
 * capabilities-learn.js —— 自主学习：经验库 + 反思 + 每日复盘
 * ============================================================================
 * 记忆 vs 学习的区别：
 *   记忆 = 记录「发生过什么」（companion_add_memory）
 *   学习 = 因为发生过，**下次做法改变**（本模块）
 *
 * 三块积木：
 *   ① 经验库 lessons.md —— 结构化一条：场景 / 坑 / 下次怎么做
 *   ② companion_reflect —— 一轮任务结束后，判断值不值得留经验、留成什么
 *   ③ companion_review  —— 每天收尾：今天哪些值得固化，写成复盘文件
 *
 * 没有任何「模型变聪明」的魔法：能做的是把经验变成**下次会被检索到的文本**。
 * 所以配套流程必须是：任务开始 → companion_lesson_search 查一下。
 * ============================================================================
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readConfig, writeConfig, ensureBase, CONFIG_PATH, BASE_DIR } from './companion-config.js'

const LESSONS_PATH = () => join(BASE_DIR, 'lessons.md')
const MEMORY_PATH = () => join(BASE_DIR, 'memory.md')
const REVIEW_DIR = () => join(BASE_DIR, 'review')

const todayStr = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 一行一条：- [日期] [标签] 场景: … | 坑: … | 下次: … */
function parseLessons(md) {
  const out = []
  for (const line of String(md || '').split(/\r?\n/)) {
    const m = /^\s*-\s*\[(\d{4}-\d{2}-\d{2})\]\s*(?:\[([^\]]+)\])?\s*(.*)$/.exec(line)
    if (!m) continue
    const body = m[3]
    const pick = (key) => {
      const r = new RegExp(`${key}\\s*[:：]\\s*([^|]*)`).exec(body)
      return r ? r[1].trim() : ''
    }
    out.push({ date: m[1], tag: (m[2] || 'general').trim(), scene: pick('场景'), pitfall: pick('坑'), next: pick('下次'), raw: body.trim() })
  }
  return out
}

function scoreEntry(entry, terms) {
  const hay = `${entry.tag} ${entry.scene} ${entry.pitfall} ${entry.next} ${entry.raw}`.toLowerCase()
  let score = 0
  for (const t of terms) {
    if (!t) continue
    if (hay.includes(t)) score += 1
    if (entry.tag.toLowerCase().includes(t)) score += 2
  }
  return score
}

export function registerLearnTools(tool) {
  tool({
    name: 'companion_lesson_add',
    description: '把一次经验存进经验库（结构化：场景 / 坑 / 下次怎么做）。真正踩过的坑、真正有效的做法才记；空泛的"要小心"不要记。',
    parameters: {
      type: 'object',
      properties: {
        scene: { type: 'string', description: '什么场景下（例：渲染视频时音频静音）' },
        pitfall: { type: 'string', description: '踩了什么坑 / 出了什么问题' },
        next: { type: 'string', description: '下次具体怎么做（要可执行）' },
        tag: { type: 'string', description: '归类标签，如 video / qq / douyin / memory' },
        source: { type: 'string', description: '来源：哪次任务、哪个项目' },
      },
      required: ['scene', 'pitfall', 'next'],
      additionalProperties: false,
    },
    async execute(args) {
      const scene = String(args?.scene || '').trim()
      const pitfall = String(args?.pitfall || '').trim()
      const next = String(args?.next || '').trim()
      if (!scene || !pitfall || !next) return { ok: false, error: 'scene / pitfall / next 三个都要给，缺了就没法复用' }
      if (next.length < 6) return { ok: false, error: 'next 太笼统了，写成能照做的动作（例如"渲染前给每个 <audio> 加 id"）' }
      ensureBase()
      const tag = String(args?.tag || 'general').replace(/[\[\]|]/g, '').trim() || 'general'
      const line = `- [${todayStr()}] [${tag}] 场景: ${scene} | 坑: ${pitfall} | 下次: ${next}`
      const p = LESSONS_PATH()
      const header = existsSync(p) ? '' : '# 经验库\n\n> 一行一条：场景 / 坑 / 下次怎么做。任务开始前用 companion_lesson_search 查一下。\n\n'
      appendFileSync(p, header + line + '\n', 'utf8')
      const all = parseLessons(readFileSync(p, 'utf8'))
      return { ok: true, file: p, entry: { scene, pitfall, next, tag }, total: all.length }
    },
  })

  tool({
    name: 'companion_lesson_search',
    description: '【做任务前先调它】在经验库里按关键词检索「以前踩过的坑 / 有效的做法」，返回最相关的几条。空结果说明是新情况，可以放心试。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '关键词，空格分隔（例：视频 音频 静音）' },
        tag: { type: 'string', description: '只查某个标签' },
        limit: { type: 'number', description: '返回几条（默认 5）' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    async execute(args) {
      const p = LESSONS_PATH()
      if (!existsSync(p)) return { ok: true, hits: [], note: `经验库还是空的：${p}` }
      const terms = String(args?.query || '').toLowerCase().split(/\s+/).filter(Boolean)
      const tagFilter = args?.tag ? String(args.tag).toLowerCase() : ''
      const all = parseLessons(readFileSync(p, 'utf8'))
        .filter((e) => (tagFilter ? e.tag.toLowerCase() === tagFilter : true))
      const scored = all
        .map((e) => ({ e, s: scoreEntry(e, terms) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, Math.max(1, Math.min(20, Number(args?.limit || 5))))
        .map((x) => ({ ...x.e, score: x.s }))
      return {
        ok: true,
        total: all.length,
        hits: scored,
        note: scored.length ? '照着「下次」那栏做' : '经验库里没有相关记录：按新情况处理，做完记得 companion_lesson_add',
      }
    },
  })

  tool({
    name: 'companion_reflect',
    description: '一轮任务结束后做一次反思：给它「做了什么 / 结果 / 哪里翻了车」，它会判断值不值得留经验，并给出可直接入库的条目（save=true 就直接写进经验库）。',
    parameters: {
      type: 'object',
      properties: {
        done: { type: 'string', description: '这一轮做了什么（一两句）' },
        outcome: { type: 'string', description: '结果：成功 / 失败 / 被打回重做' },
        learned: { type: 'string', description: '你自己的结论：下次该怎么做（越具体越好）' },
        tag: { type: 'string', description: '归类标签' },
        save: { type: 'boolean', description: 'true = 直接写进经验库（默认只返回不写）' },
      },
      required: ['done', 'outcome'],
      additionalProperties: false,
    },
    async execute(args) {
      const done = String(args?.done || '').trim()
      const outcome = String(args?.outcome || '').trim()
      const learned = String(args?.learned || '').trim()
      const worthSaving = learned.length >= 8 && !/^(注意|小心|多测试|再看看)/.test(learned)
      const suggestion = {
        scene: done.slice(0, 60),
        pitfall: /失败|打回|重做/.test(outcome) ? outcome.slice(0, 60) : '',
        next: learned,
        tag: String(args?.tag || 'general'),
      }
      let saved = null
      if (worthSaving && args?.save === true) {
        ensureBase()
        const tag = suggestion.tag.replace(/[\[\]|]/g, '') || 'general'
        const line = `- [${todayStr()}] [${tag}] 场景: ${suggestion.scene} | 坑: ${suggestion.pitfall || '（顺利，但做法值得复用）'} | 下次: ${suggestion.next}`
        const p = LESSONS_PATH()
        const header = existsSync(p) ? '' : '# 经验库\n\n> 一行一条：场景 / 坑 / 下次怎么做。\n\n'
        appendFileSync(p, header + line + '\n', 'utf8')
        saved = line
      }
      return {
        ok: true,
        worthSaving,
        reason: worthSaving
          ? '值得留：结论具体、可执行'
          : (learned ? '结论太笼统（"注意/小心/多测试"这类不算经验），补一个具体动作再存' : '还没给出结论：先问自己「下次具体怎么做」'),
        suggestion,
        saved,
        next: worthSaving && !saved ? '觉得可以就再调一次 companion_reflect，带上 save=true' : undefined,
      }
    },
  })

  tool({
    name: 'companion_review',
    description: '每日复盘：把今天新增的记忆、新增的经验、主动关心的次数汇总成一份复盘文件（review/<日期>.md），并列出"今天固化了几条经验"。适合每天收尾跑一次。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD，默认今天' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const date = String(args?.date || todayStr())
      ensureBase()
      const memoryMd = existsSync(MEMORY_PATH()) ? readFileSync(MEMORY_PATH(), 'utf8') : ''
      const lessonsMd = existsSync(LESSONS_PATH()) ? readFileSync(LESSONS_PATH(), 'utf8') : ''
      const memToday = memoryMd.split(/\r?\n/).filter((l) => l.includes(`[${date}]`))
      const lessonsToday = parseLessons(lessonsMd).filter((l) => l.date === date)
      let proactiveToday = 0
      try {
        const pl = join(BASE_DIR, 'proactive.jsonl')
        if (existsSync(pl)) {
          proactiveToday = readFileSync(pl, 'utf8').split(/\r?\n/).filter((l) => l.includes(date)).length
        }
      } catch { /* ignore */ }

      const lines = [
        `# ${date} 复盘`,
        '',
        `## 今天新增记忆（${memToday.length} 条）`,
        ...(memToday.length ? memToday.map((l) => l.replace(/^\s*-\s*/, '- ')) : ['（无）']),
        '',
        `## 今天固化的经验（${lessonsToday.length} 条）`,
        ...(lessonsToday.length
          ? lessonsToday.map((e) => `- **${e.tag}** ${e.scene} → 下次：${e.next}`)
          : ['（无 —— 今天没有沉淀任何经验，想想有没有值得记的）']),
        '',
        '## 主动性',
        `- 今天主动关心 ${proactiveToday} 次`,
        '',
        '## 明天开工先做',
        '- 跑 companion_lesson_search 查相关经验，再动手',
        '- 如果昨天有未完成的事，先看 current-task 类文件',
        '',
      ]
      const dir = REVIEW_DIR()
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `${date}.md`)
      writeFileSync(file, lines.join('\n'), 'utf8')
      return {
        ok: true,
        file,
        date,
        memoryAdded: memToday.length,
        lessonsAdded: lessonsToday.length,
        proactiveCount: proactiveToday,
        verdict: lessonsToday.length
          ? `今天学进去 ${lessonsToday.length} 条经验`
          : '今天没有新经验：不算失败，但没有"学习"发生',
      }
    },
  })

  tool({
    name: 'companion_learning_status',
    description: '看自主学习这套东西的状态：经验库多少条、最近一次复盘是哪天、今天有没有固化经验。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      ensureBase()
      const lessons = existsSync(LESSONS_PATH()) ? parseLessons(readFileSync(LESSONS_PATH(), 'utf8')) : []
      let revList = []
      try { revList = readdirSync(REVIEW_DIR()).filter((f) => f.endsWith('.md')).sort() } catch { revList = [] }
      const today = todayStr()
      return {
        lessons: { file: LESSONS_PATH(), total: lessons.length, today: lessons.filter((l) => l.date === today).length, tags: [...new Set(lessons.map((l) => l.tag))] },
        reviews: { dir: REVIEW_DIR(), count: revList.length, latest: revList[revList.length - 1] || null },
        files: { lessons: LESSONS_PATH(), memory: MEMORY_PATH(), config: CONFIG_PATH },
        next: lessons.length === 0
          ? { action: 'companion_lesson_add', why: '经验库还是空的：先记一条今天真踩过的坑' }
          : { action: 'companion_lesson_search', why: '做新任务前先检索经验' },
      }
    },
  })

  tool({
    name: 'companion_learning_config',
    description: '自主学习相关的开关：是否允许自动复盘、复盘时间（配合 DSH 的定时任务用）。',
    parameters: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: '是否开启每日复盘' },
        dailyReviewAt: { type: 'string', description: '复盘时间 HH:MM（默认 23:00）' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const patch = { learning: {} }
      if (args?.enabled !== undefined) patch.learning.enabled = args.enabled
      if (args?.dailyReviewAt) patch.learning.dailyReviewAt = String(args.dailyReviewAt)
      if (!Object.keys(patch.learning).length) {
        return { ok: false, error: '没有要改的字段', current: readConfig().learning }
      }
      const next = writeConfig(patch)
      return { ok: true, configFile: CONFIG_PATH, learning: next.learning }
    },
  })
}
