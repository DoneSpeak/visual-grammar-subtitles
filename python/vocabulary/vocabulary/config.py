from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = PROJECT_ROOT.parents[1]

DATA_DIR = PROJECT_ROOT / "data"
CACHE_DIR = PROJECT_ROOT / ".cache" / "sources"
DIST_DIR = PROJECT_ROOT / "dist"
REPORT_DIR = PROJECT_ROOT / "reports"

SOURCES_LOCK = DATA_DIR / "sources.lock.yaml"
RELEVANCE_FILE = DATA_DIR / "relevance.yaml"
CONCEPTS_DIR = DATA_DIR / "concepts"

DEFAULT_SUBTITLES = REPO_ROOT / "subtitles"
DEFAULT_LEVELS = ("N5", "N4")
LEVEL_RANK = {"N5": 0, "N4": 1, "N3": 2, "N2": 3, "N1": 4}


class VocabularyError(Exception):
    """Build-stopping configuration or data error."""
