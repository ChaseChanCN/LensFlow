"""S8-T03: AI analysis accuracy statistics.

Runs the image analyzer on the test set and calculates
Precision/Recall/F1 for each anomaly type.
"""

import sys

sys.path.insert(0, ".")

import cv2
import numpy as np

from app.services.image_analyzer import analyze_image


def make_jpeg(img: np.ndarray) -> bytes:
    _, buf = cv2.imencode(".jpg", img)
    return buf.tobytes()


def make_normal() -> bytes:
    return make_jpeg(np.random.randint(80, 180, (480, 640, 3), dtype=np.uint8))


def make_blurry() -> bytes:
    img = np.random.randint(80, 180, (480, 640, 3), dtype=np.uint8)
    return make_jpeg(cv2.GaussianBlur(img, (51, 51), 0))


def make_overexposed() -> bytes:
    return make_jpeg(np.full((480, 640, 3), 250, dtype=np.uint8))


def make_underexposed() -> bytes:
    return make_jpeg(np.full((480, 640, 3), 5, dtype=np.uint8))


def make_shallow_dof() -> bytes:
    img = np.random.randint(80, 180, (480, 640, 3), dtype=np.uint8)
    mask = np.zeros((480, 640), dtype=np.uint8)
    cv2.circle(mask, (320, 240), 100, 255, -1)
    blurred = cv2.GaussianBlur(img, (51, 51), 0)
    img = np.where(mask[:, :, None] > 0, img, blurred)
    return make_jpeg(img)


TEST_SET = [
    ("normal", make_normal(), False),
    ("normal", make_normal(), False),
    ("normal", make_normal(), False),
    ("blurry", make_blurry(), True),
    ("blurry", make_blurry(), True),
    ("overexposed", make_overexposed(), True),
    ("underexposed", make_underexposed(), True),
    ("shallow_dof", make_shallow_dof(), False),
    ("shallow_dof", make_shallow_dof(), False),
    ("normal", make_normal(), False),
]


def calculate_metrics():
    tp = fp = fn = tn = 0

    print(f"{'Image':<15} {'Suggestion':<15} {'Risk':<8} {'Expected':<10} {'Result'}")
    print("-" * 60)

    for name, img_bytes, expected_anomaly in TEST_SET:
        metrics = analyze_image(img_bytes)
        predicted_anomaly = metrics.suggestion != "no_issue"

        if predicted_anomaly and expected_anomaly:
            tp += 1
            result = "TP"
        elif predicted_anomaly and not expected_anomaly:
            fp += 1
            result = "FP"
        elif not predicted_anomaly and expected_anomaly:
            fn += 1
            result = "FN"
        else:
            tn += 1
            result = "TN"

        print(
            f"{name:<15} {metrics.suggestion:<15} {metrics.risk_level:<8} "
            f"{'anomaly' if expected_anomaly else 'normal':<10} {result}"
        )

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    accuracy = (tp + tn) / (tp + fp + fn + tn)

    print("\n" + "=" * 60)
    print(f"True Positives:  {tp}")
    print(f"False Positives: {fp}")
    print(f"False Negatives: {fn}")
    print(f"True Negatives:  {tn}")
    print(f"\nAccuracy:  {accuracy:.2%}")
    print(f"Precision: {precision:.2%}")
    print(f"Recall:    {recall:.2%}")
    print(f"F1 Score:  {f1:.2%}")


if __name__ == "__main__":
    calculate_metrics()
