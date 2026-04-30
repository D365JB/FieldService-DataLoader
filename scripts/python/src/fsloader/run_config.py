"""Pydantic models + loader for ``run-config.yaml``.

This is the **contract** between the Streamlit UI (or hand-written YAML) and
the CLI orchestrator. Both must accept the same schema; the UI is just one
producer of these files.
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Annotated, Literal

import yaml
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

log = logging.getLogger(__name__)

Vertical = Literal["hvac", "telecom", "medical", "utilities", "custom"]
AuthMethod = Literal["service_principal", "interactive", "env"]


class TargetCfg(BaseModel):
    env_url: str
    auth_method: AuthMethod = "service_principal"
    tenant_id: str | None = None
    client_id: str | None = None
    # client_secret is NEVER read from this file; only from env / CI secret.

    @field_validator("env_url")
    @classmethod
    def _validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("env_url must include scheme (https://...)")
        return v.rstrip("/")


class ScaleCfg(BaseModel):
    accounts: Annotated[int, Field(ge=5, le=100)] = 20
    bookable_resources: Annotated[int, Field(ge=3, le=50)] = 10
    open_work_orders: Annotated[int, Field(ge=10, le=500)] = 60


class GeographyCfg(BaseModel):
    metros: list[str] = Field(default_factory=lambda: ["seattle", "dallas", "atlanta"])
    random_seed: int = 42

    @field_validator("metros")
    @classmethod
    def _at_least_one(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("geography.metros must contain at least one entry")
        return [m.lower().strip() for m in v]


class DistributionCfg(BaseModel):
    past_pct: int = 30
    near_future_pct: int = 50
    far_future_pct: int = 20

    @model_validator(mode="after")
    def _sum_100(self) -> "DistributionCfg":
        total = self.past_pct + self.near_future_pct + self.far_future_pct
        if total != 100:
            raise ValueError(f"distribution percentages must sum to 100 (got {total})")
        return self


class DateWindowCfg(BaseModel):
    past_days: int = 14
    future_days: int = 14
    distribution: DistributionCfg = Field(default_factory=DistributionCfg)
    refresh_existing_dates: bool = False  # v2 flag


class ModuleFlag(BaseModel):
    enabled: bool = True


class ConfigModuleCfg(ModuleFlag):
    use_webapi: bool = False


class AgreementsModuleCfg(ModuleFlag):
    count: Annotated[int, Field(ge=0, le=20)] = 3


class CustomerAssetsModuleCfg(ModuleFlag):
    max_depth: Annotated[int, Field(ge=1, le=5)] = 3


class ModulesCfg(BaseModel):
    config: ConfigModuleCfg = Field(default_factory=ConfigModuleCfg)
    master: ModuleFlag = Field(default_factory=ModuleFlag)
    transactional: ModuleFlag = Field(default_factory=ModuleFlag)
    agreements: AgreementsModuleCfg = Field(default_factory=AgreementsModuleCfg)
    customer_assets: CustomerAssetsModuleCfg = Field(default_factory=CustomerAssetsModuleCfg)
    # v2 stubs — keep for forward compatibility, no loader paths in v1
    rso: ModuleFlag = Field(default_factory=lambda: ModuleFlag(enabled=False))
    iot_cfs: ModuleFlag = Field(default_factory=lambda: ModuleFlag(enabled=False))
    customer_voice: ModuleFlag = Field(default_factory=lambda: ModuleFlag(enabled=False))


class AttachmentsCfg(BaseModel):
    attach_photo_to_open_wo: bool = True
    attach_pdf_inspection_to_open_wo: bool = True


class ResetCfg(BaseModel):
    prefix: str = "DEMO-"


class LoggingCfg(BaseModel):
    level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    output: Literal["text", "json"] = "text"


class RunConfig(BaseModel):
    schema_version: int = 1
    run_id: str
    target: TargetCfg
    vertical: Vertical = "hvac"
    preset_overrides: dict = Field(default_factory=dict)
    scale: ScaleCfg = Field(default_factory=ScaleCfg)
    geography: GeographyCfg = Field(default_factory=GeographyCfg)
    date_window: DateWindowCfg = Field(default_factory=DateWindowCfg)
    modules: ModulesCfg = Field(default_factory=ModulesCfg)
    attachments: AttachmentsCfg = Field(default_factory=AttachmentsCfg)
    reset: ResetCfg = Field(default_factory=ResetCfg)
    logging: LoggingCfg = Field(default_factory=LoggingCfg)
    # Optional: real Entra UPNs for User-type bookable resources.
    # When empty, only Equipment/Account/Contact resources are synthesized.
    users: list[str] = Field(default_factory=list)

    @field_validator("run_id")
    @classmethod
    def _run_id_has_prefix(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("run_id is required")
        return v.strip()


def load(path: str | Path) -> RunConfig:
    """Load + validate a run-config YAML file."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"run-config not found: {p}")
    with p.open("r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    return RunConfig.model_validate(raw)


def dump(cfg: RunConfig, path: str | Path) -> None:
    """Serialize a RunConfig to YAML."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        yaml.safe_dump(cfg.model_dump(mode="json"), f, sort_keys=False)


def main() -> int:
    """CLI: ``python -m fsloader.run_config --validate <file>``"""
    parser = argparse.ArgumentParser(description="Validate a run-config.yaml file")
    parser.add_argument("--validate", required=True, type=Path, help="Path to run-config.yaml")
    args = parser.parse_args()
    try:
        cfg = load(args.validate)
    except FileNotFoundError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 2
    except (ValidationError, yaml.YAMLError) as e:
        print(f"VALIDATION FAILED:\n{e}", file=sys.stderr)
        return 1
    print(f"OK: schema v{cfg.schema_version}, run_id={cfg.run_id}, vertical={cfg.vertical}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
