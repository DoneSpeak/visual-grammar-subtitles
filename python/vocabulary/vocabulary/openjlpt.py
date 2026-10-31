from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path

from .config import VocabularyError

ID_PATTERN = re.compile(r"^[0-9a-f]{10}$")


@dataclass(frozen=True)
class VocabEntry:
    id: str
    word: str
    reading: str
    romaji: str
    meanings: tuple[str, ...]
    level: str
    pos: tuple[str, ...]
    other_forms: tuple[str, ...]

    @property
    def forms(self) -> tuple[str, ...]:
        return (self.word, *self.other_forms)


def _split_semicolon(value: str) -> tuple[str, ...]:
    return tuple(part.strip() for part in value.split(";") if part.strip())


def load_level(path: Path, level: str) -> list[VocabEntry]:
    with path.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    entries: list[VocabEntry] = []
    for line_no, row in enumerate(rows, start=2):
        entry_id = (row.get("id") or "").strip()
        word = (row.get("word") or "").strip()
        reading = (row.get("reading") or "").strip()
        if not entry_id or not word or not reading:
            raise VocabularyError(f"{path.name}:{line_no}: missing id/word/reading")
        if not ID_PATTERN.match(entry_id):
            raise VocabularyError(f"{path.name}:{line_no}: invalid id {entry_id!r}")
        if (row.get("level") or "").strip() != level:
            raise VocabularyError(
                f"{path.name}:{line_no}: expected level {level}, got {row.get('level')!r}"
            )
        entries.append(
            VocabEntry(
                id=entry_id,
                word=word,
                reading=reading,
                romaji=(row.get("romaji") or "").strip(),
                meanings=_split_semicolon(row.get("meanings") or ""),
                level=level,
                pos=_split_semicolon(row.get("pos") or ""),
                other_forms=_split_semicolon(row.get("other_forms") or ""),
            )
        )
    if not entries:
        raise VocabularyError(f"No vocabulary rows in {path}")
    ids = [entry.id for entry in entries]
    if len(ids) != len(set(ids)):
        raise VocabularyError(f"Duplicate vocabulary ids in {path}")
    return entries


def load_vocabulary(csvs: dict[str, Path], levels: tuple[str, ...]) -> dict[str, VocabEntry]:
    entries: dict[str, VocabEntry] = {}
    for level in levels:
        if level not in csvs:
            raise VocabularyError(f"No vocab CSV configured for level {level}")
        for entry in load_level(csvs[level], level):
            entries[entry.id] = entry
    return entries
