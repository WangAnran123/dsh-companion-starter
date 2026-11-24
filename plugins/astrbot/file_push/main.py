# -*- coding: utf-8 -*-
"""文件投递箱：把本地文件推到指定 QQ 会话。

原理：每 5 秒扫一次投递箱目录里的 *.send 文件，第一行=文件路径、第二行=说明文字，
发完把后缀改成 .sent。这样从别的程序（脚本、AI、定时任务）发文件，不用碰 AstrBot 内部 API。
"""
import asyncio
import glob
import os

from astrbot.api import logger
from astrbot.api.event import MessageChain
from astrbot.api.message_components import File, Image, Plain
from astrbot.api.star import Context, Star, register


@register("astrbot_plugin_file_push", "dsh-companion-starter", "把本地文件推到 QQ（投递箱）", "1.0.0")
class FilePush(Star):
    def __init__(self, context: Context, config: dict | None = None):
        super().__init__(context)
        self.config = config or {}
        # 会话 id 形如 qq:FriendMessage:<你的QQ号>，在 AstrBot 日志里能看到
        self.session = self.config.get("session") or ""
        self.box = os.path.expanduser(
            self.config.get("outbox_dir") or "~/.dsh/shared/publish/outbox"
        )

    async def initialize(self):
        os.makedirs(self.box, exist_ok=True)
        if not self.session:
            logger.warning("[file_push] 没配置 session，插件会空转（去插件配置里填 qq:FriendMessage:<QQ号>）")
        asyncio.create_task(self._loop())
        logger.info("[file_push] 投递箱已启动: %s", self.box)

    async def _loop(self):
        while True:
            try:
                for path in sorted(glob.glob(os.path.join(self.box, "*.send"))):
                    await self._send_one(path)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[file_push] 轮询出错: %s", exc)
            await asyncio.sleep(5)

    async def _send_one(self, marker: str):
        try:
            with open(marker, encoding="utf-8-sig") as f:
                lines = [ln.strip().lstrip("\ufeff") for ln in f.read().splitlines() if ln.strip()]
        except Exception:
            return
        if not lines:
            os.rename(marker, marker[:-5] + ".sent")
            return
        target = lines[0]
        caption = lines[1] if len(lines) > 1 else ""
        if not self.session:
            return
        if not os.path.exists(target):
            logger.warning("[file_push] 目标不存在: %s", target)
            os.rename(marker, marker[:-5] + ".missing")
            return
        name = os.path.basename(target)
        parts = []
        if caption:
            parts.append(Plain(caption))
        if target.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
            parts.append(Image.fromFileSystem(target))
        else:
            parts.append(File(name=name, file=target))
        try:
            ok = await self.context.send_message(self.session, MessageChain(parts))
            logger.info("[file_push] 发送 %s: %s", name, ok)
            os.rename(marker, marker[:-5] + ".sent")
        except Exception as exc:  # noqa: BLE001
            logger.warning("[file_push] 发送失败 %s: %s", name, exc)
