/**
 * capabilities.js —— 可选能力：Blender 渲染 / HyperFrames 出片
 * ============================================================================
 * 为什么单独一个文件：这两个能力依赖**外部软件**（Blender、HyperFrames CLI），
 * 不是装个插件就天生有的。所以它们要做三件事：
 *   ① 检测（找不到就明确说缺什么、去哪装），② 异步调用（绝不阻塞宿主事件循环），
 *   ③ 结果可验证（返回退出码、stderr 尾巴、产物路径）。
 * ============================================================================
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { homedir } from 'node:os'
import { spawn } from 'node:child_process'

const BLENDER_CANDIDATES = [
  process.env.BLENDER_EXE,
  'D:\\Blender\\blender-4.5.9-windows-x64\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe',
  'C:\\Program Files\\Blender Foundation\\Blender 4.4\\blender.exe',
  '/Applications/Blender.app/Contents/MacOS/Blender',
  '/usr/bin/blender',
].filter(Boolean)

function findBlender() {
  for (const p of BLENDER_CANDIDATES) {
    try { if (p && existsSync(p)) return p } catch { /* ignore */ }
  }
  // 兜底：扫 Blender Foundation 目录下任意版本
  try {
    const base = 'C:\\Program Files\\Blender Foundation'
    if (existsSync(base)) {
      for (const n of readdirSync(base)) {
        const exe = join(base, n, 'blender.exe')
        if (existsSync(exe)) return exe
      }
    }
  } catch { /* ignore */ }
  return null
}

function findHyperframesCli() {
  const cands = [
    process.env.HYPERFRAMES_CLI,
    join(homedir(), '.agents', 'skills', 'hyperframes', 'scripts', 'plugin-cli.mjs'),
    join(homedir(), '.claude', 'skills', 'hyperframes', 'scripts', 'plugin-cli.mjs'),
  ].filter(Boolean)
  for (const c of cands) {
    try { if (existsSync(c)) return c } catch { /* ignore */ }
  }
  return null
}

/** 异步跑子进程：spawnSync 会把宿主事件循环整个摁住，绝不能用在 DSH 插件里 */
function run(cmd, args, { cwd, timeout = 300_000, env } = {}) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(cmd, args, { cwd, env: env || process.env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
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
      resolve({ status: -1, stdout, stderr: stderr + '\n[超时]' })
    }, timeout)
    child.stdout?.on('data', (d) => { stdout += String(d) })
    child.stderr?.on('data', (d) => { stderr += String(d) })
    child.on('error', (e) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ status: -1, stdout, stderr: stderr + '\n' + String(e?.message || e) })
    })
    child.on('close', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ status: code ?? -1, stdout, stderr })
    })
  })
}

const tail = (s, n = 1200) => (s && s.length > n ? '…' + s.slice(-n) : (s || ''))

export function registerCapabilityTools(tool) {
  // ── Blender 检测 ───────────────────────────────────────────────────
  tool({
    name: 'companion_blender_doctor',
    description: '检查这台机器有没有 Blender、版本是多少、可执行文件在哪。用户想在 DSH 里做 3D 渲染前先调它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const exe = findBlender()
      if (!exe) {
        return {
          found: false,
          fix: '装 Blender 4.x 后用环境变量 BLENDER_EXE 指向 blender.exe（或在插件配置里改候选路径）',
        }
      }
      const r = await run(exe, ['--version'], { timeout: 30_000 })
      const first = String(r.stdout || '').split('\n').find((l) => /Blender/i.test(l)) || ''
      return { found: true, exe, version: first.trim(), ok: r.status === 0 }
    },
  })

  // ── Blender 渲染 ───────────────────────────────────────────────────
  tool({
    name: 'companion_blender_render',
    description: '用 Blender 后台模式跑一个 Python 脚本（可指定 .blend）。用于建模、批量渲染、导出 glb。会等渲染跑完再返回退出码与日志尾巴，不阻塞 DSH。',
    parameters: {
      type: 'object',
      properties: {
        script: { type: 'string', description: '要执行的 Python 脚本绝对路径' },
        blend: { type: 'string', description: '可选：打开的 .blend 文件' },
        timeoutSec: { type: 'number', description: '超时秒数，默认 900' },
      },
      required: ['script'],
      additionalProperties: false,
    },
    async execute(args) {
      const exe = findBlender()
      if (!exe) return { ok: false, error: '没找到 Blender（先跑 companion_blender_doctor）' }
      const script = String(args?.script || '')
      if (!script || !existsSync(script)) return { ok: false, error: `脚本不存在：${script}` }
      const blend = args?.blend ? String(args.blend) : ''
      if (blend && !existsSync(blend)) return { ok: false, error: `blend 不存在：${blend}` }

      const argv = ['--background']
      if (blend) argv.push(blend)
      argv.push('--python', script)

      const t0 = Date.now()
      const r = await run(exe, argv, { timeout: Number(args?.timeoutSec || 900) * 1000 })
      return {
        ok: r.status === 0,
        exitCode: r.status,
        seconds: Math.round((Date.now() - t0) / 1000),
        stdoutTail: tail(r.stdout),
        stderrTail: tail(r.stderr, 800),
        hint: r.status === 0 ? '渲染完成；产物路径看脚本里写的输出目录' : '看 stderrTail 的第一处报错',
      }
    },
  })

  // ── HyperFrames 检测 ───────────────────────────────────────────────
  tool({
    name: 'companion_video_doctor',
    description: '检查出片能力：Node 版本（要 ≥22）、HyperFrames CLI 是否就位。用户想生成宣传片/短视频前先调它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const node = await run(process.execPath, ['--version'], { timeout: 15_000 })
      const nodeVer = String(node.stdout || '').trim()
      const major = Number((nodeVer.match(/v(\d+)/) || [])[1] || 0)
      const cli = findHyperframesCli()
      const checks = [
        { item: 'Node.js', ok: major >= 22, detail: nodeVer, fix: major >= 22 ? '' : 'HyperFrames 要求 Node ≥ 22' },
        {
          item: 'HyperFrames CLI',
          ok: Boolean(cli),
          detail: cli || '',
          fix: cli ? '' : '在项目目录跑 npx hyperframes init <dir>（会自动装 skills/CLI），或设 HYPERFRAMES_CLI',
        },
      ]
      return { allOk: checks.every((c) => c.ok), checks, node: nodeVer }
    },
  })

  // ── HyperFrames 出片 ───────────────────────────────────────────────
  tool({
    name: 'companion_video_make',
    description: '在一个目录里搭一段 HyperFrames 短片并渲染成 mp4。★素材库优先：先调 companion_video_library 看特效库和音效库里有什么，用 npx hyperframes add <块名> 装现成动效块、从 media-use 音效库取音效；库里确实没有的才手写场景。没项目就建骨架，跑 check 再渲染。耗时通常 1-3 分钟。',
    parameters: {
      type: 'object',
      properties: {
        dir: { type: 'string', description: '项目目录（不存在会创建），例如 D:\\\\tools\\\\my-promo' },
        heading: { type: 'string', description: '主标题' },
        sub: { type: 'string', description: '副标题一句话' },
        points: {
          type: 'array',
          items: { type: 'string' },
          description: '2-4 条要点（每条一句，短）',
        },
        cta: { type: 'string', description: '结尾一句话/命令' },
        render: { type: 'boolean', description: '是否渲染 mp4，默认 true' },
      },
      required: ['dir', 'heading'],
      additionalProperties: false,
    },
    async execute(args) {
      const cli = findHyperframesCli()
      if (!cli) return { ok: false, error: '没找到 HyperFrames CLI（先跑 companion_video_doctor）' }

      const dir = String(args.dir)
      const heading = String(args.heading || 'Title')
      const sub = String(args.sub || '')
      const points = Array.isArray(args.points) ? args.points.map(String).slice(0, 4) : []
      const cta = String(args.cta || '')
      const doRender = args.render !== false

      const created = []
      mkdirSync(dir, { recursive: true })
      const indexPath = join(dir, 'index.html')
      if (!existsSync(indexPath)) {
        // 用 CLI 建标准骨架（带 skills、package.json、依赖），失败就退回到手写最小骨架
        const init = await run(process.execPath, [cli, 'init', dir], { timeout: 600_000 })
        created.push({ step: 'init', exitCode: init.status, tail: tail(init.stderr, 300) })
      }

      // 三幕：0-3.5 钩子 / 3.5-8 要点 / 8-12 结尾
      const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const pointRows = points
        .map((p, i) => `      <div id="p${i}" class="clip" data-start="${(0.3 + i * 0.5).toFixed(2)}" data-duration="${(4.5 - i * 0.5).toFixed(2)}">${esc(p)}</div>`)
        .join('\n')
      const pointStyle = `#points div { color: #eaf2ff; font-size: 40px; font-weight: 700; margin-bottom: 26px; }`

      const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      :root { --ground: #070b12; --ink: #eaf2ff; --dim: #8ea4c4; --accent: #4a8cf7; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--ground); font-family: "Inter", "Noto Sans JP", sans-serif; }
      #root { position: absolute; inset: 0; background: var(--ground); }
      .scene { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
      #s1 h1 { color: var(--ink); font-size: 96px; font-weight: 900; letter-spacing: -0.02em; text-align: center; max-width: 1500px; }
      #s1 p { margin-top: 26px; color: var(--dim); font-size: 34px; }
      #s2 { align-items: flex-start; padding-left: 300px; }
      ${pointStyle}
      #s3 h2 { color: var(--ink); font-size: 64px; font-weight: 900; }
      #s3 div { margin-top: 34px; padding: 18px 40px; border: 1px solid #2a4a7a; border-radius: 14px; color: #9fc4ff; font-size: 30px; font-family: "JetBrains Mono", monospace; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="12" data-width="1920" data-height="1080">
      <div id="s1" class="scene" data-composition-id="s1" data-composition-src="compositions/s1.html" data-start="0" data-duration="3.5" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080"></div>
      <div id="s2" class="scene" data-composition-id="s2" data-composition-src="compositions/s2.html" data-start="3.5" data-duration="4.5" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080"></div>
      <div id="s3" class="scene" data-composition-id="s3" data-composition-src="compositions/s3.html" data-start="8" data-duration="4" data-track-index="0" data-track-kind="graphics" data-width="1920" data-height="1080"></div>
    </div>
    <script>window.__timelines["main"] = gsap.timeline({ paused: true });</script>
  </body>
</html>
`
      writeFileSync(indexPath, html, 'utf8')
      created.push({ step: 'index.html', path: indexPath })

      const comps = join(dir, 'compositions')
      mkdirSync(comps, { recursive: true })
      const scene = (id, body, style, script) => `<template>
  <style>
    #root { position: absolute; inset: 0; background: #070b12; display: flex; flex-direction: column; align-items: ${id === 's2' ? 'flex-start' : 'center'}; justify-content: center; ${id === 's2' ? 'padding-left: 300px;' : ''} font-family: "Inter", "Noto Sans JP", sans-serif; }
    ${style}
  </style>
  <div id="root" data-composition-id="${id}" data-width="1920" data-height="1080">
${body}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    ${script}
    window.__timelines["${id}"] = tl;
  </script>
</template>
`
      writeFileSync(join(comps, 's1.html'), scene('s1',
        `    <h1 id="s1-h" class="clip" data-start="0.2" data-duration="3.3">${esc(heading)}</h1>\n    <p id="s1-p" class="clip" data-start="0.8" data-duration="2.7">${esc(sub)}</p>`,
        `#s1-h { color: #eaf2ff; font-size: 96px; font-weight: 900; text-align: center; max-width: 1500px; }\n    #s1-p { margin-top: 26px; color: #8ea4c4; font-size: 34px; }`,
        `tl.fromTo("#s1-h", { opacity: 0, y: 30, filter: "blur(10px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.55, ease: "power4.out" }, 0.2);
    tl.fromTo("#s1-p", { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, 0.8);`), 'utf8')

      writeFileSync(join(comps, 's2.html'), scene('s2',
        pointRows,
        `div { color: #eaf2ff; font-size: 40px; font-weight: 700; margin-bottom: 26px; }`,
        points.map((_, i) => `tl.fromTo("#p${i}", { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.45, ease: "power3.out" }, ${(0.3 + i * 0.5).toFixed(2)});`).join('\n    ')), 'utf8')

      writeFileSync(join(comps, 's3.html'), scene('s3',
        `    <h2 id="s3-h" class="clip" data-start="0.1" data-duration="3.9">${esc(cta || 'Thanks')}</h2>`,
        `#s3-h { color: #eaf2ff; font-size: 64px; font-weight: 900; }`,
        `tl.fromTo("#s3-h", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, 0.1);`), 'utf8')
      created.push({ step: 'compositions', dir: comps })

      // check（有错就报错，不往下渲染）
      const chk = await run(process.execPath, [cli, 'check'], { cwd: dir, timeout: 600_000 })
      const chkBad = /[1-9]\d* error\(s\)/.test(String(chk.stdout + chk.stderr))
      const result = {
        dir,
        created,
        check: { ok: !chkBad && chk.status === 0, exitCode: chk.status, tail: tail(chk.stdout + chk.stderr, 600) },
        mp4: null,
      }
      if (chkBad) {
        result.error = '布局检查没过（先修上面的 check 输出，再渲染）'
        return result
      }
      if (!doRender) return result

      const ren = await run(process.execPath, [cli, 'render'], { cwd: dir, timeout: 1_800_000 })
      const renders = join(dir, 'renders')
      let mp4 = null
      try {
        const files = existsSync(renders) ? readdirSync(renders).filter((f) => f.endsWith('.mp4')) : []
        if (files.length) {
          files.sort((a, b) => statSync(join(renders, b)).mtimeMs - statSync(join(renders, a)).mtimeMs)
          mp4 = join(renders, files[0])
        }
      } catch { /* ignore */ }
      result.render = { exitCode: ren.status, tail: tail(ren.stdout + ren.stderr, 600) }
      result.mp4 = mp4
      result.ok = ren.status === 0 && Boolean(mp4)
      return result
    },
  })
}
