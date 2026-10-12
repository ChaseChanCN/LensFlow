"""Image analyzer tests: S4-T03, S4-T04, S4-T08."""


import cv2
import numpy as np
import pytest

from app.services.image_analyzer import analyze_image


def make_image_jpeg(img: np.ndarray) -> bytes:
    """Encode cv2 image as JPEG bytes."""
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def make_normal_image() -> bytes:
    img = np.random.randint(80, 180, (480, 640, 3), dtype=np.uint8)
    return make_image_jpeg(img)


def make_blurry_image() -> bytes:
    img = np.random.randint(80, 180, (480, 640, 3), dtype=np.uint8)
    img = cv2.GaussianBlur(img, (51, 51), 0)
    return make_image_jpeg(img)


def make_overexposed_image() -> bytes:
    img = np.full((480, 640, 3), 250, dtype=np.uint8)
    return make_image_jpeg(img)


def make_underexposed_image() -> bytes:
    img = np.full((480, 640, 3), 5, dtype=np.uint8)
    return make_image_jpeg(img)


def make_shallow_dof_image() -> bytes:
    """Shallow DOF: center sharp, edges blurred. Should NOT be flagged as defect."""
    img = np.random.randint(80, 180, (480, 640, 3), dtype=np.uint8)
    mask = np.zeros((480, 640), dtype=np.uint8)
    cv2.circle(mask, (320, 240), 100, 255, -1)
    blurred = cv2.GaussianBlur(img, (51, 51), 0)
    img = np.where(mask[:, :, None] > 0, img, blurred)
    return make_image_jpeg(img)


class TestAnalysisMetrics:
    def test_normal_image(self):
        metrics = analyze_image(make_normal_image())
        assert metrics.sharpness_score > 0
        assert 0 <= metrics.brightness_mean <= 255
        assert 0 <= metrics.highlight_ratio <= 1
        assert 0 <= metrics.shadow_ratio <= 1

    def test_blurry_image_flagged(self):
        metrics = analyze_image(make_blurry_image())
        assert metrics.sharpness_score < 100
        assert metrics.suggestion in ("need_review", "suggest_exclude")

    def test_overexposed_image_flagged(self):
        metrics = analyze_image(make_overexposed_image())
        assert metrics.brightness_mean > 220
        assert metrics.suggestion in ("need_review", "suggest_exclude")

    def test_underexposed_image_flagged(self):
        metrics = analyze_image(make_underexposed_image())
        assert metrics.brightness_mean < 30
        assert metrics.suggestion in ("need_review", "suggest_exclude")

    def test_shallow_dof_not_flagged_as_defect(self):
        """Shallow DOF should not be classified as suggest_exclude."""
        metrics = analyze_image(make_shallow_dof_image())
        assert metrics.suggestion != "suggest_exclude" or metrics.risk_level != "high"


class TestSuggestionRules:
    def test_no_issue_returns_low_risk(self):
        metrics = analyze_image(make_normal_image())
        if metrics.suggestion == "no_issue":
            assert metrics.risk_level == "low"

    def test_suggest_exclude_has_high_risk(self):
        metrics = analyze_image(make_blurry_image())
        if metrics.suggestion == "suggest_exclude":
            assert metrics.risk_level == "high"

    def test_need_review_has_medium_risk(self):
        metrics = analyze_image(make_blurry_image())
        if metrics.suggestion == "need_review":
            assert metrics.risk_level == "medium"

    def test_invalid_image_raises(self):
        with pytest.raises(ValueError):
            analyze_image(b"not an image")


class TestTestSetValidation:
    """S4-T08: Validate analysis with 5 test images."""

    def test_normal_photo_no_issue(self):
        metrics = analyze_image(make_normal_image())
        assert metrics.suggestion == "no_issue"
        assert metrics.risk_level == "low"

    def test_blurry_photo_detected(self):
        metrics = analyze_image(make_blurry_image())
        assert metrics.sharpness_score < 100

    def test_overexposed_photo_detected(self):
        metrics = analyze_image(make_overexposed_image())
        assert metrics.brightness_mean > 220

    def test_underexposed_photo_detected(self):
        metrics = analyze_image(make_underexposed_image())
        assert metrics.brightness_mean < 30

    def test_shallow_dof_not_false_positive(self):
        metrics = analyze_image(make_shallow_dof_image())
        assert metrics.risk_level in ("low", "medium")
