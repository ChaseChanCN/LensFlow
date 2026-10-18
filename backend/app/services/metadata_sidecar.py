"""Deterministic descriptive-only XMP. XML serializer handles untrusted text."""

from xml.etree import ElementTree as ET

NS = {
    "x": "adobe:ns:meta/",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "dc": "http://purl.org/dc/elements/1.1/",
}
for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)


def q(prefix, name):
    return "{" + NS[prefix] + "}" + name


def serialize_sidecar(effective):
    root = ET.Element(q("x", "xmpmeta"))
    rdf = ET.SubElement(root, q("rdf", "RDF"))
    description = ET.SubElement(rdf, q("rdf", "Description"), {q("rdf", "about"): ""})
    for field, name, shape in [
        ("title", "title", "Alt"),
        ("caption", "description", "Alt"),
        ("creator", "creator", "Seq"),
        ("copyright", "rights", "Alt"),
        ("keywords", "subject", "Bag"),
    ]:
        value = effective[field]
        container = ET.SubElement(ET.SubElement(description, q("dc", name)), q("rdf", shape))
        values = value if field == "keywords" else [value] if value is not None else []
        # Empty containers express explicit absence; no raw XMP or technical fields copied.
        for text in values:
            attrs = (
                {"{http://www.w3.org/XML/1998/namespace}lang": "x-default"}
                if shape == "Alt"
                else {}
            )
            ET.SubElement(container, q("rdf", "li"), attrs).text = text
    result = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    if len(result) > 128 * 1024:
        raise ValueError("XMP output budget exceeded")
    return result
