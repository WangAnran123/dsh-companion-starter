/**
 * capabilities-qq.js —— QQ 通道：发文件 / 发文字 / 体检
 * ============================================================================
 * 原理（和 AstrBot 的 file_push 插件配合）：
 *   插件每 5 秒扫一次「投递箱」目录里的 *.send 文件；
 *   文件第一行 = 要发的本地文件路径，第二行 = 说明文字。
 *   所以本模块只负责往投递箱里丢正确格式的 marker，发送由 AstrBot 以机器人身份完成。
 *   —— 这样不需要 AstrBot 的 HTTP API 鉴权，也不会把登录态搞掉。
 * ============================================================================
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { readConfig, writeConfig, expandPath, CONFIG_PATH } from './companion-config.js'

/** 自动探测 AstrBot 实例里的 plugins 目录 */
export function findAstrbotPluginsDir() {
  const home = homedir()
  const roots = [
    join(home, '.astrbot_launcher', 'instances'),
    join(home, '.astrbot', 'instances'),
    join(home, 'astrbot'),
  ]
  const found = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    let dirs = []
    try { dirs = readdirSync(root) } catch { continue }
    for (const d of dirs) {
      const p = join(root, d, 'core', 'data', 'plugins')
      if (existsSync(p)) found.push(p)
      const p2 = join(root, d, 'data', 'plugins')
      if (existsSync(p2)) found.push(p2)
    }
    if (existsSync(join(root, 'data', 'plugins'))) found.push(join(root, 'data', 'plugins'))
  }
  return found
}

function pickPluginsDir(cfg) {
  const configured = expandPath(cfg.qq.astrbotPluginsDir)
  if (configured && existsSync(configured)) return configured
  return findAstrbotPluginsDir()[0] || ''
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${String(d.getMilliseconds()).padStart(3, '0')}`
}

export function registerQqTools(tool) {
  tool({
    name: 'companion_qq_status',
    description: 'QQ 通道体检：AstrBot 实例在哪、两个官方插件（语音推送 / 文件投递）装了没、投递箱有多少条待发/已发。想给用户发东西前先调它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const cfg = readConfig()
      const dir = pickPluginsDir(cfg)
      const outbox = expandPath(cfg.qq.outbox)
      let pending = 0
      let sent = 0
      try {
        for (const f of readdirSync(outbox)) {
          if (f.endsWith('.send')) pending += 1
          else if (f.endsWith('.sent')) sent += 1
        }
      } catch { /* 投递箱还没建 */ }
      const plugins = ['astrbot_plugin_file_push', 'astrbot_plugin_breeze_tts']
      const installed = dir ? plugins.filter((n) => existsSync(join(dir, n))) : []
      let next
      if (!dir) next = { action: 'manual', why: '没检测到 AstrBot 实例：QQ 通道需要先装 AstrBot（只想桌面语音可以跳过）' }
      else if (!installed.includes('astrbot_plugin_file_push')) next = { action: 'companion_install_qq', why: '还缺文件投递插件' }
      else if (!existsSync(outbox)) next = { action: 'companion_qq_send', why: '投递箱还没建，第一次发送会自动创建' }
      else next = { action: 'done', why: '通道就绪：可以用 companion_qq_send 发文字/文件' }

      return {
        astrbotPluginsDir: dir || null,
        detectedDirs: findAstrbotPluginsDir(),
        installed,
        outbox: { path: outbox, pending, sent },
        configFile: CONFIG_PATH,
        next,
      }
    },
  })

  tool({
    name: 'companion_qq_send',
    description: '通过 AstrBot 以机器人身份给用户 QQ 发消息：可以只发文字，也可以带一个文件（视频/图片/文档都行，图片会按图片发）。原理是往投递箱丢 marker，由 AstrBot 插件在 5 秒内发出。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '附带说明文字（可留空）' },
        file: { type: 'string', description: '要发的本地文件绝对路径（可留空 = 只发文字）' },
        caption: { type: 'string', description: '给文件配的一句话（等价于 text，留一个就行）' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const cfg = readConfig()
      const dir = pickPluginsDir(cfg)
      if (!dir) return { ok: false, error: '没检测到 AstrBot 实例：QQ 通道不可用（先装 AstrBot，或只用桌面语音）' }
      if (!existsSync(join(dir, 'astrbot_plugin_file_push'))) {
        return { ok: false, error: `AstrBot 里没有文件投递插件，请先运行 companion_install_qq（检测到的目录：${dir}）` }
      }
      const text = String(args?.text ?? args?.caption ?? '').trim()
      const file = args?.file ? String(args.file) : ''
      if (!text && !file) return { ok: false, error: '至少要给 text 或 file 其中一个' }
      if (file && !existsSync(file)) return { ok: false, error: `文件不存在：${file}` }

      const outbox = expandPath(cfg.qq.outbox)
      mkdirSync(outbox, { recursive: true })
      const marker = join(outbox, `qq-${stamp()}.send`)
      // 只有文件时，第一行写文件路径，第二行写说明；纯文字时第一行也可以是文字（插件会当成说明再发）
      const lines = file ? [file, text] : [text, text]
      writeFileSync(marker, lines.join('\n'), 'utf8')
      return {
        ok: true,
        queued: marker,
        kind: file ? 'file' : 'text',
        note: '已投递，AstrBot 插件会在 5 秒内发送（可在 companion_qq_status 里看 pending 变化）',
      }
    },
  })

  tool({
    name: 'companion_qq_configure',
    description: '设置 QQ 通道参数：AstrBot 插件目录、投递箱目录。留空则保持原值或自动探测。',
    parameters: {
      type: 'object',
      properties: {
        astrbotPluginsDir: { type: 'string', description: 'AstrBot 的 plugins 目录绝对路径' },
        outbox: { type: 'string', description: '投递箱目录（默认 ~/.dsh/shared/publish/outbox）' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const patch = { qq: {} }
      if (args?.astrbotPluginsDir) patch.qq.astrbotPluginsDir = String(args.astrbotPluginsDir)
      if (args?.outbox) patch.qq.outbox = String(args.outbox)
      if (!Object.keys(patch.qq).length) return { ok: false, error: '没有要改的字段' }
      const next = writeConfig(patch)
      return { ok: true, configFile: CONFIG_PATH, qq: next.qq }
    },
  })
}
