"""Logging configuration."""

import logging
import sys

from app.core.config import settings


def setup_logging() -> logging.Logger:
    """Configure and return the root logger."""
    level = logging.DEBUG if settings.app_debug else logging.INFO

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )

    root_logger = logging.getLogger()
    root_logger.setLevel(level)
    root_logger.addHandler(handler)

    return logging.getLogger(settings.app_name)


logger = setup_logging()
