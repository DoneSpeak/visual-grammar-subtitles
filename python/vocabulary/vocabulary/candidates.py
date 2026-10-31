"""Automatic candidate generation for human review (never auto-approved)."""

from __future__ import annotations

import re
from pathlib import Path

from .config import LEVEL_RANK, VocabularyError
from .openjlpt import VocabEntry
from .openmoji import Emoji
from .yamlutil import write_yaml

WORD = re.compile(r"[a-z0-9]+")
LEADING = re.compile(r"^(to|a|an|the)\s+")
STOPWORDS = {
    "to",
    "a",
    "an",
    "the",
    "of",
    "in",
    "on",
    "at",
    "for",
    "with",
    "and",
    "or",
    "be",
    "being",
    "become",
    "make",
    "do",
    "one",
    "someone",
    "something",
}


def normalize_term(value: str) -> str:
    value = LEADING.sub("", value.strip().lower())
    value = value.replace("-", " ")
    return " ".join(WORD.findall(value))


def emoji_terms(emoji: Emoji) -> set[str]:
    terms = set(WORD.findall(emoji.annotation.lower()))
    for tag in (*emoji.tags, *emoji.openmoji_tags):
        terms.update(WORD.findall(tag.lower()))
    terms.update(WORD.findall(emoji.subgroup.replace("-", " ")))
    return terms - STOPWORDS


def match_candidates(
    entries: dict[str, VocabEntry],
    emoji_index: dict[str, Emoji],
    max_candidates: int = 3,
) -> list[dict]:
    terms = {hexcode: emoji_terms(emoji) for hexcode, emoji in emoji_index.items()}
    words = []
    for entry in sorted(
        entries.values(), key=lambda item: (LEVEL_RANK[item.level], item.reading, item.word)
    ):
        normalized = [(meaning, normalize_term(meaning)) for meaning in entry.meanings]
        scored: list[tuple[int, str, list[str]]] = []
        for hexcode, emoji in emoji_index.items():
            matched = [meaning for meaning, norm in normalized if norm and norm in terms[hexcode]]
            if not matched:
                continue
            head = normalize_term(entry.meanings[0]).split()
            bonus = 2 if emoji.annotation.lower() in {norm for _, norm in normalized} else 0
            if head and head[-1] in terms[hexcode]:
                bonus += 1
            scored.append((bonus, hexcode, matched))
        if not scored:
            continue
        scored.sort(key=lambda item: (-item[0], item[1]))
        words.append(
            {
                "word": entry.word,
                "reading": entry.reading,
                "level": entry.level,
                "meanings": list(entry.meanings),
                "candidates": [
                    {
                        "hexcode": hexcode,
                        "annotation": emoji_index[hexcode].annotation,
                        "group": emoji_index[hexcode].group,
                        "matched": matched,
                    }
                    for _, hexcode, matched in scored[:max_candidates]
                ],
            }
        )
    return words


def write_candidates(
    language: str,
    entries: dict[str, VocabEntry],
    emoji_index: dict[str, Emoji],
    out: Path,
    openmoji_version: str,
    openjlpt_commit: str,
    max_candidates: int = 3,
) -> Path:
    words = match_candidates(entries, emoji_index, max_candidates)
    if not words:
        raise VocabularyError("Candidate matching produced no results; check the sources")
    write_yaml(
        out,
        {
            "schemaVersion": 1,
            "language": language,
            "means": "candidate generation only; nothing here is approved for publishing",
            "generatedFrom": {
                "openmoji": openmoji_version,
                "openjlpt": openjlpt_commit,
            },
            "wordCount": len(words),
            "words": words,
        },
    )
    return out
