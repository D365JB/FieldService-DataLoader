"""Repack the CMT bundle from the unpacked XML.

The CMT zip consists of two files:

- ``data.xml``      — entity rows
- ``data_schema.xml`` — entity / attribute schema

We commit the unpacked ``data.xml`` for reviewable PR diffs. This script
rebuilds the zip from ``config/data/fs-config-data.xml`` and
``config/schema/fs-config-schema.xml`` so ``pac data import`` can consume it.

Usage::

    python scripts/python/repack_cmt.py
"""

from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path


def repack(repo_root: Path) -> Path:
    data_xml = repo_root / "config" / "data" / "fs-config-data.xml"
    schema_xml = repo_root / "config" / "schema" / "fs-config-schema.xml"
    out = repo_root / "config" / "data" / "fs-config-data.zip"

    if not data_xml.exists() or not schema_xml.exists():
        raise FileNotFoundError(
            f"Missing inputs: {data_xml.name} and/or {schema_xml.name}"
        )

    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(data_xml, arcname="data.xml")
        zf.write(schema_xml, arcname="data_schema.xml")
    return out


def main() -> int:
    p = argparse.ArgumentParser(description="Repack the CMT bundle from XML.")
    p.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[2])
    args = p.parse_args()
    out = repack(args.repo_root)
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
