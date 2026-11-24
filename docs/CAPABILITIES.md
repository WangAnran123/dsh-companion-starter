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

## 8. 自主学习（记忆 ≠ 学习）

记忆是「发生过什么」，学习是「因为发生过，下次做法不同」。这一组负责后者。

| 工具 | 干什么 |
| --- | --- |
| `companion_lesson_search` | **做任务前先调它**：按关键词检索「以前踩过的坑 / 有效的做法」 |
| `companion_lesson_add` | 存一条经验：场景 / 坑 / 下次怎么做（"下次"必须可执行，笼统的会被拒） |
| `companion_reflect` | 一轮任务结束后的反思：值不值得留、留成什么（`save:true` 直接入库） |
| `companion_review` | 每日复盘：今天新增的记忆 + 固化的经验 → 写成 `review/<日期>.md` |
| `companion_learning_status` | 经验库多少条、最近复盘是哪天、今天学了什么 |
| `companion_learning_config` | 开关 / 复盘时间（真正自动跑起来要靠 DSH 的定时任务） |

### 怎么真的"自动"起来（关键一步）

DSH 有定时任务，配一个每晚的复盘：

1. `companion_learning_config` 设 `dailyReviewAt: "23:00"`
2. 用 DSH 的 schedule 建一个每天 23:00 的任务，prompt 里让它：
   读今天的会话/流水 → 跑 `companion_review` → 需要固化的用 `companion_reflect(save:true)` 入库
3. 第二天开工：先 `companion_lesson_search`，再动手

**没有这个定时任务，这套东西就只是"能记"，不会"自己长"。**

### 边界

- ✅ 能做的：把经验变成**下次会被检索到的文本**，越用越顺手
- ❌ 做不到：模型权重级学习（本地不训练），也不会自己凭空变聪明
- ⚠️ 会污染：经验写错了会影响后续判断 → 所以要"可执行"，并且允许删
