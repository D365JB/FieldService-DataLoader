"""Tests for run_config schema validation."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from pydantic import ValidationError

from fsloader import run_config


def _minimal_cfg() -> dict:
    return {
        "schema_version": 1,
        "run_id": "DEMO-TEST-001",
        "target": {"env_url": "https://orgname.crm.dynamics.com"},
    }


def test_minimal_loads_with_defaults(tmp_path: Path) -> None:
    p = tmp_path / "rc.yaml"
    p.write_text(yaml.safe_dump(_minimal_cfg()))
    cfg = run_config.load(p)
    assert cfg.run_id == "DEMO-TEST-001"
    assert cfg.scale.accounts == 20
    assert cfg.geography.metros == ["seattle", "dallas", "atlanta"]
    assert cfg.modules.rso.enabled is False  # v2 stub default


def test_distribution_must_sum_to_100(tmp_path: Path) -> None:
    bad = _minimal_cfg()
    bad["date_window"] = {"distribution": {"past_pct": 50, "near_future_pct": 40, "far_future_pct": 5}}
    p = tmp_path / "rc.yaml"
    p.write_text(yaml.safe_dump(bad))
    with pytest.raises(ValidationError):
        run_config.load(p)


def test_scale_bounds(tmp_path: Path) -> None:
    bad = _minimal_cfg()
    bad["scale"] = {"accounts": 1}  # below minimum 5
    p = tmp_path / "rc.yaml"
    p.write_text(yaml.safe_dump(bad))
    with pytest.raises(ValidationError):
        run_config.load(p)


def test_env_url_requires_scheme(tmp_path: Path) -> None:
    bad = _minimal_cfg()
    bad["target"]["env_url"] = "orgname.crm.dynamics.com"
    p = tmp_path / "rc.yaml"
    p.write_text(yaml.safe_dump(bad))
    with pytest.raises(ValidationError):
        run_config.load(p)


def test_metros_required(tmp_path: Path) -> None:
    bad = _minimal_cfg()
    bad["geography"] = {"metros": []}
    p = tmp_path / "rc.yaml"
    p.write_text(yaml.safe_dump(bad))
    with pytest.raises(ValidationError):
        run_config.load(p)


def test_round_trip(tmp_path: Path) -> None:
    src = _minimal_cfg()
    p1 = tmp_path / "rc.yaml"
    p1.write_text(yaml.safe_dump(src))
    cfg = run_config.load(p1)
    p2 = tmp_path / "rc2.yaml"
    run_config.dump(cfg, p2)
    cfg2 = run_config.load(p2)
    assert cfg.model_dump() == cfg2.model_dump()
