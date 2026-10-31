"""Backward-compatible facade over :mod:`providers`.

The GiNZA analyzer now lives in ``providers.JaAnalyzer``. Keep these thin
wrappers so existing callers and tests can continue to import from ``analyzer``
with the Japanese default.
"""
import providers
from providers import build_units  # noqa: F401  (re-exported for existing callers)


def provider(language='ja'):
    return providers.provider(language)


def analyze(cues, source, language='ja'):
    return providers.analyze(cues, source, language)
