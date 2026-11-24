/**
 * dsh-companion-douyin-optional —— 抖音接入的「可选 + 有风险」骨架
 * ============================================================================
 * 🔴 这个包**故意不含任何自动化代码**。它只做三件事：
 *   ① 把风险说清楚（工具返回里就带声明，不藏在文档里）
 *   ② 要用户**明确确认**（douyin_optional_acknowledge，带 confirm 和时间戳记录）
 *   ③ 检查本地前置条件（浏览器、独立 profile、cookie 文件是否存在）
 *
 * 为什么不直接给代码：自动读写第三方平台通常违反其用户协议，
 * 轻则限流、重则封号，页面改版还会让脚本静默失效。把代码塞进「开箱即用」的包里，
 * 等于把风险转嫁给不知情的人。所以：想要的人自己接，接之前先确认。
 * ============================================================================
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const name = 'companion-douyin-optional'
export const inject = ['tools']

const STATE_DIR = process.env.DSH_COMPANION_DIR || join(homedir(), '.dsh', 'shared', 'companion')
const ACK_FILE = () => join(STATE_DIR, 'douyin-risk-ack.json')

const DISCLAIMER = [
  '【风险声明 · 请先读完再决定】',
  '1. 自动操作抖音（点赞/评论/私信/关注/刷视频）通常违反平台用户协议，可能导致账号被限流、封禁，甚至牵连设备。',
  '2. 页面随时改版，自动化会静默失效；失效时可能重复发送或发错对象。',
  '3. 不要用它群发、骚扰、刷量、冒充他人——这些不只是封号问题，可能涉及法律责任。',
  '4. 只用自己的小号、低频操作；不要把主人的账号、凭据、住址等信息写进任何配置。',
  '5. 本包不提供绕过风控、破解签名、批量账号等能力；需要那些的人不要用这个包。',
  '6. 后果由使用者自己承担。作者不对账号损失、数据丢失或法律后果负责。',
].join('\n')

const textOutput = {
  schema: { type: 'object', properties: {}, additionalProperties: true },
  render: (_args, value) => [{
    type: 'text',
    text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  }],
}

function readAck() {
  try {
    return JSON.parse(readFileSync(ACK_FILE(), 'utf8'))
  } catch {
    return null
  }
}

function browserCandidates() {
  return [
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ]
}

export function apply(ctx) {
  const tool = (spec) => ctx.tools.register({ ...spec, output: textOutput })

  // ── 状态 + 声明 ────────────────────────────────────────────────────
  tool({
    name: 'douyin_optional_status',
    description: '查看抖音可选模块的状态：是否已明确确认风险、本地前置条件（浏览器/独立 profile/cookie）是否满足，以及下一步该怎么做。返回里始终带风险声明。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const ack = readAck()
      const browsers = browserCandidates().filter((p) => { try { return existsSync(p) } catch { return false } })
      const profileDir = join(homedir(), '.dsh', 'douyin-duty', 'chrome-profile')
      const cookieFile = join(homedir(), '.dsh', 'douyin-duty', 'douyin_cookie.txt')
      const checks = [
        { item: '浏览器', ok: browsers.length > 0, detail: browsers[0] || '', fix: browsers.length ? '' : '装 Edge 或 Chrome' },
        {
          item: '独立浏览器 profile',
          ok: existsSync(profileDir),
          detail: profileDir,
          fix: existsSync(profileDir) ? '' : '单独建一个浏览器 profile 给自动化用，别用你日常登录的那个',
        },
        {
          item: '登录凭据文件',
          ok: existsSync(cookieFile),
          detail: cookieFile,
          fix: existsSync(cookieFile) ? '' : '用自己的小号登录后自行导出（本包不代做登录）',
        },
      ]
      return {
        acknowledged: Boolean(ack),
        acknowledgedAt: ack?.at || null,
        acknowledgedReason: ack?.reason || null,
        disclaimer: DISCLAIMER,
        checks,
        next: ack
          ? '确认已记录。接下来你自己接自动化模块：只读优先、低频、失败即停，别群发。'
          : '先读上面的风险声明；决定继续就调 douyin_optional_acknowledge（confirm: true + 一句你接它的用途）。',
      }
    },
  })

  // ── 明确确认 ──────────────────────────────────────────────────────
  tool({
    name: 'douyin_optional_acknowledge',
    description: '记录「我已阅读并接受抖音自动化风险」的明确确认（写入本地文件，带时间戳和用途说明）。必须传 confirm: true；不传就只回声明、不落盘。',
    parameters: {
      type: 'object',
      properties: {
        confirm: { type: 'boolean', description: '必须为 true 才记录；这是风险确认，不是操作授权' },
        reason: { type: 'string', description: '一句你打算用它做什么（例如：只读看自己的评论）' },
      },
      required: ['reason'],
      additionalProperties: false,
    },
    async execute(args) {
      if (args?.confirm !== true) {
        return { ok: false, recorded: false, disclaimer: DISCLAIMER, hint: '没有 confirm: true 就不落盘。读完声明再决定。' }
      }
      const reason = String(args?.reason || '').trim()
      if (reason.length < 4) return { ok: false, recorded: false, error: 'reason 太短，写一句你到底要做什么' }
      mkdirSync(STATE_DIR, { recursive: true })
      const payload = { at: new Date().toISOString(), reason, note: '使用者确认已阅读风险声明；作者不承担账号或法律后果' }
      writeFileSync(ACK_FILE(), JSON.stringify(payload, null, 2), 'utf8')
      return {
        ok: true,
        recorded: true,
        path: ACK_FILE(),
        acknowledgedAt: payload.at,
        next: [
          '1) 只做只读观察开始（读自己的私信/评论），先确认不触发风控',
          '2) 任何写操作（评论/私信）逐条人工确认，不批量、不群发',
          '3) 报错就停，不要连着重试',
          '4) 一旦账号出现验证或限流，立刻停用',
        ],
      }
    },
  })
}
