# 能力清单（v1.1.0）

装完 `install\quickstart.ps1` 之后，模型可以调用 **31 个工具**。按能力分成七组。

---

## 1. 搭起来（人格 / 记忆 / 体检）

| 工具 | 干什么 |
| --- | --- |
| `companion_status` | 现在到哪一步、下一步做什么（可传 `dir` 指定目录） |
| `companion_init` | 建人格 + 记忆文件（已存在则跳过，不覆盖） |
| `companion_set_persona` | 逐节填人格：称呼 / 身份 / 说话方式 / 边界 / 偏好 |
| `companion_add_memory` | 往长期记忆追加一行 |
| `companion_doctor` | 环境体检：Python / Node / 浏览器 / AstrBot / 语音 Key |

## 2. 视频

| 工具 | 干什么 |
| --- | --- |
| `companion_video_doctor` | 出片能力体检（Node 版本、HyperFrames CLI） |
| `companion_video_make` | 建骨架 + 渲染 mp4 |
| `companion_video_skills` | 检查五套视频 skill（HyperFrames / Remotion / Shotcraft / a2e / Talkcraft） |
| `companion_video_install` | 一键装缺的 skill |
| `companion_video_library` | **素材库盘点**：特效库条目数、音效库清单、LUT 清单 |
| `companion_video_registry_fix` | 特效库拉不到（GitHub raw 被墙）时切代理 |

## 3. 3D / Blender

| 工具 | 干什么 |
| --- | --- |
| `companion_blender_doctor` | 找 Blender、报版本和路径 |
| `companion_blender_render` | 后台跑 Python 脚本渲染（可指定 .blend） |

## 4. QQ 通道

| 工具 | 干什么 |
| --- | --- |
| `companion_install_qq` | 把两个 AstrBot 插件（语音推送 / 文件投递）拷进实例 |
| `companion_qq_status` | AstrBot 在哪、插件装了没、投递箱有几条待发 |
| `companion_qq_send` | 发文字 / 发文件（走 AstrBot 投递箱，5 秒内送达） |
| `companion_qq_configure` | 指定插件目录 / 投递箱位置 |

> 原理：往投递箱丢 `*.send` 文件（第一行文件路径、第二行说明），AstrBot 插件轮询发送。
> 不需要 AstrBot 的 HTTP API 鉴权，也不会动登录态。

## 5. 主动关心

| 工具 | 干什么 |
| --- | --- |
| `companion_proactive_config` | 开关、安静时段、每天上限、最小间隔 |
| `companion_proactive_should` | 判断「现在该不该主动」→ act / reason / 开场方向 |
| `companion_proactive_log` | 记一次主动（统计频率用） |
| `companion_proactive_reset` | 清空记录 |

> 只做决策不做发送：语言和渠道由模型自己选（QQ / 桌面语音）。
> 安静时段默认 23:30–07:00，**这段时间绝不打扰**。

## 6. 跨端记忆同步

| 工具 | 干什么 |
| --- | --- |
| `companion_memory_digest` | 把某天的记忆条目按标签整理成摘要，写到 `digest/<日期>.md` |
| `companion_memory_targets` | 管理同步目标（QQ 记忆文件 / 抖音人格文件…） |
| `companion_memory_sync` | 同步到各端：**只替换 `<!-- companion:memory:start -->` 与 `end` 之间的内容**，其他一律不动；支持 `dryRun` |

> 唯一源是 `~/.dsh/shared/companion/memory.md`，一行一条：`- [YYYY-MM-DD] [标签] 内容`。

## 7. 抖音

| 工具 | 干什么 |
| --- | --- |
| `companion_douyin_setup` | 保存登录 Cookie（只在本机）、指定浏览器 / 发布目录 / 配额 |
| `companion_douyin_acknowledge` | 风险确认（不做确认，写入类工具一律拒绝） |
| `companion_douyin_doctor` | Cookie / 确认 / 浏览器 / 今日配额体检 |
| `companion_douyin_stats` | **只读**：查作品点赞/评论/分享数（公开接口，不登录） |
| `companion_douyin_publish` | **准备发布**：校验文件（大小/时长/竖屏）、拷进发布目录、写 metadata.json、打开创作者中心 |
| `companion_douyin_reply` | **准备回复**：查配额、记用量、打开视频页、把文案给你粘贴 |
| `companion_douyin_risks` | 风险清单（不改任何东西） |

### 抖音这块的边界（写清楚，别抱幻想）

✅ **做**：只读查数据、发布前校验与打包、打开官方页面、每日配额限制、风险确认闸门
❌ **不做**：伪造签名、绕验证码/风控、批量刷屏、替别人操作账号

原因很直接：抖音对自动化有风控，硬绕最容易的结果是**限流或封号**。
所以「最后一下」永远是人工点。这既是安全边界，也是对用户账号负责。

---

## 配置在哪

全部在 `~/.dsh/shared/companion/config.json`（不进 git）：

```json
{
  "qq": { "astrbotPluginsDir": "", "outbox": "~/.dsh/shared/publish/outbox" },
  "douyin": { "cookieFile": "~/.dsh/shared/douyin/cookie.txt", "dailyReplyLimit": 5 },
  "proactive": { "enabled": true, "quietStart": "23:30", "quietEnd": "07:30", "maxPerDay": 3 },
  "memory": { "targets": [] }
}
```

想改哪块用对应工具改（`companion_qq_configure` / `companion_douyin_setup` /
`companion_proactive_config` / `companion_memory_targets`），不用手写 JSON。
