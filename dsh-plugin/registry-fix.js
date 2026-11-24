/**
 * registry-fix.js —— 让「特效库」在墙内可用（把 GitHub raw 换成本地可达的代理）
 * ============================================================================
 * 背景：HyperFrames 的特效库清单与单个块文件都在 raw.githubusercontent.com，
 * 国内/校园网经常被直接 reset（ECONNRESET）。实测 gh-proxy 能通（200）。
 * 做法（两处都要改，缺一个都不行）：
 *   ① 项目里的 hyperframes.json：registry 字段 → gh-proxy 前缀
 *   ② npx 缓存里的 CLI 包：DEFAULT_REGISTRY_URL 常量 → gh-proxy 前缀（留 .bak-raw 备份）
 * 改完 `catalog` 就能搜、`add` 就能装（块文件下载仍可能 429，可间隔重试）。
 * ============================================================================
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const RAW = 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry'
export const PROXY = 'https://gh-proxy.com/' + RAW

/** 找到所有 npx 缓存里的 hyperframes dist chunk（可能有多个版本） */
function findCliChunks() {
  const out = []
  const roots = [join(homedir(), 'AppData', 'Local', 'npm-cache', '_npx'), join(homedir(), '.npm', '_npx')]
  for (const root of roots) {
    if (!existsSync(root)) continue
    let dirs = []
    try { dirs = readdirSync(root) } catch { continue }
    for (const d of dirs) {
      const dist = join(root, d, 'node_modules', 'hyperframes', 'dist')
      if (!existsSync(dist)) continue
      let files = []
      try { files = readdirSync(dist) } catch { continue }
      for (const f of files) {
        if (!f.endsWith('.js')) continue
        const p = join(dist, f)
        try {
          const t = readFileSync(p, 'utf8')
          if (t.includes('heygen-com/hyperframes/main/registry') && !t.includes('gh-proxy.com')) out.push(p)
        } catch { /* ignore */ }
      }
    }
  }
  return out
}

export function fixRegistryFor(projectDir, registryUrl = PROXY) {
  const report = { project: null, cliChunks: [], errors: [] }

  // ① 项目配置
  const cfg = join(projectDir, 'hyperframes.json')
  if (existsSync(cfg)) {
    try {
      const raw = readFileSync(cfg, 'utf8')
      const json = JSON.parse(raw.replace(/^\uFEFF/, ''))
      if (json.registry !== registryUrl) {
        json.registry = registryUrl
        writeFileSync(cfg, JSON.stringify(json, null, 2) + '\n', 'utf8')
        report.project = { path: cfg, registry: registryUrl }
      } else {
        report.project = { path: cfg, registry: registryUrl, unchanged: true }
      }
    } catch (e) {
      report.errors.push(`hyperframes.json: ${e?.message || e}`)
    }
  } else {
    report.errors.push(`没有 hyperframes.json：${cfg}`)
  }

  // ② CLI 包里的默认地址
  for (const p of findCliChunks()) {
    try {
      const t = readFileSync(p, 'utf8')
      if (!existsSync(p + '.bak-raw')) copyFileSync(p, p + '.bak-raw')
      writeFileSync(p, t.replaceAll(RAW, registryUrl), 'utf8')
      report.cliChunks.push(p)
    } catch (e) {
      report.errors.push(`${p}: ${e?.message || e}`)
    }
  }

  report.ok = report.errors.length === 0
  report.next = report.ok
    ? '现在 npx hyperframes catalog --query "<英文关键词>" 能用了；add 若报 429，隔几秒一个一个装'
    : '有失败项，见 errors'
  return report
}

/** 给插件用：注册一个工具 */
export function registerRegistryFixTool(tool) {
  tool({
    name: 'companion_video_registry_fix',
    description: '把 HyperFrames 特效库切到国内可达的代理（GitHub raw 被墙时用）：改写项目的 hyperframes.json 的 registry，并给 npx 里的 CLI 包默认地址打补丁（留 .bak-raw 备份）。改完 catalog/add 就能用。',
    parameters: {
      type: 'object',
      properties: {
        projectDir: { type: 'string', description: 'HyperFrames 项目目录（含 hyperframes.json）' },
        registryUrl: { type: 'string', description: '可选：自定义 registry 地址，默认 gh-proxy 版' },
      },
      required: ['projectDir'],
      additionalProperties: false,
    },
    async execute(args) {
      const dir = String(args?.projectDir || '')
      if (!dir || !existsSync(dir)) return { ok: false, error: `目录不存在：${dir}` }
      return fixRegistryFor(dir, args?.registryUrl ? String(args.registryUrl) : PROXY)
    },
  })
}
