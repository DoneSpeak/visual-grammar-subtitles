import pytest

from vocabulary.scoring import frequency_score, reuse_score, total_score


def test_frequency_is_log_normalised():
    assert frequency_score(0, 10) == 0.0
    assert frequency_score(10, 10) == 100.0
    assert 0 < frequency_score(1, 10) < 100


def test_frequency_without_corpus_is_null():
    assert frequency_score(0, 0) is None


def test_reuse_requires_reuse_evidence():
    assert reuse_score(1, 1) is None
    assert reuse_score(1, 3) == 0.0
    assert reuse_score(3, 3) == 100.0


def test_total_renormalises_over_available_dimensions():
    total, basis = total_score({"frequency": None, "visual": 90, "relevance": 80, "reuse": None})
    expected = round((90 * 0.35 + 80 * 0.15) / (0.35 + 0.15), 1)
    assert total == expected
    assert basis == ["relevance", "visual"]


def test_total_is_null_without_any_dimension():
    assert total_score({"frequency": None, "visual": None}) == (None, [])
