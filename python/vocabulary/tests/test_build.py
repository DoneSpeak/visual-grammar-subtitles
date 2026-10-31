import json
from pathlib import Path

import pytest
import yaml

from vocabulary.build import BuildConfig, build
from vocabulary.config import VocabularyError
from vocabulary.sources import Sources
from vocabulary.validate import validate_package
from vocabulary.yamlutil import dump_yaml

LOCK = {
    "openmoji": {
        "version": "test-1",
        "license": "CC-BY-SA-4.0",
        "homepage": "https://example.test/openmoji",
        "release": "https://example.test/openmoji/releases/test-1",
    },
    "openjlpt": {
        "repo": "example/OpenJLPT",
        "commit": "deadbeef",
        "license": "CC-BY-SA-4.0",
        "homepage": "https://example.test/openjlpt",
    },
}

SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72"><path d="M0 0h72v72H0z"/></svg>'


@pytest.fixture
def sources(tmp_path: Path) -> Sources:
    root = tmp_path / "sources"
    svg_dir = root / "svg"
    svg_dir.mkdir(parents=True)
    (svg_dir / "1F415.svg").write_text(SVG, encoding="utf-8")
    (svg_dir / "1F431.svg").write_text(SVG, encoding="utf-8")
    (root / "openmoji.json").write_text(
        json.dumps(
            [
                {"hexcode": "1F415", "annotation": "dog", "group": "animals-nature", "subgroups": "animal-mammal", "tags": "dog", "openmoji_tags": "", "unicode": 1},
                {"hexcode": "1F431", "annotation": "cat face", "group": "animals-nature", "subgroups": "animal-mammal", "tags": "cat", "openmoji_tags": "", "unicode": 1},
            ]
        ),
        encoding="utf-8",
    )
    (root / "OPENMOJI_LICENSE.txt").write_text("Attribution-ShareAlike 4.0 International\n", encoding="utf-8")
    (root / "OPENJLPT_LICENSE.txt").write_text("Attribution-ShareAlike 4.0 International\n", encoding="utf-8")
    (root / "OPENJLPT_NOTICE.md").write_text("OpenJLPT uses JMdict and KANJIDIC2.\n", encoding="utf-8")
    csv_dir = root / "csv"
    csv_dir.mkdir()
    (csv_dir / "vocab-n5.csv").write_text(
        "id,word,reading,romaji,meanings,level,pos,jmdict_id,other_forms,example_ja,example_en\n"
        "aaaaaaaaaa,犬,いぬ,inu,dog,N5,n,1,,,\n"
        "bbbbbbbbbb,猫,ねこ,neko,cat,N5,n,2,,,\n",
        encoding="utf-8",
    )
    return Sources(
        openmoji_json=root / "openmoji.json",
        openmoji_svg_dir=svg_dir,
        openmoji_license=root / "OPENMOJI_LICENSE.txt",
        openjlpt_csv={"N5": csv_dir / "vocab-n5.csv"},
        openjlpt_license=root / "OPENJLPT_LICENSE.txt",
        openjlpt_notice=root / "OPENJLPT_NOTICE.md",
    )


def _concepts(tmp_path: Path, cat_visual: int | None = 90) -> Path:
    document = {
        "schemaVersion": 1,
        "concepts": [
            {
                "id": "animals.dog",
                "category": "animals",
                "hexcode": "1F415",
                "visualScore": 90,
                "reviewStatus": "approved",
                "reviewedBy": "test",
                "reviewedAt": "2026-10-01",
                "gloss": {"en": "dog", "zh-Hans": "狗"},
            },
            {
                "id": "animals.cat",
                "category": "animals",
                "hexcode": "1F431",
                "visualScore": cat_visual,
                "reviewStatus": "approved",
                "reviewedBy": "test",
                "reviewedAt": "2026-10-01",
                "gloss": {"en": "cat", "zh-Hans": "猫"},
            },
        ],
        "mappings": [
            {"lemma": "犬", "reading": "いぬ", "concept": "animals.dog"},
            {"lemma": "猫", "reading": "ねこ", "concept": "animals.cat"},
        ],
    }
    path = tmp_path / "concepts.yaml"
    path.write_text(yaml.safe_dump(document, allow_unicode=True), encoding="utf-8")
    return path


def _config(tmp_path: Path, concepts: Path) -> BuildConfig:
    return BuildConfig(
        language="ja",
        levels=("N5",),
        subtitles=None,
        out_dir=tmp_path / "dist",
        report_dir=tmp_path / "reports",
        concepts_file=concepts,
    )


def test_build_produces_valid_package(tmp_path, sources):
    result = build(sources, LOCK, _config(tmp_path, _concepts(tmp_path)))
    document = yaml.safe_load(result["yaml"].read_text(encoding="utf-8"))
    assert [entry["lemma"] for entry in document["entries"]] == ["犬", "猫"]
    assert [asset["hexcode"] for asset in document["assets"]] == ["1F415", "1F431"]
    assert document["entries"][0]["senses"][0]["scores"]["frequency"] is None
    report = yaml.safe_load(result["report"].read_text(encoding="utf-8"))
    assert report["counts"]["publishedVocabulary"] == 2
    assert validate_package(tmp_path / "dist", "ja", LOCK)["images"] == 2


def test_output_is_byte_stable(tmp_path, sources):
    config = _config(tmp_path, _concepts(tmp_path))
    first = build(sources, LOCK, config)["yaml"].read_bytes()
    second = build(sources, LOCK, config)["yaml"].read_bytes()
    assert first == second


def test_low_visual_score_is_excluded_and_reported(tmp_path, sources):
    result = build(sources, LOCK, _config(tmp_path, _concepts(tmp_path, cat_visual=30)))
    document = yaml.safe_load(result["yaml"].read_text(encoding="utf-8"))
    assert [entry["lemma"] for entry in document["entries"]] == ["犬"]
    report = yaml.safe_load(result["report"].read_text(encoding="utf-8"))
    assert report["counts"]["unmatchedVocabulary"] == 1
    assert "猫" in (tmp_path / "reports" / "unmatched.ja.txt").read_text(encoding="utf-8")


def test_no_publishable_entries_is_an_error(tmp_path, sources):
    document = _concepts(tmp_path, cat_visual=30)
    text = document.read_text(encoding="utf-8").replace("visualScore: 90", "visualScore: 30")
    document.write_text(text, encoding="utf-8")
    with pytest.raises(VocabularyError, match="empty package"):
        build(sources, LOCK, _config(tmp_path, document))


def test_yaml_dump_is_canonical(tmp_path, sources):
    result = build(sources, LOCK, _config(tmp_path, _concepts(tmp_path)))
    text = result["yaml"].read_text(encoding="utf-8")
    assert dump_yaml(yaml.safe_load(text)) == text
