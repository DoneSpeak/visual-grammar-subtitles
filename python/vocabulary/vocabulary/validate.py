"""Validate a generated package before it can be consumed by the extension."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path

from .build import ASSET_RELATIVE_DIR, MIN_VISUAL_SCORE
from .config import LEVEL_RANK, VocabularyError
from .svgcheck import SvgValidationError, check_svg_bytes
from .yamlutil import dump_yaml, load_yaml

HEXCODE = re.compile(r"^[0-9A-F]{2,8}(?:-[0-9A-F]{2,8})*$")

REQUIRED_LICENSE_FILES = (
    "OPENMOJI_LICENSE.txt",
    "OPENJLPT_LICENSE.txt",
    "OPENJLPT_NOTICE.md",
    "ATTRIBUTION.md",
    "THIRD_PARTY_NOTICES.md",
)


class _Errors:
    def __init__(self) -> None:
        self.items: list[str] = []

    def add(self, message: str) -> None:
        self.items.append(message)

    def require(self, condition: bool, message: str) -> None:
        if not condition:
            self.add(message)


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_package(dist_dir: Path, language: str, lock: dict) -> dict:
    errors = _Errors()
    yaml_path = dist_dir / f"vocabulary.{language}.yaml"
    if not yaml_path.exists():
        raise VocabularyError(f"Package not found: {yaml_path}")
    text = yaml_path.read_text(encoding="utf-8")
    document = load_yaml(yaml_path)

    errors.require(dump_yaml(document) == text, "vocabulary YAML is not in canonical stable form")
    errors.require(document.get("schemaVersion") == 1, "schemaVersion must be 1")
    errors.require(document.get("kind") == "visual-vocabulary", "kind must be visual-vocabulary")
    errors.require(document.get("language") == language, f"language must be {language}")

    sources = document.get("sources") or {}
    openmoji = sources.get("images") or {}
    openjlpt = sources.get("vocabulary") or {}
    errors.require(
        openmoji.get("version") == str(lock["openmoji"]["version"]),
        "OpenMoji version does not match the pinned lock",
    )
    errors.require(
        openjlpt.get("commit") == str(lock["openjlpt"]["commit"]),
        "OpenJLPT commit does not match the pinned lock",
    )
    errors.require(openmoji.get("license") == "CC-BY-SA-4.0", "OpenMoji license must be CC-BY-SA-4.0")
    errors.require(openjlpt.get("license") == "CC-BY-SA-4.0", "OpenJLPT license must be CC-BY-SA-4.0")

    entries = document.get("entries") or []
    errors.require(bool(entries), "package has no entries")
    assets = document.get("assets") or []
    known_assets = {}
    for asset in assets:
        hexcode = str(asset.get("hexcode", "")).upper()
        errors.require(hexcode not in known_assets, f"duplicate asset entry {hexcode}")
        errors.require(bool(hexcode), "asset without hexcode")
        known_assets[hexcode] = asset

    entry_ids: set[str] = set()
    referenced: set[str] = set()
    image_bytes = 0
    sense_count = 0
    for entry in entries:
        entry_id = str(entry.get("id", ""))
        errors.require(bool(entry_id), "entry without id")
        errors.require(entry_id not in entry_ids, f"duplicate entry id {entry_id}")
        entry_ids.add(entry_id)
        errors.require(bool(entry.get("lemma")), f"{entry_id}: missing lemma")
        errors.require(bool(entry.get("reading")), f"{entry_id}: missing reading")
        errors.require(entry.get("level") in LEVEL_RANK, f"{entry_id}: invalid level")
        errors.require(bool(entry.get("meanings")), f"{entry_id}: missing meanings")
        senses = entry.get("senses") or []
        errors.require(bool(senses), f"{entry_id}: no senses")
        sense_count += len(senses)
        for sense in senses:
            concept_id = str(sense.get("conceptId", ""))
            errors.require(bool(concept_id), f"{entry_id}: sense without conceptId")
            review = sense.get("review") or {}
            errors.require(
                review.get("status") == "approved",
                f"{entry_id}/{concept_id}: only approved senses may be published",
            )
            errors.require(
                bool(review.get("reviewedBy")),
                f"{entry_id}/{concept_id}: reviewedBy is required",
            )
            scores = sense.get("scores") or {}
            visual = scores.get("visual")
            errors.require(
                isinstance(visual, (int, float)) and visual >= MIN_VISUAL_SCORE,
                f"{entry_id}/{concept_id}: visual score below {MIN_VISUAL_SCORE}",
            )
            errors.require(
                isinstance(scores.get("total"), (int, float)),
                f"{entry_id}/{concept_id}: missing total score",
            )
            image = sense.get("image") or {}
            errors.require(image.get("provider") == "openmoji", f"{entry_id}/{concept_id}: provider")
            errors.require(image.get("license") == "CC-BY-SA-4.0", f"{entry_id}/{concept_id}: license")
            errors.require(image.get("modified") is False, f"{entry_id}/{concept_id}: modified flag")
            hexcode = str(image.get("hexcode", "")).upper()
            errors.require(bool(HEXCODE.match(hexcode)), f"{entry_id}/{concept_id}: invalid hexcode")
            expected_path = f"{ASSET_RELATIVE_DIR}/{hexcode}.svg"
            errors.require(image.get("path") == expected_path, f"{entry_id}/{concept_id}: image path")
            referenced.add(hexcode)
            asset = known_assets.get(hexcode)
            errors.require(asset is not None, f"{entry_id}/{concept_id}: asset missing from manifest")
            if asset is not None:
                errors.require(
                    asset.get("sha256") == image.get("sha256"),
                    f"{hexcode}: manifest/entry sha256 mismatch",
                )
            path = dist_dir / expected_path
            if not path.is_file():
                errors.add(f"{hexcode}: asset file missing: {path}")
                continue
            data = path.read_bytes()
            errors.require(_sha256(path) == image.get("sha256"), f"{hexcode}: sha256 mismatch")
            errors.require(len(data) == image.get("bytes"), f"{hexcode}: byte size mismatch")
            try:
                check_svg_bytes(data, name=path.name)
            except SvgValidationError as exc:
                errors.add(str(exc))
            image_bytes += len(data)

    errors.require(
        referenced == set(known_assets),
        "asset manifest does not match referenced images: "
        f"unreferenced={sorted(set(known_assets) - referenced)}, "
        f"missing={sorted(referenced - set(known_assets))}",
    )

    sorted_entries = sorted(
        entries, key=lambda entry: (LEVEL_RANK[entry["level"]], entry["reading"], entry["lemma"], entry["id"])
    )
    errors.require(entries == sorted_entries, "entries are not in stable sort order")
    for entry in entries:
        senses = entry["senses"]
        ordered = sorted(senses, key=lambda sense: (-(sense["scores"]["total"] or 0), sense["conceptId"]))
        errors.require(senses == ordered, f"{entry['id']}: senses are not in score order")

    licenses = dist_dir / "licenses"
    for name in REQUIRED_LICENSE_FILES:
        path = licenses / name
        if not path.exists():
            errors.add(f"missing license file: {name}")
    license_text = (licenses / "OPENMOJI_LICENSE.txt").read_text(encoding="utf-8", errors="replace") if (licenses / "OPENMOJI_LICENSE.txt").exists() else ""
    errors.require("Attribution-ShareAlike 4.0" in license_text, "OpenMoji license text incomplete")
    attribution = (licenses / "ATTRIBUTION.md").read_text(encoding="utf-8") if (licenses / "ATTRIBUTION.md").exists() else ""
    for marker in ("OpenMoji", "OpenJLPT", "CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"):
        errors.require(marker in attribution, f"ATTRIBUTION.md missing {marker!r}")
    notices = (licenses / "THIRD_PARTY_NOTICES.md").read_text(encoding="utf-8") if (licenses / "THIRD_PARTY_NOTICES.md").exists() else ""
    for marker in ("OpenJLPT", "JMdict"):
        errors.require(marker in notices, f"THIRD_PARTY_NOTICES.md missing {marker!r}")

    if errors.items:
        raise VocabularyError(
            f"Package validation failed with {len(errors.items)} error(s):\n  - "
            + "\n  - ".join(errors.items)
        )
    return {
        "language": language,
        "entries": len(entries),
        "senses": sense_count,
        "images": len(referenced),
        "imageBytes": image_bytes,
        "yamlBytes": len(text.encode("utf-8")),
    }
