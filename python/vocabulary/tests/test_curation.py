import pytest
import yaml

from vocabulary.config import VocabularyError
from vocabulary.curation import load_curation
from vocabulary.openjlpt import VocabEntry

VOCAB = {
    "aaaaaaaaaa": VocabEntry("aaaaaaaaaa", "犬", "いぬ", "inu", ("dog",), "N5", ("n",), ()),
    "bbbbbbbbbb": VocabEntry("bbbbbbbbbb", "はし", "はし", "hashi", ("chopsticks",), "N5", ("n",), ()),
}
RELEVANCE = {"animals": 80, "food": 85}


def _write(tmp_path, document):
    path = tmp_path / "ja.yaml"
    path.write_text(yaml.safe_dump(document, allow_unicode=True), encoding="utf-8")
    return path


def _document(**overrides):
    concept = {
        "id": "animals.dog",
        "category": "animals",
        "hexcode": "1F415",
        "visualScore": 90,
        "reviewStatus": "approved",
        "reviewedBy": "test",
        "reviewedAt": "2026-10-01",
        "gloss": {"en": "dog"},
    }
    concept.update(overrides)
    return {
        "schemaVersion": 1,
        "concepts": [concept],
        "mappings": [{"lemma": "犬", "reading": "いぬ", "concept": "animals.dog"}],
    }


def test_approved_mapping_resolves_entry(tmp_path):
    curation = load_curation(_write(tmp_path, _document()), VOCAB, {"1F415"}, RELEVANCE)
    mapping = curation.mappings[0]
    assert mapping.entry.id == "aaaaaaaaaa"
    assert curation.concepts["animals.dog"].visual_score == 90


def test_unknown_hexcode_is_rejected(tmp_path):
    with pytest.raises(VocabularyError, match="unknown OpenMoji hexcode"):
        load_curation(_write(tmp_path, _document()), VOCAB, {"1F431"}, RELEVANCE)


def test_approved_concept_requires_visual_score(tmp_path):
    document = _document()
    document["concepts"][0]["visualScore"] = None
    with pytest.raises(VocabularyError, match="needs visualScore"):
        load_curation(_write(tmp_path, document), VOCAB, {"1F415"}, RELEVANCE)


def test_mapping_must_exist_in_vocabulary(tmp_path):
    document = _document()
    document["mappings"][0]["lemma"] = "猫"
    with pytest.raises(VocabularyError, match="not in the vocabulary source"):
        load_curation(_write(tmp_path, document), VOCAB, {"1F415"}, RELEVANCE)


def test_unknown_concept_is_rejected(tmp_path):
    document = _document()
    document["mappings"][0]["concept"] = "animals.cat"
    with pytest.raises(VocabularyError, match="unknown concept"):
        load_curation(_write(tmp_path, document), VOCAB, {"1F415"}, RELEVANCE)
