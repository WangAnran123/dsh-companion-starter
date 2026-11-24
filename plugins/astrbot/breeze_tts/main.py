# -*- coding: utf-8 -*-
"""Breeze TTS Provider for AstrBot —— 一把嗓子，失败就报错，绝不偷偷换声。

配置项（AstrBot 后台 → 服务提供商 → 添加 TTS）：
  type       : breeze_tts_api
  voice_id   : 你的音色 id（在 Breeze 后台捏好的那个，形如 voc_xxxxxxxxxx）
  model      : breeze-tts-2（默认）
  api_key_file : 存 API Key 的文本文件路径（一行 key，不要写进配置里）

> 说明：这个插件是从一个私人项目里整理出来的通用版。
> 原版把 key 和音色写死在代码里，这里全部改成配置/文件读取，谁都能用。
"""
from __future__ import annotations

import os
import subprocess

import httpx

from astrbot import logger
from astrbot.api.star import Context, Star, register
from astrbot.core.provider.entities import ProviderType
from astrbot.core.provider.provider import TTSProvider
from astrbot.core.provider.register import provider_cls_map, register_provider_adapter
from astrbot.core.utils.astrbot_path import get_astrbot_temp_path
from astrbot.core.utils.datetime_utils import generate_timestamp_id

BREEZE_BASE = "https://api.breeze.blue"
BREEZE_MODEL = "breeze-tts-2"
DEFAULT_KEY_FILE = os.path.expanduser("~/.breeze/breeze_key.txt")
FFMPEG = os.environ.get("FFMPEG_PATH", "ffmpeg")


def _wav_path() -> str:
    return os.path.join(get_astrbot_temp_path(), f"breeze_{generate_timestamp_id()}.wav")


def _to_wav(src: str) -> str:
    wav = os.path.splitext(src)[0] + ".wav"
    subprocess.run(
        [FFMPEG, "-y", "-loglevel", "quiet", "-i", src, "-ar", "44100", "-ac", "1", wav],
        check=True,
        timeout=120,
    )
    return wav


def _breeze(text: str, voice: str, key_file: str) -> str:
    with open(os.path.expanduser(key_file), encoding="utf-8") as f:
        key = f.read().strip()
    if not key:
        raise RuntimeError(f"{key_file} 里没有 API Key")

    payload = {
        "text": text,
        "language_code": "zh",
        "model_id": BREEZE_MODEL,
        "voice_settings": {"speed": 1.0},
    }
    url = f"{BREEZE_BASE}/v1/text-to-speech/{voice}"
    headers = {"xi-api-key": key, "content-type": "application/json"}

    resp = httpx.post(url, json=payload, headers=headers, timeout=180)
    if resp.status_code != 200:
        raise RuntimeError(f"Breeze HTTP {resp.status_code}: {resp.text[:200]}")

    mp3 = os.path.splitext(_wav_path())[0] + ".mp3"
    with open(mp3, "wb") as f:
        f.write(resp.content)
    if os.path.getsize(mp3) < 2000:
        raise RuntimeError("Breeze 返回的音频太小，可能没合成成功")
    return _to_wav(mp3)


class ProviderBreezeTTS(TTSProvider):
    """Breeze 音色。合成失败就报错 —— 不会换成别的嗓子。"""

    def __init__(self, provider_config: dict, provider_settings: dict) -> None:
        super().__init__(provider_config, provider_settings)
        self.voice_id = provider_config.get("voice_id") or ""
        self.key_file = provider_config.get("api_key_file") or DEFAULT_KEY_FILE
        self.set_model(provider_config.get("model", "") or BREEZE_MODEL)

    async def get_audio(self, text: str) -> str:
        text = (text or "").strip()
        if not text:
            raise RuntimeError("要合成的文字是空的")
        if not self.voice_id:
            raise RuntimeError("没配置 voice_id（去 Breeze 后台复制一个）")
        return _breeze(text, self.voice_id, self.key_file)

    async def test(self) -> None:
        await self.get_audio("音色自检。")


if "breeze_tts_api" not in provider_cls_map:
    register_provider_adapter(
        "breeze_tts_api",
        "Breeze 音色（TTS）",
        provider_type=ProviderType.TEXT_TO_SPEECH,
        default_config_tmpl={
            "id": "breeze_tts",
            "type": "breeze_tts_api",
            "provider": "breeze",
            "provider_type": "text_to_speech",
            "enable": True,
            "voice_id": "",
            "model": BREEZE_MODEL,
            "api_key_file": DEFAULT_KEY_FILE,
        },
    )(ProviderBreezeTTS)
    logger.info("[breeze_tts] 已注册 Provider breeze_tts_api")


@register(
    "astrbot_plugin_breeze_tts",
    "dsh-companion-starter",
    "Breeze 音色 TTS Provider（失败不换声音）",
    "1.0.0",
)
class BreezeTTSPlugin(Star):
    def __init__(self, context: Context, config: dict | None = None) -> None:
        super().__init__(context)
        self.config = config or {}

    async def initialize(self) -> None:
        logger.info("[breeze_tts] 插件已加载")
