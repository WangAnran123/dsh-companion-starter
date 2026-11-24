/**
 * capabilities-video.js —— 五套视频能力（skill 形态）的检测与安装
 * ============================================================================
 * 这五个不是 npm 包，是「Agent Skill」：装到 ~/.agents/skills 后，DSH 把它们当技能加载，
 * 模型按各自的 SKILL.md 干活。所以本插件不 vendored 它们，只负责：
 *   ① 检测在不在（companion_video_skills）
 *   ② 缺的一键装（companion_video_install，走官方 skills CLI）
 * ============================================================================
 */
import { existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { spawn } from 'node:child_process'

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

export function registerVideoSkillTools(tool) {
  tool({
    name: 'companion_video_skills',
    description: '检查五套视频能力（HyperFrames / Remotion / Shortcraft / a2e / Talkcraft）是否已装到 ~/.agents/skills：哪些在、哪些缺、各自能干什么。做视频前先调它，缺的用 companion_video_install 装。',
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
}
