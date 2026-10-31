"""Reviewed word -> concept -> OpenMoji mappings.

Only entries listed under ``mappings`` can appear in the published YAML. The file
is the human/AI review artifact; nothing is inferred at build time.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from .config import VocabularyError
from .openjlpt import VocabEntry
from .yamlutil import load_yaml

CONCEPT_ID = re.compile(r"^[a-z0-9]+(\.[a-z0-9_]+)+$")
REVIEW_STATES = {"pending", "approved", "rejected"}


@dataclass(frozen=True)
class Concept:
    id: str
    category: str
    hexcode: str
    visual_score: float | None
    review_status: str
    reviewed_by: str
    reviewed_at: str
    gloss: dict[str, str]


@dataclass(frozen=True)
class Mapping:
    lemma: str
    reading: str | None
    concept_id: str
    entry: VocabEntry


@dataclass(frozen=True)
class Curation:
    concepts: dict[str, Concept]
    mappings: tuple[Mapping, ...]

    def by_entry(self) -> dict[str, list[Mapping]]:
        grouped: dict[str, list[Mapping]] = {}
        for mapping in self.mappings:
            grouped.setdefault(mapping.entry.id, []).append(mapping)
        return grouped


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise VocabularyError(message)


def load_curation(
    path: Path,
    vocabulary: dict[str, VocabEntry],
    known_hexcodes: set[str],
    category_relevance: dict[str, float],
) -> Curation:
    raw = load_yaml(path) or {}
    _require(raw.get("schemaVersion") == 1, f"{path.name}: schemaVersion must be 1")

    concepts: dict[str, Concept] = {}
    for item in raw.get("concepts") or []:
        concept_id = str(item.get("id", "")).strip()
        _require(bool(CONCEPT_ID.match(concept_id)), f"Invalid concept id: {concept_id!r}")
        _require(concept_id not in concepts, f"Duplicate concept id: {concept_id}")
        hexcode = str(item.get("hexcode", "")).strip().upper()
        _require(hexcode in known_hexcodes, f"{concept_id}: unknown OpenMoji hexcode {hexcode!r}")
        category = str(item.get("category", "")).strip()
        _require(category in category_relevance, f"{concept_id}: unknown category {category!r}")
        status = str(item.get("reviewStatus", "pending"))
        _require(status in REVIEW_STATES, f"{concept_id}: invalid reviewStatus {status!r}")
        visual = item.get("visualScore")
        if visual is not None:
            _require(
                isinstance(visual, (int, float)) and 0 <= visual <= 100,
                f"{concept_id}: visualScore must be 0-100",
            )
        if status == "approved":
            _require(visual is not None, f"{concept_id}: approved concept needs visualScore")
        gloss = item.get("gloss") or {}
        _require(isinstance(gloss, dict) and bool(gloss.get("en")), f"{concept_id}: gloss.en required")
        concepts[concept_id] = Concept(
            id=concept_id,
            category=category,
            hexcode=hexcode,
            visual_score=float(visual) if visual is not None else None,
            review_status=status,
            reviewed_by=str(item.get("reviewedBy", "")),
            reviewed_at=str(item.get("reviewedAt", "")),
            gloss={str(key): str(value) for key, value in gloss.items()},
        )

    by_form: dict[str, list[VocabEntry]] = {}
    for entry in vocabulary.values():
        for form in {*entry.forms, entry.reading}:
            by_form.setdefault(form, []).append(entry)

    mappings: list[Mapping] = []
    seen: set[tuple[str, str]] = set()
    for item in raw.get("mappings") or []:
        lemma = str(item.get("lemma", "")).strip()
        reading = item.get("reading")
        reading = str(reading).strip() if reading else None
        concept_id = str(item.get("concept", "")).strip()
        _require(concept_id in concepts, f"Mapping {lemma!r} references unknown concept {concept_id!r}")
        concept = concepts[concept_id]
        _require(
            concept.review_status != "rejected",
            f"Mapping {lemma!r} references rejected concept {concept_id}",
        )
        candidates = by_form.get(lemma, [])
        if reading:
            candidates = [entry for entry in candidates if entry.reading == reading]
        _require(bool(candidates), f"Mapping {lemma!r} ({reading or '-'}) is not in the vocabulary source")
        _require(
            len(candidates) == 1,
            f"Mapping {lemma!r} is ambiguous; add a reading. Candidates: "
            + ", ".join(f"{entry.word}/{entry.reading}" for entry in candidates),
        )
        entry = candidates[0]
        key = (entry.id, concept_id)
        _require(key not in seen, f"Duplicate mapping {entry.word} -> {concept_id}")
        seen.add(key)
        mappings.append(Mapping(lemma=lemma, reading=reading, concept_id=concept_id, entry=entry))

    mappings.sort(key=lambda item: (item.entry.level, item.entry.reading, item.entry.word, item.concept_id))
    return Curation(concepts=concepts, mappings=tuple(mappings))
