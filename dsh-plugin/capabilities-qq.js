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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
      const plugins = ['astrbot_plugin_file_push', 'astrbot_plugin_breeze_tts', 'astrbot_plugin_qq_inbox']
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

  // ── 引导式装机：一步一步把 QQ 通道配起来 ─────────────────────────────
  tool({
    name: 'companion_qq_setup_wizard',
    description: '【QQ 装机向导】一步一步把 QQ 通道配起来：检测 AstrBot → 确认实例目录 → 装插件 → 填会话 → 发测试消息。不带参数调用就返回「现在卡在第几步、下一步该问用户什么」。',
    parameters: {
      type: 'object',
      properties: {
        step: { type: 'string', description: 'detect / configure / install / session / test / status（留空=看当前状态）' },
        instanceDir: { type: 'string', description: 'step=configure 时用：AstrBot 的 core/data/plugins 目录' },
        friendUserId: { type: 'string', description: 'step=session 时用：对方 QQ 号（会话 id 会自动拼成 qq:FriendMessage:<号>）' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const cfg = readConfig()
      const dir = pickPluginsDir(cfg)
      const wantStep = args?.step ? String(args.step) : ''
      const progressed = { ...(cfg.qq?.wizard || {}) }

      // --- detect：找 AstrBot ---
      const detected = findAstrbotPluginsDir()
      if (wantStep === 'detect' || (!wantStep && !dir)) {
        if (!detected.length) {
          progressed.step = 'detect'
          writeConfig({ qq: { wizard: progressed } })
          return {
            step: 'detect',
            done: false,
            question: '还没检测到 AstrBot。要不要我先给你三条安装步骤？（装好后回来我再自动检测）',
            instructions: [
              '1. 去 AstrBot 官方 Release 下 Windows 版（或 Docker）',
              '2. 首次启动扫码登录 QQ —— 强烈建议用小号，主号有封号风险',
              '3. 打开 WebUI（通常 http://127.0.0.1:6185），记下实例目录：<用户>/.astrbot_launcher/instances/<实例ID>/',
              '4. 装好回来告诉我，我继续',
            ],
            next: { action: 'companion_qq_setup_wizard', args: { step: 'detect' }, why: '装好 AstrBot 后再跑一次检测' },
          }
        }
        progressed.step = 'configure'
        writeConfig({ qq: { wizard: progressed } })
        return {
          step: 'configure',
          done: false,
          detectedDirs: detected,
          question: `检测到 ${detected.length} 个 AstrBot 实例，用哪个？确认后我带 instanceDir 调 configure`,
          next: { action: 'companion_qq_setup_wizard', args: { step: 'configure', instanceDir: detected[0] } },
        }
      }

      // --- configure：写入实例目录 ---
      if (wantStep === 'configure') {
        const target = String(args?.instanceDir || detected[0] || '')
        if (!target) return { ok: false, error: '没给 instanceDir，也没检测到实例' }
        if (!existsSync(target)) return { ok: false, error: `目录不存在：${target}` }
        const next = writeConfig({ qq: { astrbotPluginsDir: target, wizard: { ...progressed, step: 'install' } } })
        return {
          step: 'install',
          done: false,
          configFile: CONFIG_PATH,
          astrbotPluginsDir: next.qq.astrbotPluginsDir,
          question: '目录已记住。接下来把三个插件（语音 / 文件投递 / 收件箱）拷进去？',
          next: { action: 'companion_install_qq', why: '拷完重启 AstrBot 生效' },
        }
      }

      // --- install：交给 companion_install_qq，这里只检查 ---
      if (wantStep === 'install') {
        const target = dir || detected[0] || ''
        if (!target) return { ok: false, error: '还没有实例目录：先跑 step=configure' }
        const need = ['astrbot_plugin_file_push', 'astrbot_plugin_qq_inbox']
        const missing = need.filter((n) => !existsSync(join(target, n)))
        if (missing.length) {
          return {
            step: 'install',
            done: false,
            missing,
            next: { action: 'companion_install_qq', args: { pluginDir: target }, why: `还缺：${missing.join(', ')}` },
          }
        }
        writeConfig({ qq: { wizard: { ...progressed, step: 'session' } } })
        return {
          step: 'session',
          done: false,
          installed: need,
          question: '插件到位了。现在告诉我：机器人要发给谁？（对方 QQ 号，我拼成 qq:FriendMessage:<号>）',
          next: { action: 'companion_qq_setup_wizard', args: { step: 'session', friendUserId: '<对方QQ号>' } },
        }
      }

      // --- session：填会话 id（同时写进我们自己的配置 + 提示 AstrBot 侧的配置） ---
      if (wantStep === 'session') {
        const uid = String(args?.friendUserId || '').trim()
        if (!uid) return { ok: false, error: '需要 friendUserId（对方 QQ 号）' }
        const session = /^qq:/.test(uid) ? uid : `qq:FriendMessage:${uid}`
        const next = writeConfig({ qq: { friendUserId: uid, session, wizard: { ...progressed, step: 'test' } } })
        const target = dir || detected[0] || ''
        const pluginCfg = target ? join(target, 'astrbot_plugin_file_push', '_conf.json') : null
        return {
          step: 'test',
          done: false,
          session,
          config: next.qq,
          astrbotSide: [
            `打开 AstrBot WebUI → 插件管理 → 文件投递箱，把「目标会话」填成：${session}`,
            '「投递箱目录」保持默认 ~/.dsh/shared/publish/outbox 即可',
            '语音（可选）：服务提供商 → 添加 TTS，type=breeze_tts_api，voice_id 填你在 Breeze 捏的音色，api_key_file 指向你的 key 文件',
            `（我们也会尝试把 session 写进 ${pluginCfg || '插件配置'}，但以 WebUI 里看到的为准）`,
          ],
          next: { action: 'companion_qq_setup_wizard', args: { step: 'test' }, why: '然后发一条测试消息验证通道' },
        }
      }

      // --- test / status ---
      if (wantStep === 'test') {
        const target = dir || detected[0] || ''
        const session = cfg.qq?.session || (cfg.qq?.friendUserId ? `qq:FriendMessage:${cfg.qq.friendUserId}` : '')
        if (!target) return { ok: false, error: '没有 AstrBot 实例目录' }
        if (!session) return { ok: false, error: '还没填会话 id：先跑 step=session' }
        if (!existsSync(join(target, 'astrbot_plugin_file_push'))) {
          return { ok: false, error: '文件投递插件不在，先跑 companion_install_qq' }
        }
        const outbox = expandPath(cfg.qq.outbox)
        mkdirSync(outbox, { recursive: true })
        const marker = join(outbox, `wizard-test-${stamp()}.send`)
        writeFileSync(marker, `测试通道：如果你在 QQ 看到这条，说明通道通了\n`, 'utf8')
        writeConfig({ qq: { wizard: { ...progressed, step: 'done', testedAt: new Date().toISOString() } } })
        return {
          step: 'done',
          done: true,
          queued: marker,
          session,
          message: '已投递测试消息，AstrBot 5 秒内会发出。收到就说明整条链路通了；没收到看我下面的排查项。',
          troubleshoot: [
            `AstrBot 里 file_push 的「目标会话」是不是 ${session}`,
            `投递箱目录两边要一致：我们写 ${outbox}`,
            'AstrBot 装完插件有没有重启（日志里应有 [file_push] 投递箱已启动）',
            'QQ 号填错了也会静默失败：会话 id 里必须是你的 QQ 号，不是昵称',
          ],
        }
      }

      // 不带参数：报当前状态
      const need = ['astrbot_plugin_file_push', 'astrbot_plugin_qq_inbox']
      const missing = dir ? need.filter((n) => !existsSync(join(dir, n))) : need
      const configured = Boolean(cfg.qq?.astrbotPluginsDir)
      const realStep = !dir ? 'detect' : (!configured ? 'configure' : (missing.length ? 'install' : (!cfg.qq?.session ? 'session' : 'test')))
      return {
        step: realStep,
        astrbotPluginsDir: dir || null,
        detectedDirs: detected,
        missingPlugins: missing,
        session: cfg.qq?.session || '',
        testedAt: cfg.qq?.wizard?.testedAt || null,
        next: !dir
          ? { action: 'companion_qq_setup_wizard', args: { step: 'detect' } }
          : missing.length
            ? { action: 'companion_install_qq', args: { pluginDir: dir } }
            : !cfg.qq?.session
              ? { action: 'companion_qq_setup_wizard', args: { step: 'session', friendUserId: '<对方QQ号>' } }
              : { action: 'companion_qq_setup_wizard', args: { step: 'test' } },
      }
    },
  })

  // ── 表情包：从目录里挑一张发出去 ───────────────────────────────────
  tool({
    name: 'companion_qq_sticker',
    description: '发一张表情包：从表情包目录（默认 ~/.dsh/shared/stickers，支持子目录当分类）里挑一张图片，配一句话发到 QQ。也可以只列不发送。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '按文件名包含匹配（可留空 = 随机挑）' },
        tag: { type: 'string', description: '子目录名当分类（如 happy / angry）' },
        dir: { type: 'string', description: '自定义表情包目录' },
        caption: { type: 'string', description: '随图发的一句话（可留空）' },
        dryRun: { type: 'boolean', description: '只列出有哪些，不发送' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const cfg = readConfig()
      const baseDir = expandPath(String(args?.dir || cfg.qq?.stickerDir || '~/.dsh/shared/stickers'))
      if (!existsSync(baseDir)) {
        return {
          ok: false,
          error: `表情包目录不存在：${baseDir}`,
          howTo: '把表情包图片（png/jpg/gif/webp）丢进这个目录，子目录当分类；也可以用 dir 参数指向你自己的目录',
        }
      }
      const exts = ['.png', '.jpg', '.jpeg', '.gif', '.webp']
      const walk = (d) => {
        const out = []
        for (const f of readdirSync(d)) {
          const p = join(d, f)
          let st
          try { st = statSync(p) } catch { continue }
          if (st.isDirectory()) out.push(...walk(p))
          else if (exts.includes(f.toLowerCase().slice(f.lastIndexOf('.')))) out.push(p)
        }
        return out
      }
      let all = walk(baseDir)
      if (args?.tag) {
        const tag = String(args.tag).toLowerCase()
        all = all.filter((p) => p.toLowerCase().split(/[\\/]/).slice(0, -1).includes(tag))
      }
      if (args?.name) all = all.filter((p) => p.toLowerCase().includes(String(args.name).toLowerCase()))
      if (!all.length) return { ok: false, error: '没匹配到表情包', dir: baseDir, hint: '试试不带 name/tag 先看起来有什么' }
      if (args?.dryRun) {
        return { ok: true, dir: baseDir, count: all.length, files: all.slice(0, 40).map((p) => p.slice(baseDir.length + 1)) }
      }
      const target = all[Math.floor(Math.random() * all.length)]
      const sendTool = null // 复用 companion_qq_send 的逻辑：直接写投递箱
      const pluginDir = pickPluginsDir(cfg)
      if (!pluginDir || !existsSync(join(pluginDir, 'astrbot_plugin_file_push'))) {
        return { ok: false, error: 'QQ 通道还没通：先跑 companion_qq_setup_wizard（或 companion_install_qq）' }
      }
      const outbox = expandPath(cfg.qq.outbox)
      mkdirSync(outbox, { recursive: true })
      const marker = join(outbox, `sticker-${stamp()}.send`)
      writeFileSync(marker, [target, String(args?.caption || '')].join('\n'), 'utf8')
      return { ok: true, sent: target, queued: marker, note: '表情包按图片发出去（QQ 里显示为图片消息，不是原生表情）' }
    },
  })

  // ── 收件箱：读别人发来的图片/语音/视频 ─────────────────────────────
  tool({
    name: 'companion_qq_inbox',
    description: '【读 QQ 消息里的媒体】列出别人发来的图片/语音/视频/文件（由 astrbot_plugin_qq_inbox 插件落盘）。返回本地路径，图片可以直接看图、视频可以抽帧分析。',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '返回最近几条（默认 5）' },
        kind: { type: 'string', description: '只列某类：image / voice / video / file' },
        dir: { type: 'string', description: '自定义收件箱目录' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const cfg = readConfig()
      const box = expandPath(String(args?.dir || cfg.qq?.inboxDir || '~/.dsh/shared/inbox'))
      const index = join(box, 'index.jsonl')
      if (!existsSync(index)) {
        return {
          ok: true,
          empty: true,
          inbox: box,
          hint: '还没有收到过媒体。确认 AstrBot 里装了 astrbot_plugin_qq_inbox 插件并重启过；然后让别人给你发张图试试。',
        }
      }
      const lines = readFileSync(index, 'utf8').split(/\r?\n/).filter(Boolean)
      const kind = args?.kind ? String(args.kind).toLowerCase() : ''
      const limit = Math.max(1, Math.min(50, Number(args?.limit || 5)))
      const entries = []
      for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
        let e
        try { e = JSON.parse(lines[i]) } catch { continue }
        if (kind) e.files = (e.files || []).filter((f) => f.kind === kind)
        if (kind && !e.files.length) continue
        e.exists = (e.files || []).every((f) => existsSync(f.path))
        entries.push(e)
      }
      return {
        ok: true,
        inbox: box,
        total: lines.length,
        returned: entries.length,
        entries,
        note: '这些是本地路径：图片可用 read_image / 视觉模型看，视频可先用 ffmpeg 抽帧',
      }
    },
  })
}
