from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path

from .config import VocabularyError
from .svgcheck import check_svg_bytes


@dataclass(frozen=True)
class Asset:
    hexcode: str
    path: str
    sha256: str
    bytes: int


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def publish_svg(source: Path, dest_dir: Path, hexcode: str, relative_dir: str) -> Asset:
    if not source.is_file():
        raise VocabularyError(f"OpenMoji asset missing for {hexcode}: {source}")
    data = source.read_bytes()
    check_svg_bytes(data, name=source.name)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{hexcode}.svg"
    if not dest.exists() or dest.read_bytes() != data:
        dest.write_bytes(data)
    return Asset(
        hexcode=hexcode,
        path=f"{relative_dir}/{hexcode}.svg",
        sha256=sha256_bytes(data),
        bytes=len(data),
    )
