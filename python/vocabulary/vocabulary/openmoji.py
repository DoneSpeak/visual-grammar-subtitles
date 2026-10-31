from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from .config import VocabularyError


@dataclass(frozen=True)
class Emoji:
    hexcode: str
    annotation: str
    group: str
    subgroup: str
    tags: tuple[str, ...] = field(default_factory=tuple)
    openmoji_tags: tuple[str, ...] = field(default_factory=tuple)
    unicode: bool = False

    @property
    def search_tokens(self) -> frozenset[str]:
        tokens = {self.annotation.lower()}
        tokens.update(tag.strip().lower() for tag in self.tags if tag.strip())
        tokens.update(tag.strip().lower() for tag in self.openmoji_tags if tag.strip())
        tokens.add(self.subgroup.replace("-", " ").lower())
        return frozenset(tokens)


def load_index(metadata_path: Path) -> dict[str, Emoji]:
    try:
        rows = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:  # pragma: no cover - corrupted cache
        raise VocabularyError(f"Cannot parse {metadata_path}: {exc}") from exc
    index: dict[str, Emoji] = {}
    for row in rows:
        hexcode = str(row.get("hexcode", "")).upper()
        if not hexcode:
            continue
        index[hexcode] = Emoji(
            hexcode=hexcode,
            annotation=str(row.get("annotation", "")),
            group=str(row.get("group", "")),
            subgroup=str(row.get("subgroups", "")),
            tags=tuple(filter(None, str(row.get("tags", "")).split(","))),
            openmoji_tags=tuple(
                filter(None, str(row.get("openmoji_tags", "")).split(","))
            ),
            unicode=bool(row.get("unicode")),
        )
    if not index:
        raise VocabularyError(f"OpenMoji metadata is empty: {metadata_path}")
    return index


def svg_path(svg_dir: Path, hexcode: str) -> Path:
    return svg_dir / f"{hexcode}.svg"
