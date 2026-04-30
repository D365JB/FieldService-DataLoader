"""Tests for the dataverse_client URL helpers (no network)."""

from __future__ import annotations

from fsloader.dataverse_client import alt_key_path, odata_bind


def test_alt_key_path_simple() -> None:
    assert alt_key_path("accounts", {"accountnumber": "DEMO-001"}) == "accounts(accountnumber='DEMO-001')"


def test_alt_key_path_escapes_quotes() -> None:
    p = alt_key_path("contacts", {"emailaddress1": "o'malley@example.com"})
    assert p == "contacts(emailaddress1='o''malley@example.com')"


def test_odata_bind_format() -> None:
    b = odata_bind("accounts", {"accountnumber": "DEMO-ACC-001"})
    assert b == "/accounts(accountnumber='DEMO-ACC-001')"


def test_alt_key_path_composite() -> None:
    p = alt_key_path("widgets", {"a": "1", "b": "2"})
    assert "a='1'" in p and "b='2'" in p
