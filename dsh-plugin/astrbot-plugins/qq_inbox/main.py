"""QQ 收件箱：把别人发来的图片 / 语音 / 视频 / 文件落盘，并写索引给 DSH 侧读。

为什么需要它：项目另外两个插件（breeze_tts / file_push）都只管「往外发」，
没人管「往回收」。没有它，机器人看不见你发的图，DSH 也没法帮你分析。

做法：
  每条带媒体的消息 → 存档到 <inbox>/<时间戳-发送者>/ → 写 meta.json
  同时在 <inbox>/index.jsonl 追加一行，DSH 侧只读这个索引，快。

边界：只落盘，不回复、不转发、不改消息；超过 max_mb 的跳过。
"""
import asyncio
import json
import os
from datetime import datetime

from astrbot.api import logger
from astrbot.api.event import AstrMessageEvent, filter
from astrbot.api.message_components import File, Image, Record, Video
from astrbot.api.star import Context, Star, register

DEFAULT_INBOX = "~/.dsh/shared/inbox"
DEFAULT_MAX_MB = 50


def _stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def _safe_name(text: str, fallback: str = "unknown") -> str:
    keep = []
    for ch in str(text or ""):
        keep.append(ch if (ch.isalnum() or ch in "-_.()") else "_")
    out = "".join(keep).strip("_")
    return out[:48] or fallback


def _kind(comp) -> str:
    if isinstance(comp, Image):
        return "image"
    if isinstance(comp, Record):
        return "voice"
    if isinstance(comp, Video):
        return "video"
    return "file"


@register(
    "astrbot_plugin_qq_inbox",
    "dsh-companion-starter",
    "QQ 收件箱：收到的图片/语音/视频落盘，给 DSH 读",
    "1.0.0",
)
class QqInbox(Star):
    def __init__(self, context: Context, config: dict | None = None):
        super().__init__(context)
        self.config = config or {}
        self.inbox = os.path.expanduser(self.config.get("inbox_dir") or DEFAULT_INBOX)
        try:
            self.max_bytes = int(float(self.config.get("max_mb") or DEFAULT_MAX_MB) * 1024 * 1024)
        except Exception:  # noqa: BLE001
            self.max_bytes = DEFAULT_MAX_MB * 1024 * 1024
        self.only_from = str(self.config.get("only_from_qq") or "").strip()

    async def initialize(self) -> None:
        os.makedirs(self.inbox, exist_ok=True)
        logger.info(f"[qq_inbox] 收件箱已启动: {self.inbox}")

    # ---------------------------------------------------------------- 事件入口
    @filter.event_message_type(filter.EventMessageType.ALL)
    async def on_message(self, event: AstrMessageEvent):
        try:
            await self._collect(event)
        except Exception as exc:  # noqa: BLE001 —— 收件箱坏了不能影响正常聊天
            logger.warning(f"[qq_inbox] 收件失败: {exc}")

    # ---------------------------------------------------------------- 落盘
    async def _collect(self, event: AstrMessageEvent) -> None:
        msg = getattr(getattr(event, "message_obj", None), "message", None) or []
        media = [c for c in msg if isinstance(c, (Image, Record, Video, File))]
        if not media:
            return

        sender = self._sender_id(event)
        if self.only_from and self.only_from != sender:
            return

        text = "".join(str(getattr(c, "text", "") or "") for c in msg)[:500]

        bucket = os.path.join(self.inbox, f"{_stamp()}-{_safe_name(sender)}")
        os.makedirs(bucket, exist_ok=True)

        saved = []
        for idx, comp in enumerate(media):
            kind = _kind(comp)
            try:
                src = await comp.convert_to_file_path()
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"[qq_inbox] 取文件失败({kind}): {exc}")
                continue
            if not src or not os.path.exists(src):
                continue
            size = os.path.getsize(src)
            if size > self.max_bytes:
                logger.warning(f"[qq_inbox] 跳过超大文件 {size} bytes: {src}")
                continue
            ext = os.path.splitext(src)[1] or ""
            dst = os.path.join(bucket, f"{idx}-{kind}{ext}")
            try:
                await asyncio.to_thread(self._copy, src, dst)
            except Exception as exc:  # noqa: BLE001
                logger.warning(f"[qq_inbox] 拷贝失败: {exc}")
                continue
            saved.append({"kind": kind, "path": dst, "bytes": os.path.getsize(dst)})

        if not saved:
            return

        meta = {
            "received_at": datetime.now().isoformat(timespec="seconds"),
            "sender_id": sender,
            "session": getattr(event, "unified_msg_origin", "") or "",
            "text": text,
            "files": saved,
        }
        with open(os.path.join(bucket, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        with open(os.path.join(self.inbox, "index.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(meta, ensure_ascii=False) + "\n")
        logger.info(f"[qq_inbox] 收到 {len(saved)} 个媒体文件 → {bucket}")

    @staticmethod
    def _copy(src: str, dst: str) -> None:
        with open(src, "rb") as fsrc, open(dst, "wb") as fdst:
            while True:
                chunk = fsrc.read(1024 * 1024)
                if not chunk:
                    break
                fdst.write(chunk)

    @staticmethod
    def _sender_id(event: AstrMessageEvent) -> str:
        try:
            sid = event.get_sender_id()
            if sid:
                return str(sid)
        except Exception:  # noqa: BLE001
            pass
        obj = getattr(event, "message_obj", None)
        for attr in ("sender_id", "user_id", "sender"):
            val = getattr(obj, attr, None)
            if val:
                return str(val)
        return "unknown"
