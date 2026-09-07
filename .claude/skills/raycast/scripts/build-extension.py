#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Build a Raycast extension via npm run build.

Finds an extension by name or path in $RAYCAST_DEV_PATH/extensions/ and
runs `npm run build`. Reports success/failure with build output.

This compiles and validates for Store submission. It installs nothing into
any Raycast app — use dev-server.py to deploy.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/build-extension.py my-extension
    uv run ${CLAUDE_SKILL_DIR}/scripts/build-extension.py my-extension --json
    uv run ${CLAUDE_SKILL_DIR}/scripts/build-extension.py /absolute/path/to/extension
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

import click


def require_env(name: str, help_text: str) -> str:
    """Require environment variable or exit with helpful message."""
    value = os.getenv(name)
    if not value:
        click.echo(f"❌ Missing environment variable: {name}", err=True)
        click.echo(f"   {help_text}", err=True)
        click.echo("", err=True)
        click.echo("   Set it with:", err=True)
        click.echo(f"   export {name}='your-value'", err=True)
        sys.exit(1)
    return value


def resolve_extension_path(name_or_path: str, dev_path: Path) -> Path:
    """Resolve extension name or path to absolute directory path."""
    candidate = Path(name_or_path)
    if candidate.is_absolute() and candidate.exists():
        return candidate

    extensions_dir = dev_path / "extensions"
    extension_dir = extensions_dir / name_or_path

    if extension_dir.exists():
        return extension_dir

    available = []
    if extensions_dir.exists():
        available = sorted(
            entry.name
            for entry in extensions_dir.iterdir()
            if entry.is_dir() and (entry / "package.json").exists()
        )

    click.echo(f"❌ Extension not found: {name_or_path}", err=True)
    click.echo(f"   Looked in: {extensions_dir}", err=True)

    if available:
        click.echo("", err=True)
        click.echo("   Available extensions:", err=True)
        for extension_name in available[:15]:
            click.echo(f"     - {extension_name}", err=True)
        if len(available) > 15:
            click.echo(f"     ... and {len(available) - 15} more", err=True)

    sys.exit(1)


def read_package_json(extension_dir: Path) -> dict[str, Any]:
    """Read and parse package.json from extension directory."""
    package_json = extension_dir / "package.json"
    if not package_json.exists():
        click.echo(f"❌ No package.json found in: {extension_dir}", err=True)
        sys.exit(1)

    return json.loads(package_json.read_text())


def verify_build_script(package_data: dict[str, Any], extension_dir: Path) -> None:
    """Verify that the extension has a build script defined."""
    scripts = package_data.get("scripts", {})
    if "build" not in scripts:
        click.echo(f"❌ No 'build' script in package.json: {extension_dir}", err=True)
        click.echo('   Expected: "build": "ray build -e dist" in scripts', err=True)
        sys.exit(1)


def verify_node_modules(extension_dir: Path) -> None:
    """Install node_modules if missing."""
    if not (extension_dir / "node_modules").exists():
        click.echo("⚠️  node_modules not found — running npm install first", err=True)
        install_result = subprocess.run(
            ["npm", "install"],
            cwd=str(extension_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if install_result.returncode != 0:
            click.echo(
                f"❌ npm install failed: {install_result.stderr.strip()}", err=True
            )
            sys.exit(1)


@click.command()
@click.argument("extension")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(extension: str, json_output: bool) -> None:
    """
    Build a Raycast extension.

    Finds the extension by name in $RAYCAST_DEV_PATH/extensions/ (or accepts
    an absolute path) and runs `npm run build`. Reports success or failure
    with full build output.

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/build-extension.py my-extension
        uv run ${CLAUDE_SKILL_DIR}/scripts/build-extension.py my-extension --json
        uv run ${CLAUDE_SKILL_DIR}/scripts/build-extension.py /path/to/extension

    \b
    Environment:
        RAYCAST_DEV_PATH  Path to Raycast development repository (required)

    \b
    Exit codes:
        0: Build succeeded
        1: Build failed or runtime error (message on stderr)
    """
    dev_path = Path(
        require_env(
            "RAYCAST_DEV_PATH",
            "Set to your Raycast development repo path, e.g. ~/dev/raycast",
        )
    )

    extension_dir = resolve_extension_path(extension, dev_path)
    package_data = read_package_json(extension_dir)
    verify_build_script(package_data, extension_dir)
    verify_node_modules(extension_dir)

    title = package_data.get("title", extension_dir.name)
    extension_name = package_data.get("name", extension_dir.name)

    if not json_output:
        click.echo(f"Building '{title}'...")
        click.echo(f"  Path: {extension_dir}")
        click.echo()

    start_time = time.monotonic()

    try:
        process = subprocess.run(
            ["npm", "run", "build"],
            cwd=str(extension_dir),
            capture_output=True,
            text=True,
            timeout=300,
        )
    except FileNotFoundError:
        click.echo("❌ npm not found. Install Node.js: brew install node", err=True)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        click.echo("❌ Build timed out after 300 seconds", err=True)
        sys.exit(1)

    elapsed_seconds = round(time.monotonic() - start_time, 1)
    build_succeeded = process.returncode == 0

    result: dict[str, Any] = {
        "extension": extension_name,
        "title": title,
        "path": str(extension_dir),
        "success": build_succeeded,
        "duration_seconds": elapsed_seconds,
        "return_code": process.returncode,
    }

    if process.stdout.strip():
        result["stdout"] = process.stdout.strip()
    if process.stderr.strip():
        result["stderr"] = process.stderr.strip()

    if json_output:
        click.echo(json.dumps(result, indent=2))
    else:
        if build_succeeded:
            click.echo(f"✅ Build succeeded in {elapsed_seconds}s")
            if process.stdout.strip():
                click.echo()
                click.echo("Build output:")
                for line in process.stdout.strip().split("\n"):
                    click.echo(f"  {line}")
        else:
            click.echo(f"❌ Build failed (exit code {process.returncode})")
            if process.stderr.strip():
                click.echo()
                click.echo("Error output:")
                for line in process.stderr.strip().split("\n"):
                    click.echo(f"  {line}")
            if process.stdout.strip():
                click.echo()
                click.echo("Build output:")
                for line in process.stdout.strip().split("\n"):
                    click.echo(f"  {line}")

    if not build_succeeded:
        sys.exit(1)


if __name__ == "__main__":
    main()
