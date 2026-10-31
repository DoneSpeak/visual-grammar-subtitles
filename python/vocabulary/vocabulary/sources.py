"""Pinned upstream sources: download, hash verification, safe extraction."""

from __future__ import annotations

import hashlib
import shutil
import sys
import tarfile
from dataclasses import dataclass
from pathlib import Path
from urllib.request import Request, urlopen

from .config import CACHE_DIR, SOURCES_LOCK, VocabularyError
from .yamlutil import load_yaml

USER_AGENT = "sanno-visual-vocabulary/0.1 (+local build)"


@dataclass(frozen=True)
class Sources:
    openmoji_json: Path
    openmoji_svg_dir: Path
    openmoji_license: Path
    openjlpt_csv: dict[str, Path]
    openjlpt_license: Path
    openjlpt_notice: Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download(url: str, dest: Path, expected_sha: str) -> None:
    if dest.exists() and sha256_file(dest) == expected_sha:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_name(dest.name + ".part")
    request = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(request, timeout=180) as response, partial.open("wb") as handle:
        shutil.copyfileobj(response, handle)
    actual = sha256_file(partial)
    if actual != expected_sha:
        partial.unlink(missing_ok=True)
        raise VocabularyError(
            f"SHA-256 mismatch for {url}: expected {expected_sha}, got {actual}. "
            "Upstream artifact changed; re-pin data/sources.lock.yaml after review."
        )
    partial.replace(dest)


def _safe_members(tarball: Path, wanted) -> list[tarfile.TarInfo]:
    members = []
    with tarfile.open(tarball, "r:gz") as tar:
        for member in tar.getmembers():
            name = member.name
            parts = Path(name).parts
            if name.startswith("/") or ".." in parts:
                raise VocabularyError(f"Unsafe path in archive: {name}")
            if member.issym() or member.islnk():
                raise VocabularyError(f"Links are not allowed in archive: {name}")
            if wanted(name):
                members.append(member)
    if not members:
        raise VocabularyError(f"Archive {tarball.name} does not contain the expected files")
    return members


def _extract(tarball: Path, dest: Path, wanted) -> None:
    members = _safe_members(tarball, wanted)
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(tarball, "r:gz") as tar:
        if sys.version_info >= (3, 12):
            tar.extractall(dest, members=members, filter="data")
        else:  # path traversal and links are already rejected in _safe_members
            tar.extractall(dest, members=members)


def load_lock() -> dict:
    if not SOURCES_LOCK.exists():
        raise VocabularyError(f"Missing source lock: {SOURCES_LOCK}")
    return load_yaml(SOURCES_LOCK)


def fetch_sources(lock: dict | None = None) -> Sources:
    lock = lock or load_lock()
    openmoji = lock["openmoji"]
    openjlpt = lock["openjlpt"]

    om_version = str(openmoji["version"])
    om_dir = CACHE_DIR / f"openmoji-{om_version}"
    om_tarball = CACHE_DIR / f"openmoji-{om_version}.tgz"
    _download(openmoji["tarballUrl"], om_tarball, openmoji["tarballSha256"])
    om_json = om_dir / openmoji["metadataPath"]
    om_svg = om_dir / openmoji["svgDir"]
    om_license = om_dir / openmoji["licensePath"]
    if not (om_json.exists() and om_svg.is_dir() and om_license.exists()):
        if om_dir.exists():
            shutil.rmtree(om_dir)
        svg_prefix = openmoji["svgDir"].rstrip("/") + "/"
        license_path = openmoji["licensePath"]
        _extract(
            om_tarball,
            om_dir,
            lambda name: name == license_path
            or name == openmoji["metadataPath"]
            or name.startswith(svg_prefix),
        )

    oj_commit = str(openjlpt["commit"])
    oj_dir = CACHE_DIR / f"openjlpt-{oj_commit[:12]}"
    oj_tarball = CACHE_DIR / f"openjlpt-{oj_commit[:12]}.tgz"
    _download(openjlpt["tarballUrl"], oj_tarball, openjlpt["tarballSha256"])
    csv_rel = {level: path for level, path in openjlpt["vocabCsv"].items()}
    required = [openjlpt["licensePath"], openjlpt["noticePath"], *csv_rel.values()]
    if not all((oj_dir / rel).exists() for rel in required):
        if oj_dir.exists():
            shutil.rmtree(oj_dir)
        wanted_names = {Path(rel).name for rel in required}
        _extract(oj_tarball, oj_dir, lambda name: Path(name).name in wanted_names)
        # Upstream wraps everything in <Repo>-<commit>/; flatten one level.
        entries = list(oj_dir.iterdir())
        if len(entries) == 1 and entries[0].is_dir():
            root = entries[0]
            for path in root.iterdir():
                shutil.move(str(path), oj_dir / path.name)
            root.rmdir()
        missing = [rel for rel in required if not (oj_dir / rel).exists()]
        if missing:
            raise VocabularyError(
                f"OpenJLPT archive layout unexpected, missing: {', '.join(missing)}"
            )

    return Sources(
        openmoji_json=om_json,
        openmoji_svg_dir=om_svg,
        openmoji_license=om_license,
        openjlpt_csv={level: oj_dir / rel for level, rel in csv_rel.items()},
        openjlpt_license=oj_dir / openjlpt["licensePath"],
        openjlpt_notice=oj_dir / openjlpt["noticePath"],
    )
