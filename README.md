# dsh-companion-starter

> 把你自己的「AI 伙伴」搭起来：桌面大脑 + QQ + 语音 + 记忆 + 文件推送。
> 仓库只给**结构和胶水**，人格和记忆是空模板，填成你自己的。

## 三步就能跑（Windows）

```powershell
# 1. 下载仓库（或解压 zip），进到仓库根目录
# 2. 一条命令装进你的 DSH
powershell -ExecutionPolicy Bypass -File install\quickstart.ps1
# 3. 重启 DSH，新建会话，对它说：帮我搭个 AI 伙伴
```

它会先跑体检（Python / Node / 浏览器 / AstrBot / 语音 Key），再一步步问你要人格和记忆。
**不想装了**：`powershell -ExecutionPolicy Bypass -File install\quickstart.ps1 -Uninstall`

装了什么、怎么装的手工步骤、每个工具干什么，见 [docs/SETUP-WINDOWS.md](docs/SETUP-WINDOWS.md)。
没有 DSH？先去装：<https://github.com/deepseek-ai/deepseek-harness>

---
> 把一个「住在你电脑里的 AI 伙伴」搭起来的骨架：桌面大脑 + QQ + 语音 + 记忆 + 文件推送。
> 这个仓库只给你**结构和胶水**，不带你自己的记忆和人格——那两样是空模板，填成你自己的。

**不用从零调教**：插件、人格模板、记忆模板、启动脚本、体检脚本都在里面，装好填几行就能跑。

---

## 它长什么样

```
                    ┌──────────────────────────────┐
   你在桌面上说话 → │  大脑（宿主：DSH / 任意 LLM 容器）│
                    │  ├ 人格：persona/persona-core.md│
                    │  ├ 记忆：persona/memory.md       │
                    │  └ 工具：脚本 / 浏览器自动化      │
                    └───────┬──────────────┬─────────┘
                            │              │
              ┌─────────────▼──┐      ┌────▼──────────────┐
              │ QQ（AstrBot）   │      │ 桌面（TTS 念出来）  │
              │ 插件：TTS/推送   │      │ scripts/say.ps1    │
              └─────────────┬──┘      └───────────────────┘
                            │
                  ┌─────────▼─────────┐
                  │ 共享记忆/流水（markdown）│
                  └───────────────────┘
```

核心思路：**同一个「她」跑在几个终端上，共用人格文件和记忆文件**。
桌面端想说话走 TTS，想发文件走投递箱；QQ 端由 AstrBot 收发；两边往同一份 `bridge-live.md` 写流水，互相知道对方刚说了什么。

## 里面有什么

| 目录 | 内容 |
|---|---|
| `persona/` | 人格模板、记忆模板（**空壳**，自己填） |
| `plugins/astrbot/breeze_tts/` | AstrBot 的 TTS Provider：一把嗓子，失败不换声音 |
| `plugins/astrbot/file_push/` | 文件投递箱：丢个 `.send` 文件就发到 QQ |
| `scripts/say.ps1` | 命令行念一句话 |
| `scripts/live.ps1` | 三端共享的实时流水 |
| `install/check-env.ps1` | 环境体检：缺什么、怎么办 |
| `docs/` | 架构说明、Windows 安装步骤、可选项 |

## 五分钟上手（Windows）

```powershell
# 1. 体检
.\install\check-env.ps1

# 2. 填人格和记忆
copy persona\persona-core.example.md persona\persona-core.md
copy persona\memory.example.md     persona\memory.md
notepad persona\persona-core.md      # 改成你要的样子

# 3. 装语音（可选）
mkdir $env:USERPROFILE\.breeze
'你的Breeze_API_Key' | Set-Content $env:USERPROFILE\.breeze\breeze_key.txt
$env:BREEZE_VOICE_ID = 'voc_xxxxxxxxxx'
.\scripts\say.ps1 "你好，我上线了"

# 4. 装 QQ 侧
#    按 docs/SETUP-WINDOWS.md 第 2 步装 AstrBot，再把 plugins\astrbot\* 拷进插件目录
```

详细步骤、每个配置项的含义、常见报错 → `docs/SETUP-WINDOWS.md`

## 设计上的几个选择（踩过坑才这么定）

1. **人格和记忆是纯文本 markdown，不是数据库**
   换模型、换容器、换电脑都能直接搬走；出问题能一眼看明白。
2. **TTS 只认一把嗓子，合成失败就报错**
   不悄悄回落成别的音色——突然换个声音说话比说不出话更让人出戏。
3. **发文件走「投递箱」目录，不走内部 API**
   任何脚本往目录里丢文件就行，解耦。AstrBot 鉴权变了也不影响。
4. **流水单独一份文件**
   QQ、桌面、其他终端各写各的，下一轮读一眼就知道别处发生过什么。

## 声明

- 本项目是「胶水 + 模板」，不含任何人的私人记忆、人格、账号或密钥；示例里的人设全是占位符。
- 宿主容器（比如 DSH）如果是闭源软件，本仓库只提供对接方式，不包含它的代码。
- AstrBot 是第三方开源项目，请遵循它自己的许可。
- 自动化操作第三方平台（如抖音、QQ）可能违反平台规则，**风险自负**；本仓库默认不含这类模块，只在 `docs/OPTIONAL-AUTOMATION.md` 说明思路。
- 私自采集、骚扰、群发都不在支持范围内。

## License

MIT

---

## 在 DSH 里一键装（推荐）

这个仓库同时是一个 **DSH 插件包**（`dsh-plugin/`）。装进 DSH 之后，**DSH 会自己一步步问你、自己写文件**，
不用手动抄模板：

| 工具 | 作用 |
|---|---|
| `companion_status` | 现在到哪一步、下一步做什么（引导主入口） |
| `companion_init` | 建人格文件与记忆文件（不覆盖已有） |
| `companion_set_persona` | 逐节填：称呼 / 身份 / 说话方式 / 边界 / 偏好 |
| `companion_add_memory` | 往长期记忆追加一行 |
| `companion_doctor` | 环境体检（Python / Node / 浏览器 / AstrBot / 语音 Key） |
| `companion_install_qq` | 把随包的两个 AstrBot 插件装进检测到的实例 |

**装法（二选一）**：

1. **GUI**：DSH → 设置 → **插件** → **添加插件** → 选这个仓库里的 `dsh-plugin` 目录 → 重启 DSH
2. **命令**：让 DSH 里的 AI 执行 `plugin_manager` 的 `install_bundle`，target 填 `dsh-plugin` 的绝对路径

装完开一句「帮我把伙伴配起来」，它会先跑 `companion_status`，然后一次只问你一个问题。

> ⚠️ 装的时候要把 DSH 关掉再重开：DSH 运行时 profile 的 `node_modules` 被锁，
> pnpm 会报 `EPERM ... sherpa-onnx`，这是已知现象，不是插件坏了。

数据默认放在 `~/.dsh/shared/companion/`（`persona-core.md` + `memory.md`），
换位置设环境变量 `DSH_COMPANION_DIR`。

---

## 可选能力包

| 包 | 内容 | 说明 |
|---|---|---|
| `dsh-plugin/` | 引导装伙伴 + **Blender 渲染 + HyperFrames 出片** | 主体。Blender/出片是可选能力，缺依赖会明确告诉你装什么 |
| `dsh-plugin-douyin-optional/` | 抖音接入的**风险确认骨架** | 🔴 不含自动化代码：只声明风险、记录确认、查前置条件。自己接自动化，后果自担 |

抖音那个包刻意不给代码：自动操作第三方平台通常违反其协议，轻则限流重则封号，
把代码塞进"开箱即用"包里等于把风险转嫁给不知情的人。想要的人明确确认后自己接。

### 视频能力（五套，可选装）

插件里有两个工具专门管「五套视频能力」，装的是 skill（不是代码）：

| 工具 | 作用 |
|---|---|
| `companion_video_skills` | 查 HyperFrames / Remotion / Shortcraft / a2e / Talkcraft 五套在不在，缺哪套 |
| `companion_video_install` | 缺的一键装（走官方 `npx skills add`，装到 `~/.agents/skills`） |
| `companion_video_make` | 用 HyperFrames 在指定目录搭片并直接渲染 mp4 |

实测：五套检测 5/5 就位；`companion_video_make` 从空目录到出片 33.6 秒。

---

## 素材库优先（重要约定）

做视频**先拿现成的，别手搓**。插件里有一整套素材库工作流：

| 库 | 里面有什么 | 怎么用 |
|---|---|---|
| **HyperFrames 特效库** | 约 450 个动效块/组件：转场、故障、3D、数据图表、聊天卡、动力学标题、字幕样式 | `npx hyperframes catalog --query "<英文关键词>"` 找 → `npx hyperframes add <名字>` 装进 `compositions/` |
| **media-use 音效库** | 19 个现成音效：whoosh / impact-bass / glitch / typing / ping / pop / riser / sparkle / chime | 直接引 `~/.agents/skills/media-use/audio/assets/sfx/*.mp3` |
| **media-use 调色库** | LUT 索引（`luts/index.json`） | 套在画面上做统一色调 |
| **OpenFilm 素材** | `npx -y openfilm@latest get` 拉音乐/音效/贴纸 | 需要 OpenFilm 时才用 |

对应工具：
- `companion_video_library` —— **做视频第一步**：盘点本机三个库有什么（返回条目数、位置、已验证可用的块名）
- `companion_video_registry_fix` —— 特效库在墙内连不上时先跑它（自动切 gh-proxy）
- `companion_video_make` —— 搭片 + 渲染

**已验证可直接用的块**（实测跑通过）：
`ai-chat-reveal`（竖屏聊天流式回答 + 结尾卡，文案用变量灌）、`mk-specs-list`（特性清单，改 CONFIG.rows）、
`mk-progress-stat`（大数字 + 进度条）、`glass-hero`（玻璃折射大标题）、`glitch`（故障转场）、
`caption-kinetic-slam`（满屏单词砸屏，钩子用）、`number-pop-in`（数字逐位 pop，可多实例）

**两个必踩的坑**（写在这里省你时间）：
1. 块里的 GSAP 默认走 `cdn.jsdelivr.net`，国内会 ECONNRESET —— 装完把 `<script src>` 换成本地 `gsap.min.js`
2. `<audio>` 必须带 `id`，否则渲染器发现不了，成片静音

---

## 一条成片是怎么做出来的（实战样本）

`docs/PROMO.md` 记录了一条 52.7 秒竖屏宣传片的完整做法：**画面全部来自特效库的现成块，音效全部来自
media-use 自带音效库，没有一帧手搓**。里面写了五段结构、39 处音效对位、黑白灰质感滤镜
（`scripts/grade-bw.txt` 可直接复用），以及五个必踩的坑（CDN 的 GSAP 会断、audio 必须带 id、
ffmpeg 的 fade 会把整片刷白……）。

想看"素材库优先"到底怎么落地，先读这一篇。

---

## 能力一览（37 个工具）

| 组 | 能力 | 工具数 |
|---|---|---|
| 搭起来 | 人格 / 记忆 / 环境体检 | 5 |
| 视频 | 出片 + 五套 skill + **素材库盘点** + 特效库代理修复 | 6 |
| 3D | Blender 检测 + 后台渲染 | 2 |
| **QQ** | 发文字 / 发文件（AstrBot 投递箱）+ 体检 + 配置 | 4 |
| **主动关心** | 安静时段 / 每日上限 / 该不该说话 | 4 |
| **跨端记忆** | 每日摘要 + 同步进 QQ / 抖音（标记块，不动其他内容） | 3 |
| **抖音** | Cookie / 风险闸门 / 只读查数据 / 发布准备 / 回复准备 | 7 |
| **自主学习** | 经验库 + 反思 + 每日复盘（记忆 ≠ 学习） | 6 |

完整说明和边界见 **[docs/CAPABILITIES.md](docs/CAPABILITIES.md)**。

> 抖音那块要特别看边界：**只做只读 + 准备，最后一下人工确认**。
> 不伪造签名、不绕风控 —— 硬绕的结果是限流或封号，不值得。
