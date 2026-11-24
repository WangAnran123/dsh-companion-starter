# AI 伙伴引导（Companion onboarding）

装了它以后，DSH 自己会一步步把你那个「住在电脑里的伙伴」搭起来——不用你手动建文件、抄模板、找插件目录。

## 它提供什么

| 工具 | 作用 |
|---|---|
| `companion_status` | 现在到哪一步、下一步做什么（引导的主入口） |
| `companion_init` | 建人格文件与记忆文件（不覆盖已有内容） |
| `companion_set_persona` | 逐节填人格：称呼 / 身份 / 说话方式 / 边界 / 偏好 |
| `companion_add_memory` | 往长期记忆追加一行（带日期和标签） |
| `companion_doctor` | 环境体检：Python、Node、浏览器、AstrBot、语音 Key |
| `companion_install_qq` | 把随包附带的两个 AstrBot 插件装进检测到的实例 |

## 怎么用

装好后随便开一句话，比如「帮我把伙伴配起来」，或者直接问「还差什么」。DSH 会先跑 `companion_status`，
然后**一次只问你一个问题**：先定称呼，再定身份、说话方式、边界、偏好；每答一条就写进人格文件，接着问下一个。

数据默认放在 `~/.dsh/shared/companion/`：

```
persona-core.md   人格（唯一来源，改这里三端一起变）
memory.md         长期记忆（一行一条）
```

想换位置：设环境变量 `DSH_COMPANION_DIR`。

## 随包附带

`astrbot-plugins/` 里两个 AstrBot 插件，由 `companion_install_qq` 负责拷贝：

- `astrbot_plugin_breeze_tts` —— Breeze 音色 TTS Provider（合成失败就报错，不换声音）
- `astrbot_plugin_file_push` —— 文件投递箱（丢个 `.send` 文件就把文件发到 QQ）

## 限制

- 只做「本地文件 + 环境检查 + 拷插件」，不联网、不代替你申请账号或密钥。
- 检测不到 AstrBot 时不会瞎猜路径，会明确报错让你给 `pluginDir`。
- QQ 侧插件装完需要**重启 AstrBot** 才生效。
- 平台自动化（抖音等）不在本包范围内：风险和失效问题见主仓库的 `docs/OPTIONAL-AUTOMATION.md`。
