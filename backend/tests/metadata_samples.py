"""Constructed metadata injected into a real photograph, NOT camera-original files."""

import struct

from tests.media_fixtures import SAMPLE

XMP_HEADER = b"http://ns.adobe.com/xap/1.0/\0"


def segment(marker, payload):
    assert len(payload) <= 65533
    return bytes([255, marker]) + struct.pack(">H", len(payload) + 2) + payload


def inject(*segments):
    data = SAMPLE.read_bytes()
    return data[:2] + b"".join(segments) + data[2:]


def exif_segment(root=(), exif=(), gps=(), *, endian="<"):
    tables = [list(root), list(exif), list(gps)]
    if exif:
        tables[0].append((34665, 4, 0))
    if gps:
        tables[0].append((34853, 4, 0))
    offsets, pos = [], 8
    for table in tables:
        offsets.append(pos)
        pos += 6 + 12 * len(table)
    head = bytearray((b"II" if endian == "<" else b"MM") + struct.pack(endian + "HI", 42, 8))
    values = bytearray()
    for table in tables:
        head += struct.pack(endian + "H", len(table))
        for tag, kind, value in table:
            if tag in (34665, 34853):
                value = offsets[1 if tag == 34665 else 2]
            if kind == 2:
                raw = (value.encode("utf-8") if isinstance(value, str) else value) + b"\0"
                count = len(raw)
            elif kind in (5, 10):
                count = len(value)
                raw = b"".join(
                    struct.pack(endian + ("II" if kind == 5 else "ii"), *pair) for pair in value
                )
            else:
                value = value if isinstance(value, list) else [value]
                count = len(value)
                raw = struct.pack(endian + {1: "B", 3: "H", 4: "I"}[kind] * count, *value)
            head += struct.pack(endian + "HHI", tag, kind, count)
            if len(raw) <= 4:
                head += raw.ljust(4, b"\0")
            else:
                head += struct.pack(endian + "I", pos + len(values))
                values += raw
        head += b"\0" * 4
    return segment(0xE1, b"Exif\0\0" + bytes(head + values))


def common_exif(make="Canon", *, endian="<", orientation=6, offset="+08:00"):
    return exif_segment(
        [
            (271, 2, make),
            (272, 2, make + " constructed sample"),
            (274, 3, orientation),
            (315, 2, "摄影师"),
            (33432, 2, "© 示例"),
        ],
        [
            (42035, 2, make),
            (42036, 2, "Constructed 50mm"),
            (42033, 2, "PRIVATE-SERIAL"),
            (36867, 2, "2026:10:17 14:32:18"),
            (36881, 2, offset),
            (37521, 2, "123456789"),
            (33434, 5, [(1, 125)]),
            (33437, 5, [(28, 10)]),
            (34855, 3, 400),
            (37386, 5, [(50, 1)]),
            (41989, 3, 80),
            (37380, 10, [(-1, 3)]),
            (37385, 3, 1),
            (40961, 3, 1),
        ],
        [
            (1, 2, "N"),
            (2, 5, [(30, 1), (15, 1), (0, 1)]),
            (3, 2, "E"),
            (4, 5, [(120, 1), (30, 1), (0, 1)]),
            (5, 1, 1),
            (6, 5, [(10, 1)]),
        ],
        endian=endian,
    )


def xmp_segment(properties, *, encoding="utf-8"):
    xml = (
        '<x:xmpmeta xmlns:x="adobe:ns:meta/" '
        'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" '
        'xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" xmlns:exif="http://ns.adobe.com/exif/1.0/">'
        "<rdf:RDF><rdf:Description>" + properties + "</rdf:Description></rdf:RDF></x:xmpmeta>"
    )
    return segment(0xE1, XMP_HEADER + xml.encode(encoding))


def iptc_segment(fields):
    packet = b"\x1c\x01\x5a\x00\x03\x1b%G"
    for tag, value in fields:
        raw = value.encode("utf-8")
        packet += b"\x1c\x02" + bytes([tag]) + struct.pack(">H", len(raw)) + raw
    payload = b"Photoshop 3.0\0" + b"8BIM\x04\x04\0\0" + struct.pack(">I", len(packet)) + packet
    return segment(0xED, payload + (b"\0" if len(packet) % 2 else b""))
