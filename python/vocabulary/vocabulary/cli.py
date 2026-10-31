from __future__ import annotations

import argparse
import sys
import tempfile
from dataclasses import replace
from pathlib import Path

from . import __version__
from .build import BuildConfig, build
from .candidates import write_candidates
from .config import (
    DEFAULT_LEVELS,
    DEFAULT_SUBTITLES,
    DIST_DIR,
    REPORT_DIR,
    VocabularyError,
)
from .openjlpt import load_vocabulary
from .openmoji import load_index
from .sources import fetch_sources, load_lock
from .validate import validate_package
from .yamlutil import dump_yaml, load_yaml

DEFAULT_LANGUAGE = "ja"


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m vocabulary",
        description="Build the OpenMoji visual vocabulary YAML (offline, reproducible).",
    )
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("fetch", help="Download and verify the pinned OpenMoji/OpenJLPT sources")

    match = sub.add_parser("match", help="Write review candidates (never auto-approved)")
    match.add_argument("--language", default=DEFAULT_LANGUAGE)
    match.add_argument("--levels", nargs="+", default=list(DEFAULT_LEVELS))
    match.add_argument("--max-candidates", type=int, default=3)
    match.add_argument("--out", type=Path)

    build_cmd = sub.add_parser("build", help="Write dist/vocabulary.<lang>.yaml and SVG assets")
    build_cmd.add_argument("--language", default=DEFAULT_LANGUAGE)
    build_cmd.add_argument("--levels", nargs="+", default=list(DEFAULT_LEVELS))
    build_cmd.add_argument("--subtitles", type=Path, default=DEFAULT_SUBTITLES)
    build_cmd.add_argument(
        "--no-frequency",
        action="store_true",
        help="Skip subtitle frequency; F stays null and the weights are renormalized",
    )
    build_cmd.add_argument("--out", type=Path, default=DIST_DIR)
    build_cmd.add_argument("--report-dir", type=Path, default=REPORT_DIR)
    build_cmd.add_argument(
        "--dry-run",
        action="store_true",
        help="Build into a temporary directory, print the report, write nothing",
    )

    validate = sub.add_parser("validate", help="Validate a generated package")
    validate.add_argument("--language", default=DEFAULT_LANGUAGE)
    validate.add_argument("--dist", type=Path, default=DIST_DIR)

    all_cmd = sub.add_parser("all", help="fetch + build + validate")
    all_cmd.add_argument("--language", default=DEFAULT_LANGUAGE)
    all_cmd.add_argument("--levels", nargs="+", default=list(DEFAULT_LEVELS))
    all_cmd.add_argument("--subtitles", type=Path, default=DEFAULT_SUBTITLES)
    all_cmd.add_argument("--no-frequency", action="store_true")
    all_cmd.add_argument("--out", type=Path, default=DIST_DIR)
    all_cmd.add_argument("--report-dir", type=Path, default=REPORT_DIR)
    all_cmd.add_argument("--dry-run", action="store_true")
    return parser


def _print_summary(result: dict) -> None:
    path = result["yaml"]
    print(f"wrote {path}")
    print(f"report {result['report']}")


def _cmd_fetch() -> None:
    lock = load_lock()
    sources = fetch_sources(lock)
    print(f"openmoji {lock['openmoji']['version']}: {sources.openmoji_svg_dir}")
    print(f"openjlpt {lock['openjlpt']['commit'][:12]}: {', '.join(sources.openjlpt_csv)}")


def _cmd_match(args) -> None:
    lock = load_lock()
    sources = fetch_sources(lock)
    vocabulary = load_vocabulary(sources.openjlpt_csv, tuple(args.levels))
    emoji_index = load_index(sources.openmoji_json)
    out = args.out or REPORT_DIR / f"candidates.{args.language}.yaml"
    path = write_candidates(
        args.language,
        vocabulary,
        emoji_index,
        out,
        openmoji_version=str(lock["openmoji"]["version"]),
        openjlpt_commit=str(lock["openjlpt"]["commit"]),
        max_candidates=args.max_candidates,
    )
    print(f"wrote {path}")


def _cmd_build(args) -> None:
    lock = load_lock()
    sources = fetch_sources(lock)
    config = BuildConfig(
        language=args.language,
        levels=tuple(args.levels),
        subtitles=None if args.no_frequency else args.subtitles,
        out_dir=args.out,
        report_dir=args.report_dir,
    )
    if args.dry_run:
        with tempfile.TemporaryDirectory() as tmp:
            dry_config = replace(
                config, out_dir=Path(tmp) / "dist", report_dir=Path(tmp) / "reports"
            )
            result = build(sources, lock, dry_config)
            print(dump_yaml(load_yaml(result["report"])), end="")
        return
    _print_summary(build(sources, lock, config))


def _cmd_validate(args) -> None:
    lock = load_lock()
    stats = validate_package(args.dist, args.language, lock)
    print(
        f"ok: {stats['entries']} entries, {stats['senses']} senses, "
        f"{stats['images']} images, {stats['imageBytes']} image bytes"
    )


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "fetch":
            _cmd_fetch()
        elif args.command == "match":
            _cmd_match(args)
        elif args.command == "build":
            _cmd_build(args)
        elif args.command == "validate":
            _cmd_validate(args)
        elif args.command == "all":
            _cmd_build(args)
            if not args.dry_run:
                _cmd_validate(argparse.Namespace(language=args.language, dist=args.out))
        else:  # pragma: no cover - argparse enforces the choices
            raise VocabularyError(f"Unknown command {args.command}")
    except VocabularyError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("interrupted", file=sys.stderr)
        return 130
    return 0
