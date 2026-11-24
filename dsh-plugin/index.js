/**
 * dsh-companion-onboard —— 把「一个住在你电脑里的 AI 伙伴」一步步搭起来
 * ============================================================================
 * 设计意图（为什么要做成 DSH 插件）：
 *   用户装了 DSH，只想要「一个伙伴」，不想自己配插件、调人格。
 *   所以把「装什么 / 填什么 / 缺什么」做成一组工具：
 *     companion_status          现在到哪一步了、下一步做什么
 *     companion_init            建人格与记忆文件（不覆盖）
 *     companion_set_persona     逐节填人格（称呼/身份/说话方式/边界/偏好）
 *     companion_add_memory      往长期记忆追加一行
 *     companion_doctor          环境体检（Python/Node/浏览器/AstrBot/密钥）
 *     companion_install_qq      把两个 AstrBot 插件装进检测到的实例
 *   模型每次只调一个工具、问一个问题 ⇒ 天然就是「一步一步引导」。
 * ============================================================================
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { registerCapabilityTools } from './capabilities.js'
import { registerVideoSkillTools } from './capabilities-video.js'
import { registerRegistryFixTool } from './registry-fix.js'

export const name = 'companion-onboard'
export const inject = ['tools']

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATES = join(HERE, 'templates')
const ASTRBOT_BUNDLES = [join(HERE, 'astrbot-plugins'), join(HERE, '..', 'plugins', 'astrbot')].find((p) => existsSync(p)) || join(HERE, 'astrbot-plugins')
const BASE = process.env.DSH_COMPANION_DIR || join(homedir(), '.dsh', 'shared', 'companion')
const PERSONA = () => join(BASE, 'persona-core.md')
const MEMORY = () => join(BASE, 'memory.md')

const SECTIONS = ['称呼', '身份', '说话方式', '边界', '偏好']

const textOutput = {
  schema: { type: 'object', properties: {}, additionalProperties: true },
  render: (_args, value) => [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }],
}

const safe = (v) => {
  if (v === undefined || v === null) return null
  try { return JSON.parse(JSON.stringify(v)) } catch { return String(v) }
}

function readFileSyncSafe(p) {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

function readIf(p) {
  try { return readFileSync(p, 'utf8') } catch { return null }
}

/** 从 markdown 里抽出 ## 标题 → 内容 */
function parseSections(md) {
  const out = {}
  if (!md) return out
  const parts = md.split(/^## /m)
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n')
    const title = (nl === -1 ? part : part.slice(0, nl)).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1).trim()
    out[title] = body
  }
  return out
}

function filledSections(md) {
  const secs = parseSections(md)
  const filled = []
  const missing = []
  for (const s of SECTIONS) {
    const body = (secs[s] || '').replace(/<[^>]*>/g, '').trim()
    if (body && body.replace(/[-#*>\s]/g, '').length > 4) filled.push(s)
    else missing.push(s)
  }
  return { filled, missing }
}

function memoryCount(md) {
  if (!md) return 0
  return md.split('\n').filter((l) => /^\s*-\s*\[\d{4}-\d{2}-\d{2}\]\s*\[/.test(l)).length
}

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 8000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : String(stdout || '').trim())
    })
  })
}

function findAstrbotPluginDirs() {
  const roots = [
    join(homedir(), '.astrbot_launcher', 'instances'),
    join(homedir(), 'astrbot', 'instances'),
  ]
  const found = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    let names = []
    try { names = readdirSync(root) } catch { continue }
    for (const n of names) {
      const p = join(root, n, 'core', 'data', 'plugins')
      if (existsSync(p)) found.push(p)
    }
  }
  return found
}

function breezeKeyFile() {
  return process.env.BREEZE_KEY_FILE || join(homedir(), '.breeze', 'breeze_key.txt')
}

export function apply(ctx) {
  const tool = (spec) => ctx.tools.register({ ...spec, output: textOutput })

  // ── 1. 状态 / 下一步 ────────────────────────────────────────────────
  tool({
    name: 'companion_status',
    description: '查看「AI 伙伴」搭建到哪一步了：人格/记忆文件是否存在、哪些小节还空着、AstrBot 与插件是否就位，并给出下一步该做什么。开始引导、或用户问「还差什么」时先调它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const personaMd = readIf(PERSONA())
      const memoryMd = readIf(MEMORY())
      const { filled, missing } = filledSections(personaMd)
      const memCount = memoryCount(memoryMd)
      const pluginDirs = findAstrbotPluginDirs()
      const astrbot = pluginDirs.length > 0
      let installed = []
      if (astrbot) {
        installed = ['astrbot_plugin_breeze_tts', 'astrbot_plugin_file_push']
          .filter((n) => existsSync(join(pluginDirs[0], n)))
      }
      const keyOk = existsSync(breezeKeyFile())

      let next
      if (!personaMd) next = { action: 'companion_init', why: '还没有人格文件，先建模板' }
      else if (missing.length) next = { action: 'companion_set_persona', why: `人格还缺「${missing[0]}」`, section: missing[0] }
      else if (memCount === 0) next = { action: 'companion_add_memory', why: '还没有任何长期记忆，先记一条关于你的事' }
      else if (!astrbot) next = { action: 'manual', why: '没检测到 AstrBot（QQ 通道需要它），可选；不接 QQ 也可以只用桌面语音' }
      else if (installed.length < 2) next = { action: 'companion_install_qq', why: `还缺 QQ 插件 ${2 - installed.length} 个` }
      else if (!keyOk) next = { action: 'manual', why: `语音还没配 Key：建 ${breezeKeyFile()}，写一行 Breeze Key` }
      else next = { action: 'done', why: '基础链路齐了，可以开始把模板细节慢慢补完' }

      return safe({
        base: BASE,
        persona: { path: PERSONA(), exists: Boolean(personaMd), filled, missing },
        memory: { path: MEMORY(), exists: Boolean(memoryMd), count: memCount },
        qq: { astrbot, pluginDirs, installed, breezeKey: keyOk },
        next,
      })
    },
  })

  // ── 2. 初始化文件 ──────────────────────────────────────────────────
  tool({
    name: 'companion_init',
    description: '在伙伴目录里创建人格文件与记忆文件（已存在则跳过，绝不覆盖用户已填内容）。返回新建了哪些、跳过了哪些。',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: '伙伴数据目录，默认 ~/.dsh/shared/companion' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const base = args?.dir ? String(args.dir) : BASE
      mkdirSync(base, { recursive: true })
      const created = []
      const skipped = []
      const pairs = [
        [join(TEMPLATES, 'persona-core.md'), join(base, 'persona-core.md')],
        [join(TEMPLATES, 'memory.md'), join(base, 'memory.md')],
      ]
      for (const [src, dst] of pairs) {
        if (existsSync(dst)) { skipped.push(dst); continue }
        if (existsSync(src)) { copyFileSync(src, dst); created.push(dst) }
        else created.push(`(模板缺失) ${src}`)
      }
      return safe({ base, created, skipped })
    },
  })

  // ── 3. 逐节填人格 ──────────────────────────────────────────────────
  tool({
    name: 'companion_set_persona',
    description: '把某一节人格写进人格文件（替换该节内容，其余不动）。section 只能是：称呼 / 身份 / 说话方式 / 边界 / 偏好。一次只填一节，问完用户再填下一节。',
    parameters: {
      type: 'object',
      properties: {
        section: { type: 'string', enum: SECTIONS, description: '要写哪一节' },
        text: { type: 'string', description: '这一节的内容（markdown 要点，几行即可）' },
      },
      required: ['section', 'text'],
      additionalProperties: false,
    },
    async execute(args) {
      const section = String(args?.section || '')
      const text = String(args?.text || '').trim()
      if (!SECTIONS.includes(section)) return safe({ ok: false, error: `section 必须是：${SECTIONS.join(' / ')}` })
      if (!text) return safe({ ok: false, error: 'text 不能为空' })
      const p = PERSONA()
      if (!existsSync(p)) return safe({ ok: false, error: '人格文件还不存在，先调 companion_init' })

      const md = readFileSync(p, 'utf8')
      const lines = md.split('\n')
      const startIdx = lines.findIndex((l) => l.trim() === `## ${section}`)
      const body = text.split('\n').map((l) => (l.startsWith('-') || l.startsWith('#') ? l : `- ${l}`)).join('\n')

      let out
      if (startIdx === -1) {
        out = md.replace(/\s*$/, '\n') + `\n## ${section}\n\n${body}\n`
      } else {
        let endIdx = lines.length
        for (let i = startIdx + 1; i < lines.length; i++) {
          if (/^## /.test(lines[i])) { endIdx = i; break }
        }
        out = [...lines.slice(0, startIdx + 1), '', body, '', ...lines.slice(endIdx)].join('\n')
      }
      writeFileSync(p, out, 'utf8')
      const after = filledSections(out)
      return safe({ ok: true, path: p, section, filled: after.filled, missing: after.missing })
    },
  })

  // ── 4. 追加长期记忆 ────────────────────────────────────────────────
  tool({
    name: 'companion_add_memory',
    description: '往长期记忆追加一行：- [日期] [标签] 内容。标签建议用 事实 / 规矩 / 坑 / 能力 / 偏好。只记用户亲口说过或明确能看出来的事，别推测。',
    parameters: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: '标签，例如 事实 / 规矩 / 偏好' },
        text: { type: 'string', description: '要记的一句话' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    async execute(args) {
      const text = String(args?.text || '').trim()
      if (!text) return safe({ ok: false, error: 'text 不能为空' })
      const tag = String(args?.tag || '事实').trim()
      const p = MEMORY()
      if (!existsSync(p)) return safe({ ok: false, error: '记忆文件还不存在，先调 companion_init' })
      const day = new Date().toISOString().slice(0, 10)
      const line = `- [${day}] [${tag}] ${text}`
      const md = readFileSync(p, 'utf8')
      writeFileSync(p, md.replace(/\s*$/, '\n') + line + '\n', 'utf8')
      return safe({ ok: true, path: p, line, count: memoryCount(readFileSync(p, 'utf8')) })
    },
  })

  // ── 5. 环境体检 ────────────────────────────────────────────────────
  tool({
    name: 'companion_doctor',
    description: '环境体检：Python、Node、浏览器、AstrBot、语音 Key 逐项检查，红的项给出该怎么办。用户报「跑不起来」时先调它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const checks = []
      const py = (await run('python', ['--version'])) || (await run('py', ['--version']))
      checks.push({ item: 'Python', ok: Boolean(py), detail: py || '', fix: py ? '' : '装 Python 3.10+，安装时勾选 Add to PATH' })

      const node = await run('node', ['--version'])
      checks.push({ item: 'Node.js', ok: Boolean(node), detail: node || '', fix: node ? '' : '装 Node.js LTS' })

      const edge = [
        join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ].find((p) => existsSync(p))
      checks.push({ item: '浏览器', ok: Boolean(edge), detail: edge || '', fix: edge ? '' : '装 Edge 或 Chrome（消息通道用）' })

      const dirs = findAstrbotPluginDirs()
      checks.push({ item: 'AstrBot', ok: dirs.length > 0, detail: dirs[0] || '', fix: dirs.length ? '' : '按 docs 安装 AstrBot（只用桌面语音可以先跳过）' })

      const key = breezeKeyFile()
      checks.push({ item: '语音 Key', ok: existsSync(key), detail: key, fix: existsSync(key) ? '' : `建 ${key}，写一行 Breeze API Key` })

      return safe({ checks, allOk: checks.every((c) => c.ok) })
    },
  })

  // ── 6. 装 AstrBot 插件 ─────────────────────────────────────────────
  tool({
    name: 'companion_install_qq',
    description: '把随包附带的两个 AstrBot 插件（Breeze TTS、文件投递箱）拷进检测到的 AstrBot 实例插件目录。检测不到实例时明确报错，不瞎猜路径。',
    parameters: {
      type: 'object',
      properties: {
        pluginDir: { type: 'string', description: '可选：直接指定 AstrBot 的 data/plugins 目录' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const target = args?.pluginDir ? String(args.pluginDir) : findAstrbotPluginDirs()[0]
      if (!target) return safe({ ok: false, error: '没检测到 AstrBot 实例目录，请给 pluginDir（形如 ...\\instances\\<id>\\core\\data\\plugins）' })
      if (!existsSync(target)) return safe({ ok: false, error: `目录不存在：${target}` })

      const copied = []
      const failed = []
      let bundles = []
      try { bundles = readdirSync(ASTRBOT_BUNDLES) } catch { return safe({ ok: false, error: '包里没有 astrbot-plugins 目录' }) }

      for (const b of bundles) {
        const src = join(ASTRBOT_BUNDLES, b)
        try {
          if (!statSync(src).isDirectory()) continue
          // AstrBot 认目录名 = 插件 id：优先用 metadata.yaml 里的 name
          let id = b
          try {
            const meta = readFileSyncSafe(join(src, 'metadata.yaml'))
            const m = meta && meta.replace(/^\uFEFF/, '').match(/^name:\s*([A-Za-z0-9_.-]+)/m)
            if (m) id = m[1]
          } catch { /* 没有 metadata 就用目录名 */ }
          const dst = join(target, id)
          mkdirSync(dst, { recursive: true })
          for (const f of readdirSync(src)) {
            const sp = join(src, f)
            if (statSync(sp).isFile()) copyFileSync(sp, join(dst, f))
          }
          copied.push(dst)
        } catch (e) {
          failed.push({ bundle: b, error: String(e?.message || e) })
        }
      }
      return safe({ ok: failed.length === 0, target, copied, failed, note: '拷完后重启 AstrBot，日志里应出现 [breeze_tts] 已注册 与 [file_push] 投递箱已启动' })
    },
  })

  // 可选能力：Blender 渲染 / HyperFrames 出片
  registerCapabilityTools(tool)
  registerVideoSkillTools(tool)
  registerRegistryFixTool(tool)
}
