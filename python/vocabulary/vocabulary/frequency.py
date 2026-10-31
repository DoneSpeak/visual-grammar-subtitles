"""Subtitle frequency (F): janome base-form counts over a real subtitle corpus."""

from __future__ import annotations

import html
import re
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

from .config import VocabularyError
from .openjlpt import VocabEntry

TIMESTAMP = re.compile(r"^\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->")
INLINE_TAG = re.compile(r"<[^>]+>|\{\\[^}]*\}")
SUBTITLE_SUFFIXES = {".srt", ".vtt", ".ass", ".ssa"}


@dataclass
class FrequencyCorpus:
    files: int
    characters: int
    tokens: int
    counts: Counter = field(default_factory=Counter)

    @property
    def available(self) -> bool:
        return self.files > 0 and self.tokens > 0

    def entry_count(self, entry: VocabEntry) -> int:
        forms = {entry.word, entry.reading, *entry.other_forms}
        return max((self.counts.get(form, 0) for form in forms), default=0)


def extract_text(raw: str) -> str:
    lines: list[str] = []
    for line in raw.replace("﻿", "").splitlines():
        stripped = line.strip()
        if not stripped or stripped.isdigit() or TIMESTAMP.match(stripped):
            continue
        if stripped.upper() == "WEBVTT":
            continue
        cleaned = html.unescape(INLINE_TAG.sub("", stripped)).strip()
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines)


def subtitle_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in SUBTITLE_SUFFIXES
    )


def build_corpus(root: Path) -> FrequencyCorpus:
    """Tokenize every subtitle under *root* once, recording base forms."""
    from janome.tokenizer import Tokenizer

    files = subtitle_files(root)
    if not files:
        return FrequencyCorpus(files=0, characters=0, tokens=0)
    tokenizer = Tokenizer()
    counts: Counter = Counter()
    characters = 0
    tokens = 0
    for path in files:
        try:
            text = extract_text(path.read_text(encoding="utf-8", errors="replace"))
        except OSError as exc:
            raise VocabularyError(f"Cannot read subtitle {path}: {exc}") from exc
        characters += len(text)
        for token in tokenizer.tokenize(text):
            base = token.base_form
            if not base or base == "*":
                base = token.surface
            if base.strip():
                counts[base] += 1
                tokens += 1
    return FrequencyCorpus(files=len(files), characters=characters, tokens=tokens, counts=counts)
