"""Tests for the date-relative work-order generator helpers."""

from __future__ import annotations

import random
from datetime import datetime, timezone

from fsloader.load_transactional import _business_hour


def test_business_hour_snaps_to_weekday() -> None:
    # 2026-05-02 is a Saturday; 2026-05-03 a Sunday → must roll to Monday May 4.
    sat = datetime(2026, 5, 2, 14, 0, tzinfo=timezone.utc)
    rng = random.Random(42)
    out = _business_hour(sat, rng)
    assert out.weekday() < 5
    assert 8 <= out.hour <= 16


def test_business_hour_within_business_window() -> None:
    rng = random.Random(0)
    # Tuesday
    tue = datetime(2026, 4, 28, 23, 30, tzinfo=timezone.utc)
    out = _business_hour(tue, rng)
    assert 8 <= out.hour <= 16
    assert out.minute in (0, 15, 30, 45)
