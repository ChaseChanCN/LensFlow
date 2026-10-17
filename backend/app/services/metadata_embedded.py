"""Bounded IPTC IIM and standard embedded XMP subsets, with no I/O in XML."""

import re
import unicodedata
from xml.etree.ElementTree import Element
from xml.parsers import expat

from app.services.metadata_segments import MAX_XML, too_large

MAX_TEXT = 1024
MAX_CAPTION = 4096
MAX_KEYWORDS = 64
MAX_XML_NODES = 2048
MAX_XML_DEPTH = 16
DC = "http://purl.org/dc/elements/1.1/}"
RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#}"
XML_LANG = "http://www.w3.org/XML/1998/namespace}lang"
XMP = "http://ns.adobe.com/xap/1.0/}"
PS = "http://ns.adobe.com/photoshop/1.0/}"
EX = "http://ns.adobe.com/exif/1.0/}"


def clean_text(value, warnings, *, limit=MAX_TEXT):
    if isinstance(value, bytes):
        # EXIF ASCII in practice sometimes contains UTF-8. Never interpret HTML.
        try:
            value = value.decode("utf-8")
        except UnicodeDecodeError:
            warnings.add("text.invalid_encoding")
            return None
    if not isinstance(value, str):
        return None
    sanitized = "".join(
        c for c in value if not unicodedata.category(c).startswith("C") or c in "\n\t"
    )
    if sanitized != value:
        warnings.add("text.controls_removed")
    if len(sanitized) > limit:
        warnings.add("text.truncated")
    return sanitized[:limit].strip() or None


def keywords(values, warnings):
    result = []
    for value in values:
        text = clean_text(value, warnings, limit=128)
        if text and text not in result:
            if len(result) >= MAX_KEYWORDS:
                warnings.add("keywords.truncated")
                break
            result.append(text)
    return result


def iptc_fields(blocks, warnings):
    """Photoshop APP13 / 8BIM resource 0x0404 / IIM records 1 and 2 only."""
    records, resources = [], 0
    try:
        for data in blocks:
            p = 0
            while p < len(data):
                resources += 1
                if resources > 128:
                    too_large()
                if data[p : p + 4] != b"8BIM" or p + 7 > len(data):
                    raise ValueError
                resource = int.from_bytes(data[p + 4 : p + 6], "big")
                n = data[p + 6]
                p += 6 + (n + 2) // 2 * 2
                if p + 4 > len(data):
                    raise ValueError
                length = int.from_bytes(data[p : p + 4], "big")
                p += 4
                if p + length > len(data):
                    raise ValueError
                packet = data[p : p + length]
                p += length + length % 2
                if p > len(data):
                    raise ValueError
                if resource != 0x0404:
                    continue
                q = 0
                while q < len(packet):
                    if q + 5 > len(packet) or packet[q] != 0x1C:
                        raise ValueError
                    record, tag = packet[q + 1 : q + 3]
                    size = int.from_bytes(packet[q + 3 : q + 5], "big")
                    q += 5
                    if size & 0x8000:
                        octets = size & 0x7FFF
                        if not 1 <= octets <= 4 or q + octets > len(packet):
                            raise ValueError
                        size = int.from_bytes(packet[q : q + octets], "big")
                        q += octets
                    if q + size > len(packet):
                        raise ValueError
                    records.append((record, tag, packet[q : q + size]))
                    if len(records) > 512:
                        too_large()
                    q += size
    except ValueError:
        warnings.add("iptc.invalid_packet")
        # Partial records from malformed packets are not trusted.
        return {}
    utf8 = any(r == 1 and t == 90 and v == b"\x1b%G" for r, t, v in records)
    if records and not utf8:
        warnings.add("iptc.latin1_fallback")
    out = {}
    mapping = {5: "title", 120: "caption", 80: "creator", 116: "copyright", 55: "date", 60: "time"}
    words = []
    for record, tag, value in records:
        if record != 2 or tag not in {*mapping, 25}:
            continue
        try:
            text = clean_text(
                value.decode("utf-8" if utf8 else "latin-1"),
                warnings,
                limit=MAX_CAPTION if tag == 120 else MAX_TEXT,
            )
        except UnicodeDecodeError:
            warnings.add("iptc.invalid_encoding")
            continue
        if tag == 25:
            if text:
                words.append(text)
        elif mapping[tag] in out:
            warnings.add("iptc.duplicate_field")
        elif text:
            out[mapping[tag]] = text
    out["keywords"] = keywords(words, warnings)
    return out


class UnsafeXML(ValueError):
    pass


def safe_xml(packet):
    if len(packet) > MAX_XML:
        too_large()
    parser = expat.ParserCreate(namespace_separator="}")
    stack, roots = [], []
    nodes = 0

    def forbidden(*_):
        raise UnsafeXML

    def start(name, attrs):
        nonlocal nodes
        nodes += 1
        if nodes > MAX_XML_NODES or len(stack) >= MAX_XML_DEPTH or len(attrs) > 32:
            too_large()
        if len(name) > 512 or any(len(k) > 512 or len(v) > MAX_CAPTION for k, v in attrs.items()):
            too_large()
        node = Element(name, attrs)
        if stack:
            stack[-1].append(node)
        else:
            roots.append(node)
        stack.append(node)

    def characters(value):
        if stack:
            node = stack[-1]
            if len(node.text or "") + len(value) > MAX_CAPTION:
                too_large()
            node.text = (node.text or "") + value

    parser.StartElementHandler = start
    parser.EndElementHandler = lambda _: stack.pop()
    parser.CharacterDataHandler = characters
    parser.StartDoctypeDeclHandler = forbidden
    parser.EntityDeclHandler = forbidden
    parser.ExternalEntityRefHandler = forbidden
    parser.SetParamEntityParsing(expat.XML_PARAM_ENTITY_PARSING_NEVER)
    parser.Parse(packet, True)
    return roots[0]


def xmp_fields(packet, warnings):
    if packet is None:
        return {}
    try:
        root = safe_xml(packet)
    except (expat.ExpatError, UnsafeXML, IndexError):
        warnings.add("xmp.invalid_or_unsafe_packet")
        return {}
    mapping = {
        DC + "title": "title",
        DC + "description": "caption",
        DC + "creator": "creator",
        DC + "rights": "copyright",
        DC + "subject": "keywords",
        XMP + "CreateDate": "create_date",
        PS + "DateCreated": "date",
        EX + "GPSLatitude": "latitude",
        EX + "GPSLongitude": "longitude",
    }
    out, localized = {}, {}

    def save(name, values, languages=None):
        if name in out:
            warnings.add("xmp.duplicate_field")
            return
        if name == "keywords":
            out[name] = keywords(values, warnings)
        else:
            cleaned = [
                v
                for raw in values
                if (
                    v := clean_text(
                        raw, warnings, limit=MAX_CAPTION if name == "caption" else MAX_TEXT
                    )
                )
            ]
            if cleaned:
                out[name] = cleaned[0]
        if languages:
            localized[name] = languages

    for node in root.iter():
        # Only RDF description attributes are compact XMP properties.
        if node.tag == RDF + "Description":
            for key, value in node.attrib.items():
                if key in mapping:
                    save(mapping[key], [value])
        if node.tag not in mapping:
            continue
        name = mapping[node.tag]
        alt = next((child for child in node if child.tag == RDF + "Alt"), None)
        if alt is not None:
            langs = {}
            for item in alt:
                if item.tag != RDF + "li":
                    continue
                lang = item.get(XML_LANG, "")
                if not re.fullmatch(r"[A-Za-z0-9-]{1,35}", lang):
                    warnings.add("xmp.invalid_language")
                    continue
                if lang in langs:
                    warnings.add("xmp.duplicate_language")
                    continue
                if value := clean_text(
                    item.text, warnings, limit=MAX_CAPTION if name == "caption" else MAX_TEXT
                ):
                    if len(langs) >= 16:
                        too_large()
                    langs[lang] = value
            selected = langs.get("x-default")
            if selected is None and langs:
                selected = langs[sorted(langs)[0]]
                warnings.add("xmp.language_fallback")
            save(name, [selected] if selected else [], langs)
        else:
            values = [
                item.text
                for child in node
                if child.tag in (RDF + "Seq", RDF + "Bag")
                for item in child
                if item.tag == RDF + "li"
            ]
            save(name, values if values else [node.text])
    out["localized"] = localized
    return out
