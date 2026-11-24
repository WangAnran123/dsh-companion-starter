/**
 * capabilities-proactive.js —— 主动关心：什么时候该主动找用户说话
 * ============================================================================
 * 只做「决策」，不做「发送」：
 *   模型调到 companion_proactive_should → 得到「现在该不该主动、为什么、可以怎么样开场」
 *   → 模型自己组织语言、调 companion_qq_send 或桌面语音去说。
 * 这样调度（DSH 的 schedule）和语气（人格文件）都还在用户手里。
 * ============================================================================
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readConfig, writeConfig, ensureBase, CONFIG_PATH, BASE_DIR } from './companion-config.js'

const LOG_PATH = () => join(BASE_DIR, 'proactive.jsonl')

function readLog() {
  const p = LOG_PATH()
  if (!existsSync(p)) return []
  try {
    return readFileSync(p, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l) } catch { return null } })
      .filter(Boolean)
  } catch { return [] }
}

function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim())
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

function todayOf(iso) {
  return String(iso || '').slice(0, 10)
}

export function registerProactiveTools(tool) {
  tool({
    name: 'companion_proactive_config',
    description: '设置主动关心的规则：开关、安静时段（这段时间绝不打扰）、每天最多几次、两次之间至少隔多久。',
    parameters: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: '是否允许主动' },
        quietStart: { type: 'string', description: '安静时段开始，HH:MM（默认 23:30）' },
        quietEnd: { type: 'string', description: '安静时段结束，HH:MM（默认 07:30）' },
        maxPerDay: { type: 'number', description: '每天最多主动几次（默认 3）' },
        minGapMinutes: { type: 'number', description: '两次主动至少间隔多少分钟（默认 90）' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const patch = { proactive: {} }
      for (const k of ['enabled', 'quietStart', 'quietEnd', 'maxPerDay', 'minGapMinutes']) {
        if (args?.[k] !== undefined) patch.proactive[k] = args[k]
      }
      if (!Object.keys(patch.proactive).length) return { ok: false, error: '没有要改的字段' }
      const next = writeConfig(patch)
      return { ok: true, configFile: CONFIG_PATH, proactive: next.proactive }
    },
  })

  tool({
    name: 'companion_proactive_should',
    description: '判断「现在该不该主动找用户说话」：会看安静时段、今天已经主动几次、距上次隔了多久。返回 act / reason / 可用开场方向。只决策，不发送。',
    parameters: {
      type: 'object',
      properties: {
        now: { type: 'string', description: '可选 ISO 时间，默认当前时间（便于测试）' },
        lastUserMessageAt: { type: 'string', description: '可选：用户最后一次说话的 ISO 时间' },
        hint: { type: 'string', description: '可选：你想主动说什么方向（吃饭/睡觉/天气/项目进展）' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const cfg = readConfig().proactive
      const now = args?.now ? new Date(String(args.now)) : new Date()
      const nowMin = now.getHours() * 60 + now.getMinutes()
      const qs = minutesOf(cfg.quietStart)
      const qe = minutesOf(cfg.quietEnd)
      const log = readLog()
      const today = todayOf(now.toISOString())
      const todayCount = log.filter((e) => todayOf(e.at) === today).length
      const last = log.length ? new Date(log[log.length - 1].at) : null
      const gapMin = last ? Math.round((now.getTime() - last.getTime()) / 60000) : null

      let inQuiet = false
      if (qs !== null && qe !== null) {
        inQuiet = qs <= qe ? (nowMin >= qs && nowMin < qe) : (nowMin >= qs || nowMin < qe)
      }

      let act = true
      let reason = '可以主动：时段合适、今天还没打扰过'
      if (!cfg.enabled) { act = false; reason = '主动关心被关掉了（companion_proactive_config enabled=false）' }
      else if (inQuiet) { act = false; reason = `现在是安静时段（${cfg.quietStart}–${cfg.quietEnd}），绝不打扰` }
      else if (todayCount >= cfg.maxPerDay) { act = false; reason = `今天已经主动 ${todayCount} 次，到上限了` }
      else if (gapMin !== null && gapMin < cfg.minGapMinutes) { act = false; reason = `距上次主动才 ${gapMin} 分钟（下限 ${cfg.minGapMinutes}）` }
      else if (todayCount > 0) { reason = `可以主动：今天第 ${todayCount + 1} 次，距上次 ${gapMin} 分钟` }

      const openers = []
      if (args?.hint) openers.push(`按你的方向来：${args.hint}`)
      openers.push('问一句具体的（吃没吃、在忙什么），别泛泛地问"在吗"')
      openers.push('接着上次的话题往下说，证明你记得')

      return {
        act,
        reason,
        now: now.toISOString(),
        stats: { todayCount, maxPerDay: cfg.maxPerDay, gapMinutes: gapMin, quiet: inQuiet },
        openers,
        next: act ? { action: 'companion_qq_send', why: '决定要说话了，用 QQ 或桌面语音去说，说完调 companion_proactive_log 记一笔' } : { action: 'none' },
      }
    },
  })

  tool({
    name: 'companion_proactive_log',
    description: '记录一次「主动关心」已经发生（说话之后调用），用于统计当天次数、控制频率。',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '说了一句什么（一句话概括）' },
        channel: { type: 'string', description: 'qq / desktop / douyin' },
        at: { type: 'string', description: '可选 ISO 时间，默认现在' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      ensureBase()
      const at = args?.at ? new Date(String(args.at)).toISOString() : new Date().toISOString()
      const entry = { at, summary: String(args?.summary || '').slice(0, 200), channel: String(args?.channel || 'unknown') }
      appendFileSync(LOG_PATH(), JSON.stringify(entry) + '\n', 'utf8')
      const log = readLog()
      const today = todayOf(at)
      return {
        ok: true,
        logged: entry,
        logFile: LOG_PATH(),
        todayCount: log.filter((e) => todayOf(e.at) === today).length,
      }
    },
  })

  tool({
    name: 'companion_proactive_reset',
    description: '清空主动关心记录（换一天、想重新计时、或测试后清理时用）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      ensureBase()
      try { writeFileSync(LOG_PATH(), '', 'utf8') } catch { /* ignore */ }
      return { ok: true, cleared: LOG_PATH() }
    },
  })
}
