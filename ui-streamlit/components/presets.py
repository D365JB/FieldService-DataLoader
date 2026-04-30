"""Vertical preset loader."""

from __future__ import annotations

from pathlib import Path

import yaml


def list_verticals(presets_dir: Path) -> list[str]:
    return sorted(p.stem for p in presets_dir.glob("*.yaml"))


def load_preset(presets_dir: Path, vertical: str) -> dict:
    p = presets_dir / f"{vertical}.yaml"
    if not p.exists():
        return {}
    with p.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}
