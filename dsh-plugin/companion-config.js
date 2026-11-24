/**
 * companion-config.js —— 伙伴的运行配置（QQ 投递箱 / 抖音 / 主动性 / 记忆同步）
 * ============================================================================
 * 设计原则：
 *   ① 配置只存用户自己的值，仓库里**不写死任何账号、ID、路径**
 *   ② 配置放在 ~/.dsh/shared/companion/config.json（不进 git）
 *   ③ 所有工具都用「读配置 → 缺什么就告诉用户怎么填」，不猜
 * ============================================================================
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const BASE_DIR = process.env.DSH_COMPANION_DIR || join(homedir(), '.dsh', 'shared', 'companion')
export const CONFIG_PATH = join(BASE_DIR, 'config.json')

export const DEFAULT_CONFIG = {
  qq: {
    /** AstrBot 实例的 plugins 目录（留空 = 自动探测） */
    astrbotPluginsDir: '',
    /** 发给谁：QQ 好友的 user id（留空 = 用 AstrBot 插件里写死的会话，不推荐） */
    friendUserId: '',
    /** 投递箱目录：往里丢 *.send 文件，AstrBot 的 file_push 插件会替你发送 */
    outbox: join(homedir(), '.dsh', 'shared', 'publish', 'outbox'),
  },
  douyin: {
    /** 登录 Cookie 放哪（自己粘贴，别提交到仓库） */
    cookieFile: join(homedir(), '.dsh', 'shared', 'douyin', 'cookie.txt'),
    /** 风险确认文件（写入类操作必须先确认） */
    ackFile: join(BASE_DIR, 'douyin-risk-ack.json'),
    /** 每天最多发几条评论/回复 */
    dailyReplyLimit: 5,
    /** 发布用的工作目录（视频会先拷到这里再上传） */
    publishDir: join(BASE_DIR, 'publish'),
    /** 浏览器可执行文件（留空 = 自动找 Edge/Chrome） */
    browser: '',
  },
  proactive: {
    enabled: true,
    /** 安静时段（这段时间里绝不主动打扰） */
    quietStart: '23:30',
    quietEnd: '07:30',
    maxPerDay: 3,
    minGapMinutes: 90,
  },
  memory: {
    /**
     * 跨端记忆同步目标，例：
     * [{ "path": "C:/.../qq-memory.md", "kind": "qq" },
     *  { "path": "C:/.../douyin/persona.md", "kind": "douyin" }]
     */
    targets: [],
  },
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || Array.isArray(patch)) return patch === undefined ? base : patch
  if (typeof base !== 'object' || base === null) return patch === undefined ? base : patch
  const out = { ...base }
  for (const k of Object.keys(patch || {})) out[k] = deepMerge(base[k], patch[k])
  return out
}

export function readConfig() {
  let raw = null
  try { raw = readFileSync(CONFIG_PATH, 'utf8') } catch { raw = null }
  if (!raw) return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  let parsed = {}
  try { parsed = JSON.parse(raw.replace(/^\uFEFF/, '')) } catch { parsed = {} }
  return deepMerge(DEFAULT_CONFIG, parsed)
}

export function writeConfig(patch) {
  mkdirSync(BASE_DIR, { recursive: true })
  const next = deepMerge(readConfig(), patch || {})
  writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return next
}

export function ensureBase() {
  mkdirSync(BASE_DIR, { recursive: true })
  return BASE_DIR
}

/** 展开 ~ 前缀 */
export function expandPath(p) {
  if (!p) return p
  return p.startsWith('~') ? join(homedir(), p.slice(1).replace(/^[\\/]/, '')) : p
}

export const exists = (p) => Boolean(p) && existsSync(expandPath(p))
