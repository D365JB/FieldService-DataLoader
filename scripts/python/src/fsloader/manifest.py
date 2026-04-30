"""Manifest loader: ``config/manifest.yaml`` declares track order + module gating."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field


class ModuleEntry(BaseModel):
    name: str
    track: str  # config | master | transactional | optional
    entrypoint: str  # dotted path or "external"
    enabled_by_default: bool = True
    description: str = ""


class Manifest(BaseModel):
    schema_version: int = 1
    modules: list[ModuleEntry] = Field(default_factory=list)


def load(path: str | Path) -> Manifest:
    p = Path(path)
    with p.open("r", encoding="utf-8") as f:
        raw: dict[str, Any] = yaml.safe_load(f) or {}
    return Manifest.model_validate(raw)
