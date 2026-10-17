"""Bounded JPEG marker and TIFF readers; no pixel decoder or opaque MakerNotes.

These readers accept a deliberately limited JPEG/TIFF subset. Structural validation
does not certify the compressed entropy stream; preview/export still validate pixels.
"""

import hashlib
import struct
from dataclasses import dataclass, field

from app.core.config import settings
from app.core.exceptions import AppException

MAX_METADATA = 2 * 1024 * 1024
MAX_SEGMENTS = 4096
MAX_TAGS = 512
MAX_IFD_TAGS = 256
MAX_XML = 60 * 1024
MAX_ICC = 1024 * 1024


def invalid():
    raise AppException("INVALID_JPEG", "Invalid JPEG structure", status_code=422)


def too_large():
    raise AppException("METADATA_TOO_LARGE", "Metadata exceeds safety limits", status_code=413)


@dataclass
class Segments:
    width: int = 0
    height: int = 0
    exif: bytes | None = None
    xmp: bytes | None = None
    iptc: list[bytes] = field(default_factory=list)
    icc: dict[int, bytes] = field(default_factory=dict)
    icc_count: int | None = None
    warnings: set[str] = field(default_factory=set)


def jpeg_segments(data: bytes) -> Segments:
    if len(data) > settings.image_max_bytes:
        raise AppException("IMAGE_TOO_LARGE", "JPEG exceeds byte limit", status_code=413)
    if not data.startswith(b"\xff\xd8"):
        invalid()
    out = Segments()
    pos, count, total, scans = 2, 0, 0, 0
    entropy = False
    while pos < len(data):
        if entropy:
            pos = data.find(b"\xff", pos)
            if pos < 0:
                invalid()
        if data[pos] != 255:
            invalid()
        while pos < len(data) and data[pos] == 255:
            pos += 1
        if pos >= len(data):
            invalid()
        marker = data[pos]
        pos += 1
        if entropy and (marker == 0 or 0xD0 <= marker <= 0xD7):
            continue
        entropy = False
        count += 1
        if count > MAX_SEGMENTS:
            too_large()
        if marker == 0xD9:
            if not out.width or not scans:
                invalid()
            if pos != len(data):
                out.warnings.add("jpeg.trailing_data")
            return out
        if marker in (0, 0xD8) or 0xD0 <= marker <= 0xD7:
            invalid()
        if marker == 1:  # standalone TEM
            continue
        if pos + 2 > len(data):
            invalid()
        length = int.from_bytes(data[pos : pos + 2], "big")
        if length < 2 or pos + length > len(data):
            invalid()
        payload = data[pos + 2 : pos + length]
        pos += length
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            if marker not in (0xC0, 0xC1, 0xC2):
                raise AppException("UNSUPPORTED_JPEG", "Unsupported JPEG frame", status_code=415)
            if len(payload) < 6 or payload[0] != 8:
                invalid()
            h, w = struct.unpack(">HH", payload[1:5])
            components = payload[5]
            if components not in (1, 3):
                raise AppException(
                    "UNSUPPORTED_COLOR_SPACE", "Unsupported JPEG color mode", status_code=415
                )
            if len(payload) != 6 + components * 3 or not w or not h or out.width:
                invalid()
            if w * h > settings.image_max_pixels or max(w, h) > settings.image_max_dimension:
                raise AppException(
                    "IMAGE_TOO_LARGE", "JPEG dimensions exceed limits", status_code=413
                )
            out.width, out.height = w, h
        if 0xE0 <= marker <= 0xEF or marker == 0xFE:
            total += len(payload)
            if total > MAX_METADATA:
                too_large()
        if marker == 0xE1 and payload.startswith(b"Exif\0\0"):
            if out.exif is None:
                out.exif = payload[6:]
            else:
                out.warnings.add("exif.duplicate_packet")
        elif marker == 0xE1 and payload.startswith(b"http://ns.adobe.com/xap/1.0/\0"):
            packet = payload[29:]
            if len(packet) > MAX_XML:
                too_large()
            if out.xmp is None:
                out.xmp = packet
            else:
                out.warnings.add("xmp.duplicate_packet")
        elif marker == 0xE1 and payload.startswith(b"http://ns.adobe.com/xmp/extension/\0"):
            out.warnings.add("xmp.extended_unsupported")
        elif marker == 0xED and payload.startswith(b"Photoshop 3.0\0"):
            out.iptc.append(payload[14:])
        elif marker == 0xE2 and payload.startswith(b"ICC_PROFILE\0"):
            if len(payload) < 14 or not 1 <= payload[12] <= payload[13]:
                out.warnings.add("icc.invalid_chunks")
            elif payload[12] in out.icc or out.icc_count not in (None, payload[13]):
                out.warnings.add("icc.invalid_chunks")
            else:
                out.icc_count = payload[13]
                out.icc[payload[12]] = payload[14:]
                if sum(map(len, out.icc.values())) > MAX_ICC:
                    too_large()
        if marker == 0xDA:
            if not out.width or len(payload) < 4 or len(payload) != 4 + 2 * payload[0]:
                invalid()
            scans += 1
            if scans > 256:
                too_large()
            entropy = True
    invalid()


# Explicit accepted TIFF types. Unknown tags (including MakerNote) are never decoded.
ROOT = {
    271: (2,),
    272: (2,),
    274: (3,),
    270: (2,),
    315: (2,),
    33432: (2,),
    34665: (4,),
    34853: (4,),
}
EXIF = {
    36867: (2,),
    36881: (2,),
    37521: (2,),
    33434: (5,),
    33437: (5,),
    34855: (3, 4),
    37386: (5,),
    41989: (3,),
    37380: (10,),
    37385: (3,),
    40961: (3,),
    42035: (2,),
    42036: (2,),
    42033: (2,),
}
GPS = {1: (2,), 2: (5,), 3: (2,), 4: (5,), 5: (1,), 6: (5,)}


def tiff_fields(data: bytes, warnings: set[str]) -> tuple[dict, dict, dict]:
    """Only IFD0 and its one EXIF/GPS child; never follow thumbnail/next IFDs."""
    try:
        if len(data) < 8 or data[:2] not in (b"II", b"MM"):
            raise ValueError
        endian = "<" if data[:2] == b"II" else ">"

        def unpack(fmt, offset):
            size = struct.calcsize(fmt)
            if offset < 0 or offset + size > len(data):
                raise ValueError
            return struct.unpack_from(endian + fmt, data, offset)

        if unpack("H", 2)[0] != 42:
            raise ValueError
        seen, total = set(), 0

        def ifd(offset, allowed):
            nonlocal total
            if not isinstance(offset, int) or offset < 8 or offset in seen:
                raise ValueError
            seen.add(offset)
            n = unpack("H", offset)[0]
            total += n
            if n > MAX_IFD_TAGS or total > MAX_TAGS:
                too_large()
            if offset + 2 + 12 * n + 4 > len(data):
                raise ValueError
            result, tags = {}, set()
            for i in range(n):
                p = offset + 2 + i * 12
                tag, kind, count = unpack("HHI", p)
                if tag in tags:
                    warnings.add("exif.duplicate_tag")
                    continue
                tags.add(tag)
                if tag not in allowed:
                    continue
                if kind not in allowed[tag] or not count:
                    warnings.add("exif.invalid_type")
                    continue
                expected = 3 if allowed is GPS and tag in (2, 4) else 1
                if kind != 2 and count != expected:
                    warnings.add("exif.invalid_count")
                    continue
                unit = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 10: 8}[kind]
                if (kind == 2 and count > 4096) or (kind != 2 and count > 3):
                    warnings.add("exif.invalid_count")
                    continue
                length = count * unit
                start = p + 8 if length <= 4 else unpack("I", p + 8)[0]
                if start < 0 or start + length > len(data):
                    warnings.add("exif.invalid_offset")
                    continue
                if kind == 2:
                    result[tag] = data[start : start + length].rstrip(b"\0")
                elif kind in (5, 10):
                    values = [
                        unpack("II" if kind == 5 else "ii", start + j * 8) for j in range(count)
                    ]
                    if any(d == 0 for _, d in values):
                        warnings.add("exif.invalid_rational")
                        continue
                    result[tag] = [a / b for a, b in values]
                else:
                    fmt = {1: "B", 3: "H", 4: "I"}[kind]
                    values = unpack(fmt * count, start)
                    result[tag] = values[0] if count == 1 else list(values)
            return result

        root = ifd(unpack("I", 4)[0], ROOT)
        children = []
        for pointer, allowed in ((34665, EXIF), (34853, GPS)):
            try:
                children.append(ifd(root[pointer], allowed) if pointer in root else {})
            except (ValueError, struct.error):
                warnings.add("exif.invalid_ifd")
                children.append({})
        return root, *children
    except (ValueError, struct.error):
        warnings.add("exif.invalid_packet")
        return {}, {}, {}


def source_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
