"""Run the real application against isolated local acceptance storage.

No dependency overrides: routes, JWT, database, migrations and image analysis are real.
Only outbound notifications are disabled. Never use this entry point for deployment.
"""
import os
from pathlib import Path
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / ".agentwork" / "design-system" / "p5-live"
WORK.mkdir(parents=True, exist_ok=True)
os.environ.update({
    "DB_TYPE": "sqlite",
    "DB_SQLITE_PATH": (WORK / "acceptance.sqlite").as_posix(),
    "STORAGE_TYPE": "local",
    "STORAGE_LOCAL_PATH": (WORK / "uploads").as_posix(),
    "JWT_SECRET_KEY": secrets.token_urlsafe(48),
    "APP_DEBUG": "false",
    "BARK_DEVICE_KEY": "",
    "WECHAT_WORK_WEBHOOK_URL": "",
    "CORS_ORIGINS": "http://127.0.0.1:4206",
})
os.chdir(ROOT / "backend")
sys.path.insert(0, str(ROOT / "backend"))
subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)

from app.services import notification_service  # noqa: E402

class LocalNotifier:
    def send(self, **kwargs):
        return None

notification_service.get_notifier = LocalNotifier

from app.main import app  # noqa: E402
import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8008, access_log=False)
