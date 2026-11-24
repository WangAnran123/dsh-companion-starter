# Windows 安装步骤（从零到能说话）

> 目标：装完之后，你在命令行能听见她说话、能往 QQ 发文件；大脑（LLM 容器）可以后面再接。
> 全程大约 20 分钟，卡在哪一步就把那一步的报错发我。

---

## 0. 准备

| 需要 | 说明 |
|---|---|
| Windows 10/11 | 本教程按 Windows 写 |
| Python 3.10+ | 勾选 **Add python.exe to PATH** |
| Node.js LTS | 有些脚本用 Node |
| Edge 或 Chrome | 消息自动化要用 |
| Breeze API Key（可选） | 想要语音才需要 |

体检：

```powershell
.\install\check-env.ps1
```

红了的项目按提示装，装完重跑，直到全绿。

---

## 1. 人格与记忆

```powershell
copy persona\persona-core.example.md persona\persona-core.md
copy persona\memory.example.md     persona\memory.md
notepad persona\persona-core.md
```

`persona-core.md` 里每一节都写了要填什么。**第一次只填「称呼」「身份」「说话方式」「边界」四节就够**，其余慢慢补。

> 这两个文件已经在 `.gitignore` 里，不会被误提交。

---

## 2. AstrBot（QQ 侧）

1. 从 AstrBot 官方仓库/发布页下载 Windows 版本（或按官方文档用 Docker）。
2. 首次启动扫码登录 QQ（建议用小号，大号有封号风险）。
3. 启动后浏览器打开默认的 WebUI（通常是 `http://127.0.0.1:6185`），记下**实例目录**，形如：

```
C:\Users\<你>\.astrbot_launcher\instances\<实例ID>\
    └─ core\data\plugins\      ← 插件放这里
```

4. 把本仓库的两个插件拷进去：

```powershell
$dst = "C:\Users\<你>\.astrbot_launcher\instances\<实例ID>\core\data\plugins"
copy -Recurse plugins\astrbot\breeze_tts $dst
copy -Recurse plugins\astrbot\file_push  $dst
```

5. 重启 AstrBot。日志里看到这两行就算成功：

```
[breeze_tts] 已注册 Provider breeze_tts_api
[file_push] 投递箱已启动: ...\outbox
```

6. **WebUI → 配置 → 插件配置**：
   - `file_push` → `session` 填你的会话 id，形如 `qq:FriendMessage:123456789`
     （不知道填什么就看 AstrBot 日志里收到的消息前缀）
   - `breeze_tts` → `voice_id` 填你的音色 id、`api_key_file` 指向你的 key 文件

7. 配置 **TTS 提供商**：类型选 `breeze_tts_api`，启用它。

---

## 3. 语音（桌面端自己念）

```powershell
mkdir $env:USERPROFILE\.breeze -Force
'sk-你的key' | Set-Content $env:USERPROFILE\.breeze\breeze_key.txt
[Environment]::SetEnvironmentVariable('BREEZE_VOICE_ID','voc_xxxxxxxxxx','User')
[Environment]::SetEnvironmentVariable('BREEZE_KEY_FILE',"$env:USERPROFILE\.breeze\breeze_key.txt",'User')
```

新开一个终端（让环境变量生效），测试：

```powershell
.\scripts\say.ps1 "你好，我是新装好的那个。"
```

生成的文件在 `%TEMP%` 里，会调系统播放器播出来。

---

## 4. 文件投递

```powershell
$box = "$env:USERPROFILE\.dsh\shared\publish\outbox"
mkdir $box -Force
# 第一行是文件路径，第二行是说明文字
@("C:\path\to\pic.png", "给你看这张") | Set-Content "$box\hello.send" -Encoding UTF8
```

投递箱每 5 秒扫一次，发成功后文件变成 `.sent`；目标不存在会变成 `.missing`（方便排查）。

---

## 5. 接大脑（LLM 容器）

本仓库不绑定具体容器。你要做的是让容器：

1. 每次对话前**读** `persona/persona-core.md` 和 `persona/memory.md`（塞进 system prompt）；
2. 允许它调用本仓库的脚本（`say.ps1`、投递箱、`live.ps1`）；
3. 每轮结束往 `bridge-live.md` 写一行流水。

如果你用的容器支持「插件/MCP/工具」，把上面三件事包成工具即可。

---

## 常见报错

| 现象 | 原因 | 处理 |
|---|---|---|
| `Provider adapter not found: breeze_tts_api` | 插件没加载（缺 `@register` 的 Star 类或元数据坏了） | 看 AstrBot 日志里的插件加载错误；`main.py` 必须同时有 `register_provider_adapter` 和 `@register(...) class` |
| 语音 429 | 调用太快被限流 | 等 30–60 秒再说；别连续合成 |
| `file_push` 发了但收不到 | `session` 填错 | 看 AstrBot 日志里入站消息的会话前缀，照抄 |
| `say.ps1` 报没 Key | 环境变量没生效 | 关掉终端重开，或直接在参数里给 `-KeyFile` |
| 中文乱码 | 控制台编码 | 跑 `chcp 65001`，或把输出重定向到文件看 |

---

## 安全提醒

- QQ/抖音这类平台对自动化很敏感：**用小号、低频、别群发**。
- 密钥只放本地文件或环境变量，别提交、别截图外发。
- 人格文件里的「边界」一节别删——那是防止她被人套话的最后一道闸。
