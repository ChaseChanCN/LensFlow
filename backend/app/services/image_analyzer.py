"""Image analysis service using OpenCV.

Computes interpretable quality metrics:
- sharpness_score: Laplacian variance (higher = sharper)
- brightness_mean: average brightness (0-255)
- highlight_ratio: fraction of pixels with brightness > 240
- shadow_ratio: fraction of pixels with brightness < 15

Generates suggestion and risk_level based on configurable thresholds.
Does NOT delete originals. Does NOT classify creative choices (shallow DOF,
backlit, dark mood) as defects — thresholds are conservative.
"""

from dataclasses import dataclass

import cv2
import numpy as np

SHARPNESS_THRESHOLD = 100.0
BRIGHTNESS_HIGH = 220.0
BRIGHTNESS_LOW = 30.0
HIGHLIGHT_PIXEL = 240
SHADOW_PIXEL = 15
HIGHLIGHT_RATIO_WARN = 0.3
SHADOW_RATIO_WARN = 0.3


@dataclass
class AnalysisMetrics:
    sharpness_score: float
    brightness_mean: float
    highlight_ratio: float
    shadow_ratio: float
    suggestion: str
    risk_level: str


def analyze_image(image_bytes: bytes) -> AnalysisMetrics:
    """Analyze image bytes and return quality metrics."""
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    sharpness_score = float(laplacian.var())

    brightness_mean = float(gray.mean())

    total_pixels = gray.size
    highlight_ratio = float(np.sum(gray >= HIGHLIGHT_PIXEL) / total_pixels)
    shadow_ratio = float(np.sum(gray <= SHADOW_PIXEL) / total_pixels)

    suggestion, risk_level = _judge(
        sharpness_score, brightness_mean, highlight_ratio, shadow_ratio
    )

    return AnalysisMetrics(
        sharpness_score=round(sharpness_score, 2),
        brightness_mean=round(brightness_mean, 2),
        highlight_ratio=round(highlight_ratio, 4),
        shadow_ratio=round(shadow_ratio, 4),
        suggestion=suggestion,
        risk_level=risk_level,
    )


def _judge(
    sharpness: float,
    brightness: float,
    highlight_ratio: float,
    shadow_ratio: float,
) -> tuple[str, str]:
    """Determine suggestion and risk_level from metrics.

    Conservative: flags only clear technical issues.
    Creative choices (shallow DOF, dark mood, backlit) are NOT flagged.
    """
    issues = []

    if sharpness < SHARPNESS_THRESHOLD:
        issues.append("blurry")
    if brightness > BRIGHTNESS_HIGH:
        issues.append("overexposed")
    if brightness < BRIGHTNESS_LOW:
        issues.append("underexposed")
    if highlight_ratio > HIGHLIGHT_RATIO_WARN:
        issues.append("highlight_clipped")
    if shadow_ratio > SHADOW_RATIO_WARN:
        issues.append("shadow_clipped")

    if len(issues) >= 2:
        return "suggest_exclude", "high"
    elif len(issues) == 1:
        return "need_review", "medium"
    else:
        return "no_issue", "low"
