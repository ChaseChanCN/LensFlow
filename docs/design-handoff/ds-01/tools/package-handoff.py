"""仅打包DS-01交接文件，排除临时缓存和压缩包自身；不读取其他仓库内容。"""
from pathlib import Path
import hashlib
import json
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
target = root / "lensflow-ds-01-codearts.zip"
files = list(root.glob("*.md")) + [root / ".gitignore"]
for folder in ("tokens", "references", "evidence", "tools"):
    files.extend(p for p in (root / folder).rglob("*") if p.is_file() and "__pycache__" not in p.parts)
files = sorted(set(files))
assert all(root in p.resolve().parents for p in files)
with ZipFile(target, "w", ZIP_DEFLATED) as archive:
    for item in files:
        archive.write(item, "ds-01/" + item.relative_to(root).as_posix())
with ZipFile(target) as archive:
    assert archive.testzip() is None
    assert not any(".preview-cache" in name or "preview-env" in name for name in archive.namelist())
    for item in files:
        assert archive.read("ds-01/" + item.relative_to(root).as_posix()) == item.read_bytes()
print(json.dumps({"archive": str(target), "files": len(files), "bytes": target.stat().st_size,
                  "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "cacheExcluded": True,
                  "crcAndByteComparisonPassed": True}, ensure_ascii=False))
