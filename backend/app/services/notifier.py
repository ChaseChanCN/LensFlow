"""Notification abstraction layer.

Provides a unified interface for sending notifications,
supporting Bark (default) and WeChat Work.
Includes retry logic and delivery logging.
"""

import time
from abc import ABC, abstractmethod
from datetime import datetime, timezone

import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import logger
from app.models.notification import NotificationLog

MAX_RETRIES = 3
RETRY_BASE_DELAY = 2  # seconds


class Notifier(ABC):
    @abstractmethod
    def _send(self, title: str, body: str, **kwargs) -> dict:
        """Actual send implementation. Returns API response or raises."""

    def send(
        self,
        db: Session,
        title: str,
        body: str,
        target: str = "",
        template: str = "default",
        related_order_id: int | None = None,
        **kwargs,
    ) -> NotificationLog:
        """Send notification with retry and logging."""
        log = NotificationLog(
            channel=self.__class__.__name__,
            target=target or self._default_target(),
            template=template,
            payload=f"{title}: {body}",
            status="pending",
            related_order_id=related_order_id,
        )
        db.add(log)
        db.commit()

        for attempt in range(MAX_RETRIES):
            try:
                self._send(title, body, **kwargs)
                log.status = "sent"
                log.sent_at = datetime.now(timezone.utc)
                db.commit()
                logger.info("Notification sent: %s -> %s", title, log.target)
                return log
            except Exception as e:
                log.retry_count = attempt + 1
                log.error_message = str(e)
                db.commit()
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_BASE_DELAY * (2 ** attempt)
                    logger.warning(
                        "Notification failed (attempt %d), retrying in %ds: %s",
                        attempt + 1, delay, e,
                    )
                    time.sleep(delay)

        log.status = "failed"
        db.commit()
        logger.error("Notification failed after %d retries: %s", MAX_RETRIES, title)
        return log

    @abstractmethod
    def _default_target(self) -> str:
        """Return default target for this channel."""


class BarkNotifier(Notifier):
    def _default_target(self) -> str:
        return settings.bark_device_key

    def _send(self, title: str, body: str, **kwargs) -> dict:
        if not settings.bark_device_key:
            raise ValueError("BARK_DEVICE_KEY not configured")

        url = f"{settings.bark_server_url}/{settings.bark_device_key}"
        resp = httpx.post(
            url,
            json={"title": title, "body": body, "category": "lensflow"},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


class WechatWorkNotifier(Notifier):
    def _default_target(self) -> str:
        return "wechat_work_group"

    def _send(self, title: str, body: str, **kwargs) -> dict:
        if not settings.wechat_work_webhook_url:
            raise ValueError("WECHAT_WORK_WEBHOOK_URL not configured")

        resp = httpx.post(
            settings.wechat_work_webhook_url,
            json={
                "msgtype": "text",
                "text": {"content": f"{title}\n{body}"},
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


def get_notifier() -> Notifier:
    """Factory: return notifier instance based on config."""
    if settings.notifier_channel == "wechat_work":
        return WechatWorkNotifier()
    return BarkNotifier()
