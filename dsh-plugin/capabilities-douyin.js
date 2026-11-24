/**
 * capabilities-douyin.js —— 抖音：登录态、体检、发布、回复、只读查数据
 * ============================================================================
 * 边界（重要）：
 *   ✅ 只读：用公开接口查**你自己的作品数据**（点赞/评论数），不需要签名
 *   ✅ 发布 / 回复：**不伪造签名、不绕风控**。做法是把文件准备好，然后用系统浏览器
 *      打开官方创作者页 / 视频页，由用户（或带视觉的 agent）点最后一下。
 *   ✅ 有风险确认 + 每日配额：写入类操作必须先 acknowledge，且一天不超过 N 条。
 *   ❌ 不做：批量刷屏、模拟人手绕过验证、替别人操作账号
 * ============================================================================
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs'
import { join, basename, extname } from 'node:path'
import { execFile } from 'node:child_process'
import { readConfig, writeConfig, expandPath, ensureBase, CONFIG_PATH } from './companion-config.js'

const RISK_VERSION = '2026-11-24.1'
const RISK_POINTS = [
  '抖音对自动化行为有风控：频繁操作可能被限流、禁言，甚至封号。',
  '本插件不伪造签名、不绕验证码，只把「准备 + 打开官方页面」做好，最后一步由你确认。',
  '回复/评论默认每天有上限（见 config.douyin.dailyReplyLimit），请不要调高了刷屏。',
  '发布内容由你负责：侵权、违规内容与作者无关，风险自担。',
  '不要用它替别人操作账号，也不要在未授权的情况下抓取他人数据。',
]

const today = () => new Date().toISOString().slice(0, 10)
const QUOTA_PATH = () => join(ensureBase(), 'douyin-quota.json')

function readQuota() {
  try { return JSON.parse(readFileSync(QUOTA_PATH(), 'utf8')) } catch { return {} }
}
function writeQuota(q) {
  writeFileSync(QUOTA_PATH(), JSON.stringify(q, null, 2) + '\n', 'utf8')
}

function findBrowser(cfg) {
  const configured = expandPath(cfg.douyin?.browser || '')
  if (configured && existsSync(configured)) return configured
  const cands = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ]
  return cands.find((p) => existsSync(p)) || ''
}

function openWithBrowser(browser, url) {
  return new Promise((resolve) => {
    if (!browser) return resolve({ opened: false, reason: '没找到浏览器（config.douyin.browser 可以手动指定）' })
    const args = process.platform === 'win32' ? [url] : [url]
    try {
      execFile(browser, args, { windowsHide: false }, () => resolve({ opened: true, browser, url }))
      // 浏览器一般不会退出，不等回调
      setTimeout(() => resolve({ opened: true, browser, url }), 1500)
    } catch (e) {
      resolve({ opened: false, reason: String(e?.message || e) })
    }
  })
}

async function probeVideo(file) {
  const info = { path: file, sizeBytes: 0, ext: extname(file).toLowerCase(), durationSec: null, width: null, height: null, ffprobe: false }
  try { info.sizeBytes = statSync(file).size } catch { /* ignore */ }
  // 用系统 ffprobe（有就填时长/分辨率，没有就算了）
  await new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,duration', '-of', 'json', file], { timeout: 15000 }, (err, stdout) => {
      if (!err && stdout) {
        try {
          const j = JSON.parse(stdout)
          const s = (j.streams || [])[0] || {}
          info.width = s.width ?? null
          info.height = s.height ?? null
          info.durationSec = s.duration ? Number(s.duration) : null
          info.ffprobe = true
        } catch { /* ignore */ }
      }
      resolve()
    })
  })
  return info
}

export function registerDouyinTools(tool) {
  tool({
    name: 'companion_douyin_setup',
    description: '配置抖音：保存登录 Cookie（从浏览器 F12 → Network → 任意 douyin.com 请求 → Request Headers → Cookie 整行复制）、或指定 Cookie 文件路径 / 浏览器路径 / 发布目录。Cookie 只存在本机，不进仓库。',
    parameters: {
      type: 'object',
      properties: {
        cookie: { type: 'string', description: '整行 Cookie 字符串（会写到 cookieFile，权限 600）' },
        cookieFile: { type: 'string', description: '改动 Cookie 文件位置' },
        browser: { type: 'string', description: '浏览器可执行文件路径' },
        publishDir: { type: 'string', description: '发布工作目录' },
        dailyReplyLimit: { type: 'number', description: '每天最多回复/评论几条' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const patch = { douyin: {} }
      for (const k of ['cookieFile', 'browser', 'publishDir', 'dailyReplyLimit']) {
        if (args?.[k] !== undefined) patch.douyin[k] = args[k]
      }
      const next = Object.keys(patch.douyin).length ? writeConfig(patch) : readConfig()

      let cookieSaved = false
      if (args?.cookie) {
        const file = expandPath(next.douyin.cookieFile)
        mkdirSync(join(file, '..'), { recursive: true })
        writeFileSync(file, String(args.cookie).trim() + '\n', { encoding: 'utf8', mode: 0o600 })
        cookieSaved = true
      }
      const cookieFile = expandPath(next.douyin.cookieFile)
      return {
        ok: true,
        configFile: CONFIG_PATH,
        douyin: next.douyin,
        cookieFile,
        cookiePresent: existsSync(cookieFile),
        cookieSaved,
        note: cookieSaved ? 'Cookie 已保存（只在本机，别提交到 git）' : '还没保存 Cookie：可以传 cookie 参数，或手动写到 cookieFile',
      }
    },
  })

  tool({
    name: 'companion_douyin_acknowledge',
    description: '确认已知晓抖音自动化的风险（写文件 + 时间戳）。发布/回复类工具在没有确认前一律拒绝执行。',
    parameters: {
      type: 'object',
      properties: { confirm: { type: 'boolean', description: '必须显式传 true' } },
      required: ['confirm'],
      additionalProperties: false,
    },
    async execute(args) {
      if (args?.confirm !== true) {
        return { ok: false, risks: RISK_POINTS, note: '把 confirm 传 true 表示你已阅读并接受这些风险' }
      }
      const cfg = readConfig()
      ensureBase()
      const ackFile = expandPath(cfg.douyin.ackFile)
      mkdirSync(join(ackFile, '..'), { recursive: true })
      const payload = { version: RISK_VERSION, confirmedAt: new Date().toISOString(), points: RISK_POINTS }
      writeFileSync(ackFile, JSON.stringify(payload, null, 2) + '\n', 'utf8')
      return { ok: true, ackFile, ...payload }
    },
  })

  tool({
    name: 'companion_douyin_doctor',
    description: '抖音能力体检：Cookie 在不在、风险确认做了没、浏览器找没找到、今天的回复配额还剩多少、发布目录在哪。动手前先调它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const cfg = readConfig()
      const cookieFile = expandPath(cfg.douyin.cookieFile)
      const ackFile = expandPath(cfg.douyin.ackFile)
      const browser = findBrowser(cfg)
      const quota = readQuota()
      const used = Number(quota[today()] || 0)
      const limit = Number(cfg.douyin.dailyReplyLimit || 5)
      let ack = null
      try { ack = JSON.parse(readFileSync(ackFile, 'utf8')) } catch { ack = null }
      let next
      if (!existsSync(cookieFile)) next = { action: 'companion_douyin_setup', why: '还没有登录 Cookie' }
      else if (!ack) next = { action: 'companion_douyin_acknowledge', why: '还没做风险确认（写入类操作需要）' }
      else if (!browser) next = { action: 'companion_douyin_setup', why: '没找到浏览器，可用 browser 参数指定' }
      else next = { action: 'done', why: '可以只读查数据 / 准备发布 / 准备回复' }
      return {
        cookieFile,
        cookiePresent: existsSync(cookieFile),
        ack: ack ? { version: ack.version, confirmedAt: ack.confirmedAt } : null,
        browser: browser || null,
        publishDir: expandPath(cfg.douyin.publishDir),
        quota: { date: today(), used, limit, remaining: Math.max(0, limit - used) },
        next,
      }
    },
  })

  tool({
    name: 'companion_douyin_stats',
    description: '只读：查指定作品的公开数据（点赞/评论/分享数、标题）。用公开接口，不需要登录，也不会触发写入。',
    parameters: {
      type: 'object',
      properties: {
        awemeIds: { type: 'array', items: { type: 'string' }, description: '作品 id 列表（从分享链接里取 /video/<id> 那段）' },
      },
      required: ['awemeIds'],
      additionalProperties: false,
    },
    async execute(args) {
      const ids = (args?.awemeIds || []).map(String).filter(Boolean).slice(0, 20)
      if (!ids.length) return { ok: false, error: '给一个 awemeIds 列表' }
      const out = []
      for (const id of ids) {
        const url = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${encodeURIComponent(id)}`
        try {
          const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) })
          const text = await r.text()
          let j = null
          try { j = JSON.parse(text) } catch { j = null }
          const item = j?.item_list?.[0]
          if (!item) { out.push({ id, ok: false, status: r.status, note: '接口没返回数据（可能已加签名/被限制），改用浏览器看' }); continue }
          out.push({
            id,
            ok: true,
            desc: String(item.desc || '').slice(0, 120),
            stats: {
              digg: item.statistics?.digg_count ?? null,
              comment: item.statistics?.comment_count ?? null,
              share: item.statistics?.share_count ?? null,
              play: item.statistics?.play_count ?? null,
            },
          })
        } catch (e) {
          out.push({ id, ok: false, error: String(e?.message || e) })
        }
      }
      return { ok: out.some((x) => x.ok), results: out }
    },
  })

  tool({
    name: 'companion_douyin_publish',
    description: '准备发布一条视频：检查文件（大小/时长/分辨率）、拷到发布目录并写 metadata.json，然后用系统浏览器打开抖音创作者中心，最后一步由你确认上传。需要先做风险确认。',
    parameters: {
      type: 'object',
      properties: {
        video: { type: 'string', description: '本地视频绝对路径（mp4 最佳）' },
        title: { type: 'string', description: '标题/文案（可含话题）' },
        tags: { type: 'array', items: { type: 'string' }, description: '话题标签（不带 # 号也行）' },
        openBrowser: { type: 'boolean', description: '是否立刻打开创作者中心（默认 true）' },
      },
      required: ['video'],
      additionalProperties: false,
    },
    async execute(args) {
      const cfg = readConfig()
      const ackFile = expandPath(cfg.douyin.ackFile)
      if (!existsSync(ackFile)) return { ok: false, error: '还没做风险确认：先 companion_douyin_acknowledge confirm=true' }
      const src = String(args?.video || '')
      if (!src || !existsSync(src)) return { ok: false, error: `视频不存在：${src}` }
      const info = await probeVideo(src)
      const warnings = []
      if (info.ext !== '.mp4') warnings.push('不是 mp4，抖音更建议 mp4')
      if (info.sizeBytes > 500 * 1024 * 1024) warnings.push('超过 500MB，可能传不上去')
      if (info.durationSec !== null && info.durationSec > 180) warnings.push('超过 3 分钟，短视频建议压到 60 秒内')
      if (info.width && info.height && info.height <= info.width) warnings.push('这是横屏/方形，抖音竖屏（高>宽）表现更好')

      const publishDir = expandPath(cfg.douyin.publishDir)
      mkdirSync(publishDir, { recursive: true })
      const dst = join(publishDir, basename(src))
      try {
        copyFileSync(src, dst)
      } catch (e) { warnings.push(`拷贝失败（可直接用原路径）：${String(e?.message || e)}`) }

      const meta = {
        preparedAt: new Date().toISOString(),
        video: dst,
        sourceVideo: src,
        title: String(args?.title || ''),
        tags: (args?.tags || []).map((t) => String(t).replace(/^#/, '')),
        probe: info,
        warnings,
      }
      writeFileSync(join(publishDir, 'metadata.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8')

      let opened = { opened: false, reason: 'openBrowser=false' }
      if (args?.openBrowser !== false) {
        opened = await openWithBrowser(findBrowser(cfg), 'https://creator.douyin.com/creator-micro/content/upload')
      }
      return {
        ok: true,
        metadata: join(publishDir, 'metadata.json'),
        video: dst,
        probe: info,
        warnings,
        opened,
        checklist: [
          '创作者中心已打开：点「上传视频」，选 ' + dst,
          '把 metadata.json 里的 title 粘进文案框，tags 逐个加对应话题',
          '封面自己挑一帧（竖屏视频选人物/大字清晰的那帧）',
          '发布前再确认一遍合规（音乐版权、画面内容）',
        ],
        note: '本工具不做自动上传：抖音上传接口要签名 + 二次风控，硬绕容易封号。最后一步交给你。',
      }
    },
  })

  tool({
    name: 'companion_douyin_reply',
    description: '准备回复评论：检查配额（每天上限）、记录用量，然后打开对应视频页并把要发的话返回给你，由你粘贴发送。需要先做风险确认。',
    parameters: {
      type: 'object',
      properties: {
        awemeId: { type: 'string', description: '作品 id（打开页面用）' },
        text: { type: 'string', description: '要回复的内容（≤ 200 字）' },
        openBrowser: { type: 'boolean', description: '是否打开视频页（默认 true）' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    async execute(args) {
      const cfg = readConfig()
      const ackFile = expandPath(cfg.douyin.ackFile)
      if (!existsSync(ackFile)) return { ok: false, error: '还没做风险确认：先 companion_douyin_acknowledge confirm=true' }
      const text = String(args?.text || '').slice(0, 200)
      if (!text) return { ok: false, error: 'text 不能为空' }
      const limit = Number(cfg.douyin.dailyReplyLimit || 5)
      const quota = readQuota()
      const key = today()
      const used = Number(quota[key] || 0)
      if (used >= limit) {
        return { ok: false, error: `今天的回复配额用完了（${used}/${limit}），明天再说，别硬刷`, quota: { date: key, used, limit } }
      }
      quota[key] = used + 1
      writeQuota(quota)

      let opened = { opened: false, reason: 'openBrowser=false 或没给 awemeId' }
      if (args?.openBrowser !== false && args?.awemeId) {
        opened = await openWithBrowser(findBrowser(cfg), `https://www.douyin.com/video/${encodeURIComponent(String(args.awemeId))}`)
      }
      return {
        ok: true,
        text,
        quota: { date: key, used: quota[key], limit, remaining: Math.max(0, limit - quota[key]) },
        opened,
        note: '把 text 粘进评论框发送即可。本工具不伪造签名自动发：那样最容易触发风控。',
      }
    },
  })

  tool({
    name: 'companion_douyin_risks',
    description: '列出抖音自动化的风险清单（不写文件、不改配置），用于向用户解释边界。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      return { version: RISK_VERSION, points: RISK_POINTS }
    },
  })
}
