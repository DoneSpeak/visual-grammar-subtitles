"""Reject SVGs that could execute code or reach the network."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

FORBIDDEN_TAGS = {"script", "foreignobject", "image", "iframe", "object", "embed"}
URL_IN_STYLE = re.compile(r"(url\s*\(|@import)", re.IGNORECASE)
DOCTYPE = re.compile(r"<!\s*(DOCTYPE|ENTITY)", re.IGNORECASE)


class SvgValidationError(ValueError):
    pass


def _local(name: str) -> str:
    return name.rsplit("}", 1)[-1].lower()


def check_svg_bytes(data: bytes, name: str = "svg") -> None:
    text = data.decode("utf-8", errors="replace")
    if DOCTYPE.search(text):
        raise SvgValidationError(f"{name}: DOCTYPE/ENTITY declarations are not allowed")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        raise SvgValidationError(f"{name}: malformed XML ({exc})") from exc
    for element in root.iter():
        tag = _local(element.tag)
        if tag in FORBIDDEN_TAGS:
            raise SvgValidationError(f"{name}: forbidden element <{tag}>")
        for raw_attr, value in element.attrib.items():
            attr = _local(raw_attr)
            if attr.startswith("on"):
                raise SvgValidationError(f"{name}: event handler attribute {attr}")
            if attr in {"href", "src"} and not value.startswith("#"):
                raise SvgValidationError(f"{name}: external reference in {attr}={value!r}")
            if attr == "style" and URL_IN_STYLE.search(value):
                raise SvgValidationError(f"{name}: remote/imported style in style attribute")
            if value.lower().startswith("javascript:"):
                raise SvgValidationError(f"{name}: javascript: URL in {attr}")
        if tag == "style" and element.text and URL_IN_STYLE.search(element.text):
            raise SvgValidationError(f"{name}: remote/imported style in <style>")
