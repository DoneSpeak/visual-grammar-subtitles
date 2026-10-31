import re
from pathlib import Path

import yaml


# OpenMoji hexcodes such as "26E9" are strings, but YAML 1.1 parsers (and the
# JS `yaml` package used by scripts/build-vocabulary.ts) read them as either
# numbers or exponent notation unless they are explicitly quoted.
_HEX_LIKE = re.compile(r"^[0-9][0-9A-F]*$")


def _represent_str(dumper: yaml.SafeDumper, data: str):
    style = '"' if _HEX_LIKE.match(data) else None
    return dumper.represent_scalar("tag:yaml.org,2002:str", data, style=style)


yaml.SafeDumper.add_representer(str, _represent_str)


def load_yaml(path: Path):
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def dump_yaml(data) -> str:
    return yaml.safe_dump(
        data,
        allow_unicode=True,
        sort_keys=False,
        default_flow_style=False,
        width=1000,
    )


def write_yaml(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dump_yaml(data), encoding="utf-8")
