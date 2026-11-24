/**
 * capabilities-video.js —— 五套视频能力（skill 形态）的检测与安装
 * ============================================================================
 * 这五个不是 npm 包，是「Agent Skill」：装到 ~/.agents/skills 后，DSH 把它们当技能加载，
 * 模型按各自的 SKILL.md 干活。所以本插件不 vendored 它们，只负责：
 *   ① 检测在不在（companion_video_skills）
 *   ② 缺的一键装（companion_video_install，走官方 skills CLI）
 * ============================================================================
 */
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

/** 特效库地址（被墙时由 companion_video_registry_fix 换成 gh-proxy 前缀） */
export const VIDEO_REGISTRY_BASE = 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry'

export const VIDEO_ENGINES = [
  {
    key: 'hyperframes',
    label: 'HyperFrames（HTML 渲染成片）',
    repo: 'heygen-com/hyperframes',
    dirs: ['hyperframes', 'hyperframes-cli', 'hyperframes-registry', 'media-use', 'reverse-any-video', 'style-sampling'],
    note: 'companion_video_make 直接用它出片',
  },
  { key: 'remotion', label: 'Remotion（React 代码出片）', repo: 'fl0-0wer/dsh-oil-ui', dirs: ['remotion'], note: '首次跑会装 Node 依赖' },
  { key: 'shotcraft', label: 'Shortcraft（真实页面 + 镜头卡）', repo: 'vincentwei1021/video-shotcraft', dirs: ['video-shotcraft'], note: '产品宣传片，基于 Remotion' },
  { key: 'a2e', label: 'a2e / anything2explainer（主题→科普片）', repo: 'vincentwei1021/anything2explainer', dirs: ['anything2explainer'], note: '带配音、字幕、进度条' },
  { key: 'talkcraft', label: 'Talkcraft（口播稿→电影感成片）', repo: 'vincentwei1021/video-talkcraft', dirs: ['video-talkcraft'], note: '字级时间戳 + SHOTBOOK 分镜' },
]

const skillsDir = () => join(homedir(), '.agents', 'skills')
const hasSkill = (d) => existsSync(join(skillsDir(), d))

function run(cmd, args, { cwd, timeout = 600_000 } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (e) {
      return resolve({ status: -1, stdout: '', stderr: String(e?.message || e) })
    }
    let stdout = ''
    let stderr = ''
    let done = false
    const timer = setTimeout(() => {
      if (done) return
      try { child.kill() } catch { /* ignore */ }
      done = true
      resolve({ status: -1, stdout, stderr: stderr + '\n[timeout]' })
    }, timeout)
    child.stdout?.on('data', (d) => { stdout += String(d) })
    child.stderr?.on('data', (d) => { stderr += String(d) })
    child.on('error', (e) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ status: -1, stdout, stderr: stderr + String(e?.message || e) })
    })
    child.on('close', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ status: code ?? -1, stdout, stderr })
    })
  })
}

function copyDir(src, dst) {
  mkdirSync(dst, { recursive: true })
  for (const f of readdirSync(src)) {
    const sp = join(src, f)
    if (statSync(sp).isDirectory()) copyDir(sp, join(dst, f))
    else copyFileSync(sp, join(dst, f))
  }
}

const tail = (s, n = 400) => (s && s.length > n ? '…' + s.slice(-n) : s || '')

/** 当前项目/全局的 registry 是不是已经切到代理（判断「特效库通不通」用） */
function registryViaProxy() {
  const cfgs = [join(process.cwd(), 'hyperframes.json'), join(homedir(), '.hyperframes', 'config.json')]
  for (const p of cfgs) {
    try {
      if (!existsSync(p)) continue
      const raw = readFileSync(p, 'utf8').replace(/^\uFEFF/, '')
      if (raw.includes('gh-proxy.com')) return true
    } catch { /* ignore */ }
  }
  return false
}

export function registerVideoSkillTools(tool) {
  tool({
    name: 'companion_video_skills',
    description: '检查五套视频能力（HyperFrames / Remotion / Shortcraft / a2e / Talkcraft）是否已装到 ~/.agents/skills：哪些在、哪些缺、各自能干什么。做视频前先调它，缺的用 companion_video_install 装；然后调 companion_video_library 拿现成素材（特效库块 + 音效库），素材库优先，缺了才手写。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const engines = VIDEO_ENGINES.map((e) => ({
        key: e.key,
        label: e.label,
        repo: e.repo,
        installed: e.dirs.every(hasSkill),
        found: e.dirs.filter(hasSkill),
        missing: e.dirs.filter((d) => !hasSkill(d)),
        note: e.note,
      }))
      const missing = engines.filter((e) => !e.installed).map((e) => e.key)
      return {
        skillsDir: skillsDir(),
        engines,
        ready: engines.filter((e) => e.installed).length,
        total: engines.length,
        next: missing.length
          ? { action: 'companion_video_install', why: '还缺 ' + missing.join(' / ') }
          : { action: 'done', why: '五套都在，可以开工' },
      }
    },
  })

  tool({
    name: 'companion_video_install',
    description: '安装缺失的视频能力 skill（官方 skills CLI：npx skills add <仓库> --agent * -y，装完复制到 ~/.agents/skills）。只装缺的；全都在就什么都不做。单个可能 30-90 秒。',
    parameters: {
      type: 'object',
      properties: {
        only: { type: 'array', items: { type: 'string' }, description: '只装这几个 key（hyperframes/remotion/shotcraft/a2e/talkcraft），留空=装全部缺的' },
      },
      additionalProperties: false,
    },
    async execute(args) {
      const wanted = Array.isArray(args?.only) && args.only.length ? args.only : null
      const todo = VIDEO_ENGINES.filter((e) => (wanted ? wanted.includes(e.key) : true)).filter((e) => !e.dirs.every(hasSkill))
      if (!todo.length) return { ok: true, installed: [], message: '没有缺失的，全部已就位' }

      const isWin = process.platform === 'win32'
      const npxArgs = (repo) => ['skills@1.9.0', 'add', repo, '--agent', '*', '-y']
      const workRoot = join(tmpdir(), 'companion-skill-install')
      try { mkdirSync(workRoot, { recursive: true }) } catch { /* ignore */ }
      const results = []

      for (const e of todo) {
        const cmd = isWin ? (process.env.ComSpec || 'cmd.exe') : 'npx'
        const cargs = isWin ? ['/c', 'npx', ...npxArgs(e.repo)] : npxArgs(e.repo)
        const r = await run(cmd, cargs, { cwd: workRoot })
        const copied = []
        const localSkills = join(workRoot, '.agents', 'skills')
        if (existsSync(localSkills)) {
          for (const d of readdirSync(localSkills)) {
            const dst = join(skillsDir(), d)
            if (existsSync(dst)) continue
            try { copyDir(join(localSkills, d), dst); copied.push(d) } catch { /* ignore */ }
          }
        }
        results.push({ key: e.key, repo: e.repo, exitCode: r.status, copied, ok: e.dirs.every(hasSkill), tail: tail(r.stdout + r.stderr) })
      }
      return { ok: results.every((x) => x.ok), results, note: 'skill 是给模型读的说明书；下次开新会话认得更全' }
    },
  })

  tool({
    name: 'companion_video_library',
    description:
      '【做视频第一步】盘点本机现成的素材库：HyperFrames 特效库（约 450 个动效块/组件）、media-use 音效库、调色 LUT 库。' +
      '规矩是「素材库优先」：先从这里拿现成块和音效，库里确实没有的才手写场景。返回每个库的位置、条目数、以及已验证可直接用的块名。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const skills = skillsDir()
      const home = homedir()

      // 1) 特效库：读本地缓存的 registry 清单（CLI 拉过一次就在这里）
      const registry = { base: VIDEO_REGISTRY_BASE, cachedManifests: 0, items: 0, viaProxy: registryViaProxy() }
      const cacheDirs = [
        join(home, '.hyperframes', 'cache'),
        join(home, '.cache', 'hyperframes', 'registry'),
      ]
      for (const dir of cacheDirs) {
        if (!existsSync(dir)) continue
        let files = []
        try { files = readdirSync(dir) } catch { continue }
        for (const f of files) {
          if (!f.endsWith('.json')) continue
          try {
            const j = JSON.parse(readFileSync(join(dir, f), 'utf8').replace(/^\uFEFF/, ''))
            const items = j?.data?.items ?? j?.items
            if (Array.isArray(items)) {
              registry.cachedManifests += 1
              registry.items = Math.max(registry.items, items.length)
            }
          } catch { /* ignore */ }
        }
      }

      // 2) media-use：音效 + LUT
      const sfxDir = join(skills, 'media-use', 'audio', 'assets', 'sfx')
      const sfx = existsSync(sfxDir)
        ? readdirSync(sfxDir).filter((f) => /\.(mp3|wav)$/i.test(f)).map((f) => f.replace(/\.(mp3|wav)$/i, ''))
        : []
      const lutFile = join(skills, 'media-use', 'luts', 'index.json')
      let luts = []
      if (existsSync(lutFile)) {
        try {
          const j = JSON.parse(readFileSync(lutFile, 'utf8'))
          luts = Array.isArray(j) ? j.map((x) => x.id ?? x.name) : Object.keys(j)
        } catch { /* ignore */ }
      }

      return {
        policy: '素材库优先：先拿现成块/音效，缺了再手写',
        registry: {
          ...registry,
          howTo: [
            'npx hyperframes catalog --query "<英文关键词>" --json  # 找块/组件',
            'npx hyperframes add <名字>                              # 装进项目 compositions/',
          ],
          verifiedBlocks: [
            'ai-chat-reveal（竖屏 1080×1920，聊天流式回答 + 结尾卡，变量：botName/userMessage/answer1-3/bullet1-3/ecHeadline/ecSub/ecCta/ecFooter）',
            'mk-specs-list（特性清单，可改 CONFIG.rows 列表；竖屏需改宽高与字号）',
            'mk-progress-stat（大数字 + 进度条统计卡）',
            'glass-hero（玻璃折射大标题，1920×1080）',
            'glitch（着色器故障转场）',
            'caption-kinetic-slam（组件：满屏单词砸屏，适合钩子）',
            'number-pop-in（组件：数字逐位 pop，可多实例化）',
          ],
          hungNotes:
            'GitHub raw 被墙时先跑 companion_video_registry_fix（会切到 gh-proxy），否则 catalog/add 会 ECONNRESET；' +
            'cd 里的 GSAP 走 jsdelivr 会 reset，装完把脚本换成本地 gsap 文件',
        },
        sfx: { dir: sfxDir, count: sfx.length, names: sfx },
        luts: { file: lutFile, count: luts.length, names: luts },
        next: registry.items > 0
          ? { action: 'catalog', why: '特效库清单已在本地，直接查关键词拿块' }
          : { action: 'companion_video_registry_fix', why: '还没有特效库清单：先接通代理，再跑一次 catalog' },
      }
    },
  })
}
