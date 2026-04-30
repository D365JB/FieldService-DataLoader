"""Subprocess output streaming into a Streamlit ``st.empty()`` container.

Avoids freezing the UI on long-running orchestrator runs.
"""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Iterable
from pathlib import Path

import streamlit as st


def stream_command(
    cmd: list[str],
    *,
    cwd: Path | str,
    env_overrides: dict[str, str] | None = None,
    title: str = "Loader output",
) -> int:
    """Run ``cmd`` and live-stream stdout/stderr into Streamlit. Returns exit code."""
    env = os.environ.copy()
    if env_overrides:
        env.update(env_overrides)

    container = st.empty()
    log_lines: list[str] = []

    container.markdown(f"**{title}**")
    code_box = st.empty()

    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    assert proc.stdout is not None
    for line in proc.stdout:
        log_lines.append(line.rstrip())
        # Keep last ~500 lines visible to avoid runaway re-renders
        code_box.code("\n".join(log_lines[-500:]), language="text")

    proc.wait()
    return proc.returncode


def python_module(module: str, args: Iterable[str]) -> list[str]:
    """Build a ``[python, -m, <module>, ...args]`` list for ``stream_command``."""
    return [sys.executable, "-m", module, *args]
