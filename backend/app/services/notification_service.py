"""Notification service: trigger notifications at key business nodes.

Design principle: notification failures MUST NOT affect order state transitions.
All notification calls are wrapped in try/except and logged.
"""

from sqlalchemy.orm import Session

from app.core.logging import logger
from app.models.order import Order
from app.services.notifier import get_notifier

NOTIFICATION_TEMPLATES = {
    "booking_confirmed": {
        "title": "预约已确认",
        "body": "您的摄影预约已确认，请等待摄影师安排拍摄。",
    },
    "shoot_reminder": {
        "title": "拍摄提醒",
        "body": "您的拍摄即将开始，请做好准备。",
    },
    "selection_published": {
        "title": "选片通知",
        "body": "您的选片集已发布，请尽快完成选片。",
    },
    "retouch_feedback": {
        "title": "修图反馈",
        "body": "客户已提交修图反馈，请查看。",
    },
    "delivery_complete": {
        "title": "交付完成",
        "body": "您的最终成片已上传，请下载查看。",
    },
}


def send_notification(
    db: Session,
    template_name: str,
    order: Order | None = None,
    extra_body: str = "",
) -> None:
    """Send a notification by template name.

    This function NEVER raises. All exceptions are caught and logged.
    """
    try:
        template = NOTIFICATION_TEMPLATES.get(template_name)
        if not template:
            logger.warning("Unknown notification template: %s", template_name)
            return

        title = template["title"]
        body = template["body"]
        if extra_body:
            body = f"{body} {extra_body}"

        notifier = get_notifier()
        notifier.send(
            db=db,
            title=title,
            body=body,
            template=template_name,
            related_order_id=order.id if order else None,
        )
    except Exception as e:
        logger.error(
            "Notification failed for template %s: %s", template_name, e
        )
