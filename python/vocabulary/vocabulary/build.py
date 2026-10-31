"""Build the per-language vocabulary YAML plus the shared OpenMoji asset set."""

from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from .assets import Asset, publish_svg
from .config import (
    CONCEPTS_DIR,
    DEFAULT_LEVELS,
    DEFAULT_SUBTITLES,
    DIST_DIR,
    LEVEL_RANK,
    REPORT_DIR,
    REPO_ROOT,
    RELEVANCE_FILE,
    VocabularyError,
)
from .curation import Curation, load_curation
from .frequency import FrequencyCorpus, build_corpus
from .openjlpt import VocabEntry, load_vocabulary
from .openmoji import Emoji, load_index, svg_path
from .scoring import frequency_score, reuse_score, total_score
from .sources import Sources
from .yamlutil import load_yaml, write_yaml

MIN_VISUAL_SCORE = 60
ASSET_RELATIVE_DIR = "assets/openmoji"
OPENMOJI_ATTRIBUTION = (
    "All emojis designed by OpenMoji - the open-source emoji and icon project. "
    "License: CC BY-SA 4.0."
)
BUDGETS = ((100, 1_000_000), (300, 2_000_000), (500, 3_000_000))


@dataclass(frozen=True)
class BuildConfig:
    language: str = "ja"
    levels: tuple[str, ...] = DEFAULT_LEVELS
    subtitles: Path | None = DEFAULT_SUBTITLES
    out_dir: Path = DIST_DIR
    report_dir: Path = REPORT_DIR
    concepts_file: Path | None = None

    def resolved_concepts_file(self) -> Path:
        return self.concepts_file or _concepts_file(self.language)


def _concepts_file(language: str) -> Path:
    path = CONCEPTS_DIR / f"{language}.yaml"
    if not path.exists():
        raise VocabularyError(f"No curated concepts file for {language}: {path}")
    return path


def _corpus_label(root: Path | None) -> str | None:
    if root is None:
        return None
    try:
        return str(root.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return root.name


def _display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(REPO_ROOT))
    except ValueError:
        return path.name


def _budget_target(image_count: int) -> int | None:
    for limit, bytes_target in BUDGETS:
        if image_count <= limit:
            return bytes_target
    return None


class _Builder:
    def __init__(self, sources: Sources, lock: dict, config: BuildConfig):
        self.sources = sources
        self.lock = lock
        self.config = config
        self.emoji: dict[str, Emoji] = load_index(sources.openmoji_json)
        self.vocabulary = load_vocabulary(sources.openjlpt_csv, config.levels)
        relevance = load_yaml(RELEVANCE_FILE) or {}
        self.relevance_default = float(relevance.get("default", 60))
        self.relevance: dict[str, float] = {
            str(key): float(value) for key, value in (relevance.get("categories") or {}).items()
        }
        self.curation: Curation = load_curation(
            config.resolved_concepts_file(),
            self.vocabulary,
            set(self.emoji),
            self.relevance,
        )

    # -- scoring inputs ---------------------------------------------------
    def corpus(self) -> FrequencyCorpus:
        if self.config.subtitles is None:
            return FrequencyCorpus(files=0, characters=0, tokens=0)
        return build_corpus(self.config.subtitles)

    def publishable(self) -> dict[str, list]:
        grouped = self.curation.by_entry()
        result = {}
        for entry_id, mappings in grouped.items():
            usable = []
            for mapping in mappings:
                concept = self.curation.concepts[mapping.concept_id]
                if concept.review_status != "approved":
                    continue
                if concept.visual_score is None or concept.visual_score < MIN_VISUAL_SCORE:
                    continue
                if not svg_path(self.sources.openmoji_svg_dir, concept.hexcode).is_file():
                    raise VocabularyError(
                        f"{concept.id}: OpenMoji SVG {concept.hexcode}.svg is missing from the source"
                    )
                usable.append(mapping)
            if usable:
                result[entry_id] = usable
        return result

    # -- build -------------------------------------------------------------
    def run(self) -> dict:
        corpus = self.corpus()
        publishable = self.publishable()
        usage: dict[str, set[str]] = {}
        for entry_id, mappings in publishable.items():
            for mapping in mappings:
                usage.setdefault(mapping.concept_id, set()).add(entry_id)
        usage_count = {concept_id: len(entries) for concept_id, entries in usage.items()}
        max_usage = max(usage_count.values(), default=0)
        if not publishable:
            raise VocabularyError(
                "No approved concept passed the filters; refusing to write an empty package"
            )
        max_count = max(
            (corpus.entry_count(self.vocabulary[entry_id]) for entry_id in publishable),
            default=0,
        )

        assets: dict[str, Asset] = {}
        entries = []
        for entry_id in sorted(
            publishable, key=lambda key: self._entry_sort_key(self.vocabulary[key])
        ):
            entry = self.vocabulary[entry_id]
            senses = []
            for mapping in publishable[entry_id]:
                concept = self.curation.concepts[mapping.concept_id]
                scores = {
                    "frequency": frequency_score(corpus.entry_count(entry), max_count)
                    if corpus.available
                    else None,
                    "visual": concept.visual_score,
                    "relevance": self.relevance.get(concept.category, self.relevance_default),
                    "reuse": reuse_score(usage_count.get(concept.id, 1), max_usage),
                }
                total, basis = total_score(scores)
                asset = assets.get(concept.hexcode)
                if asset is None:
                    asset = publish_svg(
                        svg_path(self.sources.openmoji_svg_dir, concept.hexcode),
                        self.config.out_dir / ASSET_RELATIVE_DIR,
                        concept.hexcode,
                        ASSET_RELATIVE_DIR,
                    )
                    assets[concept.hexcode] = asset
                senses.append(
                    {
                        "conceptId": concept.id,
                        "gloss": concept.gloss,
                        "image": {
                            "provider": "openmoji",
                            "hexcode": concept.hexcode,
                            "path": asset.path,
                            "sha256": asset.sha256,
                            "bytes": asset.bytes,
                            "license": "CC-BY-SA-4.0",
                            "modified": False,
                        },
                        "scores": {
                            "frequency": scores["frequency"],
                            "visual": scores["visual"],
                            "relevance": scores["relevance"],
                            "reuse": scores["reuse"],
                            "total": total,
                        },
                        "scoreBasis": basis,
                        "review": {
                            "status": concept.review_status,
                            "reviewedBy": concept.reviewed_by,
                            "reviewedAt": concept.reviewed_at,
                        },
                    }
                )
            senses.sort(key=lambda sense: (-(sense["scores"]["total"] or 0), sense["conceptId"]))
            entries.append(
                {
                    "id": entry.id,
                    "lemma": entry.word,
                    "reading": entry.reading,
                    "romaji": entry.romaji,
                    "pos": list(entry.pos),
                    "level": entry.level,
                    "meanings": list(entry.meanings),
                    "senses": senses,
                }
            )

        document = {
            "schemaVersion": 1,
            "kind": "visual-vocabulary",
            "language": self.config.language,
            "sources": self._sources_block(),
            "scoring": {
                "weights": {"frequency": 0.40, "visual": 0.35, "relevance": 0.15, "reuse": 0.10},
                "minVisualScore": MIN_VISUAL_SCORE,
                "frequency": {
                    "available": corpus.available,
                    "corpus": _corpus_label(self.config.subtitles),
                    "files": corpus.files,
                    "characters": corpus.characters,
                    "tokens": corpus.tokens,
                    "method": "janome base_form counts matched against lemma/reading/other_forms",
                },
            },
            "assets": [
                {
                    "hexcode": asset.hexcode,
                    "path": asset.path,
                    "sha256": asset.sha256,
                    "bytes": asset.bytes,
                    "license": "CC-BY-SA-4.0",
                    "modified": False,
                }
                for asset in (assets[hexcode] for hexcode in sorted(assets))
            ],
            "entries": entries,
        }

        yaml_path = self.config.out_dir / f"vocabulary.{self.config.language}.yaml"
        write_yaml(yaml_path, document)
        self._write_licenses()
        report = self._write_report(
            yaml_path=yaml_path,
            entries=entries,
            assets=assets,
            corpus=corpus,
            publishable=publishable,
        )
        return {"yaml": yaml_path, "report": report}

    def _entry_sort_key(self, entry: VocabEntry):
        return (LEVEL_RANK[entry.level], entry.reading, entry.word, entry.id)

    def _sources_block(self) -> dict:
        openmoji = self.lock["openmoji"]
        openjlpt = self.lock["openjlpt"]
        return {
            "vocabulary": {
                "provider": "openjlpt",
                "repo": openjlpt["repo"],
                "commit": openjlpt["commit"],
                "license": openjlpt["license"],
                "url": openjlpt["homepage"],
            },
            "images": {
                "provider": "openmoji",
                "version": openmoji["version"],
                "license": openmoji["license"],
                "url": openmoji["homepage"],
                "attribution": OPENMOJI_ATTRIBUTION,
            },
        }

    def _write_licenses(self) -> None:
        licenses = self.config.out_dir / "licenses"
        licenses.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(self.sources.openmoji_license, licenses / "OPENMOJI_LICENSE.txt")
        shutil.copyfile(self.sources.openjlpt_license, licenses / "OPENJLPT_LICENSE.txt")
        shutil.copyfile(self.sources.openjlpt_notice, licenses / "OPENJLPT_NOTICE.md")
        openmoji = self.lock["openmoji"]
        openjlpt = self.lock["openjlpt"]
        attribution = f"""# Attribution

Generated vocabulary data and OpenMoji images are distributed under CC BY-SA 4.0.

## Images

{OPENMOJI_ATTRIBUTION}

- Project: {openmoji["homepage"]}
- Pinned version: {openmoji["version"]}
- Release: {openmoji["release"]}
- License: Creative Commons Attribution-ShareAlike 4.0 International
  (https://creativecommons.org/licenses/by-sa/4.0/)
- License text: `licenses/OPENMOJI_LICENSE.txt`
- Modifications: none. SVGs are copied byte-for-byte from the pinned artifact
  (`modified: false` in the vocabulary index).

No endorsement by the OpenMoji project is implied.

## Vocabulary data

Contains data from OpenJLPT ({openjlpt["homepage"]}), commit
`{openjlpt["commit"]}`, licensed CC BY-SA 4.0. OpenJLPT is itself derived from
JMdict/KANJIDIC2 (EDRDG), Jonathan Waller's JLPT lists and Tatoeba; see
`licenses/OPENJLPT_NOTICE.md` for the full upstream list.

- License text: `licenses/OPENJLPT_LICENSE.txt`

## Scope

The extension's source code is not relicensed by this document. Only the
generated vocabulary data and the copied OpenMoji graphics fall under
CC BY-SA 4.0.
"""
        (licenses / "ATTRIBUTION.md").write_text(attribution, encoding="utf-8")
        notice = f"""# Third-Party Notices

Generated package sources:

| Component | Version | License | Upstream |
|---|---|---|---|
| OpenMoji SVG graphics | {openmoji["version"]} | CC BY-SA 4.0 | {openmoji["homepage"]} |
| OpenMoji metadata | {openmoji["version"]} | CC BY-SA 4.0 | {openmoji["homepage"]} |
| OpenJLPT vocabulary | {openjlpt["commit"]} | CC BY-SA 4.0 | {openjlpt["homepage"]} |

The full CC BY-SA 4.0 license texts ship in this directory. Upstream OpenJLPT
attribution requirements are reproduced below.

---

{self.sources.openjlpt_notice.read_text(encoding="utf-8")}
"""
        (licenses / "THIRD_PARTY_NOTICES.md").write_text(notice, encoding="utf-8")

    def _write_report(
        self,
        *,
        yaml_path: Path,
        entries: list[dict],
        assets: dict[str, Asset],
        corpus: FrequencyCorpus,
        publishable: dict[str, list],
    ) -> Path:
        published_ids = {entry["id"] for entry in entries}
        unmatched = sorted(
            (
                entry
                for entry_id, entry in self.vocabulary.items()
                if entry_id not in published_ids
            ),
            key=lambda entry: (LEVEL_RANK[entry.level], entry.reading, entry.word),
        )
        report_dir = self.config.report_dir
        report_dir.mkdir(parents=True, exist_ok=True)
        unmatched_path = report_dir / f"unmatched.{self.config.language}.txt"
        unmatched_path.write_text(
            "".join(
                f"{entry.level}\t{entry.word}\t{entry.reading}\t{'; '.join(entry.meanings)}\n"
                for entry in unmatched
            ),
            encoding="utf-8",
        )

        excluded = []
        for concept in sorted(self.curation.concepts.values(), key=lambda item: item.id):
            if concept.review_status != "approved":
                excluded.append({"concept": concept.id, "reason": f"reviewStatus={concept.review_status}"})
            elif concept.visual_score is None or concept.visual_score < MIN_VISUAL_SCORE:
                excluded.append({"concept": concept.id, "reason": f"visualScore={concept.visual_score}"})

        image_bytes = sum(asset.bytes for asset in assets.values())
        sense_count = sum(len(entry["senses"]) for entry in entries)
        target = _budget_target(len(assets))
        report = {
            "schemaVersion": 1,
            "language": self.config.language,
            "levels": list(self.config.levels),
            "counts": {
                "candidateVocabulary": len(self.vocabulary),
                "mappedVocabulary": len(publishable),
                "publishedVocabulary": len(entries),
                "publishedSenses": sense_count,
                "approvedConcepts": sum(
                    1 for concept in self.curation.concepts.values() if concept.review_status == "approved"
                ),
                "uniqueImages": len(assets),
                "unmatchedVocabulary": len(unmatched),
            },
            "size": {
                "imageBytes": image_bytes,
                "yamlBytes": yaml_path.stat().st_size,
                "totalBytes": image_bytes + yaml_path.stat().st_size,
                "targetBytes": target,
                "withinTarget": target is None or image_bytes + yaml_path.stat().st_size <= target,
            },
            "frequency": {
                "available": corpus.available,
                "corpus": _corpus_label(self.config.subtitles),
                "files": corpus.files,
                "characters": corpus.characters,
                "tokens": corpus.tokens,
            },
            "excludedConcepts": excluded,
            "artifacts": {
                "vocabulary": _display_path(yaml_path),
                "unmatchedList": _display_path(unmatched_path),
            },
        }
        report_path = self.config.out_dir / f"build-report.{self.config.language}.yaml"
        write_yaml(report_path, report)
        return report_path


def build(sources: Sources, lock: dict, config: BuildConfig | None = None) -> dict:
    return _Builder(sources, lock, config or BuildConfig()).run()
