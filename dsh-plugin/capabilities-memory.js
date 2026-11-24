/**
 * capabilities-memory.js —— 跨端记忆：摘要 + 同步
 * ============================================================================
 * 记忆的唯一源是 <BASE>/memory.md（一行一条：- [YYYY-MM-DD] [标签] 内容）。
 * 本模块负责两件事：
 *   ① companion_memory_digest  把某一天的条目整理成一段摘要，写到 digest/<date>.md
 *   ② companion_memory_sync    把整份记忆同步进各端文件（QQ 记忆、抖音人格……），
 *      用标记块包裹，**只替换标记之间的内容**，不碰目标文件的其他部分。
 * ============================================================================
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { readConfig, writeConfig, expandPath, ensureBase, CONFIG_PATH, BASE_DIR } from './companion-config.js'

const MEMORY_PATH = () => join(BASE_DIR, 'memory.md')
const START = '<!-- companion:memory:start -->'
const END = '<!-- companion:memory:end -->'

const ENTRY = /^\s*-\s*\[(\d{4}-\d{2}-\d{2})\]\s*(?:\[([^\]]+)\])?\s*(.*)$/

function parseEntries(md) {
  const out = []
  for (const line of String(md || '').split(/\r?\n/)) {
    const m = ENTRY.exec(line)
    if (m) out.push({ date: m[1], tag: (m[2] || '未分类').trim(), text: m[3].trim() })
  }
  return out
}

function todayISO() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function registerMemoryTools(tool) {
  tool({
    name: 'companion_memory_digest',
    description: '把某一天（默认今天）的长期记忆整理成一段按标签分组的摘要，写到 digest/<日期>.md。用于每天收尾、或同步给其他端之前压缩上下文。',
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD，默认今天' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const date = String(args?.date || todayISO())
      const md = existsSync(MEMORY_PATH()) ? readFileSync(MEMORY_PATH(), 'utf8') : ''
      const entries = parseEntries(md).filter((e) => e.date === date)
      if (!entries.length) return { ok: false, date, error: `这一天没有记忆条目（${MEMORY_PATH()}）` }
      const byTag = new Map()
      for (const e of entries) {
        if (!byTag.has(e.tag)) byTag.set(e.tag, [])
        byTag.get(e.tag).push(e.text)
      }
      const lines = [`# ${date} 记忆摘要`, '']
      for (const [tag, items] of byTag) {
        lines.push(`## ${tag}`)
        for (const t of items) lines.push(`- ${t}`)
        lines.push('')
      }
      const outDir = join(BASE_DIR, 'digest')
      mkdirSync(outDir, { recursive: true })
      const outFile = join(outDir, `${date}.md`)
      writeFileSync(outFile, lines.join('\n'), 'utf8')
      return {
        ok: true,
        date,
        entries: entries.length,
        tags: [...byTag.keys()],
        file: outFile,
        preview: lines.slice(0, 12).join('\n'),
      }
    },
  })

  tool({
    name: 'companion_memory_sync',
    description: '把长期记忆同步到各端文件（QQ 记忆 / 抖音人格等）：只替换文件里 <!-- companion:memory:start --> 与 end 之间的内容，其他内容一律不动。目标路径先在 companion_memory_targets 里配。',
    parameters: {
      type: 'object',
      properties: {
        dryRun: { type: 'boolean', description: '只报告会改什么，不写文件' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const cfg = readConfig()
      const targets = Array.isArray(cfg.memory?.targets) ? cfg.memory.targets : []
      if (!targets.length) {
        return {
          ok: false,
          error: '还没配同步目标：先调 companion_memory_targets 加一个（path + kind）',
          configFile: CONFIG_PATH,
        }
      }
      const md = existsSync(MEMORY_PATH()) ? readFileSync(MEMORY_PATH(), 'utf8') : ''
      if (!md.trim()) return { ok: false, error: `记忆文件是空的：${MEMORY_PATH()}` }
      const entries = parseEntries(md)
      const block = [START, '', `> 同步自 ${MEMORY_PATH()} · ${entries.length} 条 · ${new Date().toISOString()}`, '', md.trim(), '', END].join('\n')
      const dryRun = Boolean(args?.dryRun)
      const results = []

      for (const t of targets) {
        const p = expandPath(String(t?.path || ''))
        if (!p) { results.push({ target: t, ok: false, error: 'path 为空' }); continue }
        let before = ''
        try { before = existsSync(p) ? readFileSync(p, 'utf8') : '' } catch { before = '' }
        let after
        if (before.includes(START) && before.includes(END)) {
          const head = before.slice(0, before.indexOf(START))
          const tailIdx = before.indexOf(END) + END.length
          after = head + block + before.slice(tailIdx)
          results.push({ target: p, kind: t.kind || '', mode: 'replaced', ok: true })
        } else {
          after = (before ? before.replace(/\s*$/, '') + '\n\n' : '') + block + '\n'
          results.push({ target: p, kind: t.kind || '', mode: before ? 'appended' : 'created', ok: true })
        }
        if (!dryRun) {
          mkdirSync(dirname(p), { recursive: true })
          writeFileSync(p, after, 'utf8')
        }
      }
      return { ok: results.every((r) => r.ok), dryRun, entries: entries.length, results }
    },
  })

  tool({
    name: 'companion_memory_targets',
    description: '管理「跨端记忆同步」的目标文件列表。add 加一个（path + kind），remove 删一个（按 path 匹配），list 列出当前的。',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['list', 'add', 'remove'], description: '要做什么' },
        path: { type: 'string', description: '目标文件绝对路径（add/remove 时必填）' },
        kind: { type: 'string', description: '端标识：qq / douyin / desktop，随便写便于区分' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    async execute(args) {
      const cfg = readConfig()
      const list = Array.isArray(cfg.memory?.targets) ? [...cfg.memory.targets] : []
      const action = String(args?.action || 'list')
      if (action === 'list') return { ok: true, targets: list, configFile: CONFIG_PATH }
      const p = expandPath(String(args?.path || ''))
      if (!p) return { ok: false, error: 'path 必填' }
      if (action === 'add') {
        if (!list.some((t) => expandPath(t.path) === p)) {
          list.push({ path: p, kind: String(args?.kind || '') })
          writeConfig({ memory: { targets: list } })
        }
        return { ok: true, targets: list, configFile: CONFIG_PATH }
      }
      if (action === 'remove') {
        const next = list.filter((t) => expandPath(t.path) !== p)
        writeConfig({ memory: { targets: next } })
        return { ok: true, removed: list.length - next.length, targets: next }
      }
      return { ok: false, error: `不认识 action：${action}` }
    },
  })
}
