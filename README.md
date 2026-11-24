# dsh-companion-starter

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
