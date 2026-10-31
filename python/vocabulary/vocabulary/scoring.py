"""Four-dimension scoring. Weights are fixed by the design document (40/35/15/10)."""

from __future__ import annotations

import math

WEIGHTS = {"frequency": 0.40, "visual": 0.35, "relevance": 0.15, "reuse": 0.10}


def frequency_score(count: int, max_count: int) -> float | None:
    """Log-normalized 0-100 score. A measured zero stays 0, never a neutral guess."""
    if max_count <= 0:
        return None
    if count <= 0:
        return 0.0
    return round(100 * math.log1p(count) / math.log1p(max_count), 1)


def reuse_score(usage: int, max_usage: int) -> float | None:
    """Reuse value = distinct vocabulary entries sharing the concept.

    A concept used by a single word carries no measured reuse evidence, so the
    dimension stays null instead of being filled with an assumed value.
    """
    if max_usage <= 1:
        return None
    return round(100 * (usage - 1) / (max_usage - 1), 1)


def total_score(scores: dict[str, float | None]) -> tuple[float | None, list[str]]:
    present = {key: value for key, value in scores.items() if value is not None}
    if not present:
        return None, []
    weight_sum = sum(WEIGHTS[key] for key in present)
    total = sum(present[key] * WEIGHTS[key] for key in present) / weight_sum
    return round(total, 1), sorted(present)
