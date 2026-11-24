# 宣传片是怎么做的（素材库优先的实战样本）

这条片子本身是「素材库优先」的示范：**没有一帧是手搓的动效**，画面全部来自 HyperFrames 特效库，
音效全部来自 media-use 自带的音效库。

成片：`promo-黑白灰质感版-v2.mp4` —— 1080×1920 · 52.7 秒 · 黑白灰质感 · 无背景音乐（只有特效音效）

## 结构（5 段）

| 时间 | 段落 | 用的是什么 |
| --- | --- | --- |
| 0–3.2s | 钩子：满屏单词砸进来 | 组件 `caption-kinetic-slam`（改编） |
| 3.2–6.8s | **三步就能用**（便捷性主线） | 自写场景（纯排版，无特效） |
| 6.8–12.0s | 12 格硬指标墙 | 组件 `number-pop-in`（改成多实例，读每格 `data-value`） |
| 12.0–33.4s | 能力详解问答 | 竖屏块 `claude-exchange`（文案用 `data-variable-values` 灌入） |
| 33.4–52.7s | 陪伴故事 + 结尾卡 | 竖屏块 `ai-chat-reveal`（同上） |

## 音效

全部是 `~/.agents/skills/media-use/audio/assets/sfx` 里的现成 mp3，共 39 处，**没有 BGM**：

`pop`（数字逐格）、`click-soft`（能力条目逐条）、`typing` / `key-press` / `ping` / `notification`（聊天与问答）、
`whoosh-short` / `whoosh-cinematic`（段落进出）、`impact-bass-1/2`（砸点）、`riser`（转场）、`sparkle` / `chime`（收尾）。

## 后期质感（ffmpeg）

渲染出来的 MP4 再走一遍 `scripts/grade-bw.txt` 里的滤镜：

- 慢速整体推进（`zoompan` 1 → 1.025×）
- 白闪硬切：每个段落接缝 1 帧白（**用 `drawbox` + `enable`，不要用 `fade`**，见下）
- 片头字幕条 / 片尾字幕条（细白竖线 + 三行小字）
- 黑白灰：`hue=s=0` + bleach-bypass 曲线 + 泛光 20%
- 逐帧胶片颗粒（`noise=alls=8:allf=t+u`）+ 暗角 + 2px 细边框 + 首尾淡入淡出

```bash
# 在能访问 font.ttf / mono.ttf 的目录下跑（字体放当前目录，用相对路径）
ffmpeg -i raw.mp4 -filter_complex "$(cat scripts/grade-bw.txt)" \
  -map "[vout]" -map 0:a -c:v libx264 -crf 21 -pix_fmt yuv420p -c:a copy final.mp4
```

## 五个必踩的坑（都踩过了）

1. **块的 GSAP 走 `cdn.jsdelivr.net`**，国内会 `ECONNRESET` → 装完把 `<script src>` 换成本地 `gsap-3.14.2.min.js`
2. **`<audio>` 必须带 `id`**，否则渲染器发现不了，成片静音
3. **`ffmpeg` 的 `fade=t=out:color=white` 会把之后的所有帧一直刷成白色** → 白闪用 `drawbox + enable`
4. **`crop` 的 `w/h` 不支持时间表达式 `t`**，做慢推要用 `zoompan`
5. **库里很多块自带洋人演示文案**（比如 "BATTERY 91%"、"Write HTML, render video"）→ 接进来第一件事是把所有文案换成自己的项目内容

## 自检方法（没有眼睛时怎么验片）

- `SATAVG` 应该 ≈ 0（确认是纯黑白灰）
- 每个段落抽一帧看 `YAVG`，确认明暗层次在（不要一片灰）
- 音轨 `volumedetect`：`mean` 在 −12 dB 左右、`max` 别顶到 0
