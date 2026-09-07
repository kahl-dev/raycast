#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Validate a Raycast extension before Store publishing.

Runs a checklist of required files and fields against the Raycast Store
publishing requirements. Reports pass/fail for each check.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/publish-prep.py my-extension
    uv run ${CLAUDE_SKILL_DIR}/scripts/publish-prep.py my-extension --json
    uv run ${CLAUDE_SKILL_DIR}/scripts/publish-prep.py /absolute/path/to/extension
"""

from __future__ import annotations

import json
import os
import struct
import sys
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


def read_png_dimensions(filepath: Path) -> tuple[int, int] | None:
    """Read PNG width and height from the IHDR chunk header (no Pillow needed)."""
    try:
        with open(filepath, "rb") as f:
            signature = f.read(8)
            if signature[:4] != b"\x89PNG":
                return None

            # Skip chunk length (4 bytes) and chunk type (4 bytes = "IHDR")
            f.read(4)
            chunk_type = f.read(4)
            if chunk_type != b"IHDR":
                return None

            width, height = struct.unpack(">II", f.read(8))
            return (width, height)
    except (OSError, struct.error):
        return None


def check_icon(extension_dir: Path) -> dict[str, Any]:
    """Check that a 512x512 PNG icon exists in assets/."""
    icon_candidates = [
        extension_dir / "assets" / "icon.png",
        extension_dir / "assets" / "command-icon.png",
    ]

    for icon_path in icon_candidates:
        if icon_path.exists():
            dimensions = read_png_dimensions(icon_path)
            if dimensions == (512, 512):
                return {
                    "check": "icon",
                    "passed": True,
                    "message": f"512x512 PNG icon found: {icon_path.name}",
                    "path": str(icon_path),
                }
            elif dimensions:
                return {
                    "check": "icon",
                    "passed": False,
                    "message": f"Icon is {dimensions[0]}x{dimensions[1]}, required 512x512: {icon_path.name}",
                    "path": str(icon_path),
                }
            else:
                return {
                    "check": "icon",
                    "passed": False,
                    "message": f"Icon exists but is not a valid PNG: {icon_path.name}",
                    "path": str(icon_path),
                }

    # Check for any PNG in assets
    assets_dir = extension_dir / "assets"
    if assets_dir.exists():
        png_files = list(assets_dir.glob("*.png"))
        if png_files:
            return {
                "check": "icon",
                "passed": False,
                "message": f"No icon.png found, but {len(png_files)} PNG file(s) exist in assets/",
            }

    return {
        "check": "icon",
        "passed": False,
        "message": "No icon found. Create assets/icon.png (512x512 PNG)",
    }


def check_screenshots(extension_dir: Path) -> dict[str, Any]:
    """Check that at least one screenshot exists in metadata/."""
    metadata_dir = extension_dir / "metadata"
    if not metadata_dir.exists():
        return {
            "check": "screenshots",
            "passed": False,
            "message": "No metadata/ directory. Create it with screenshots (PNG/JPG)",
        }

    screenshot_extensions = {".png", ".jpg", ".jpeg", ".gif"}
    screenshots = [
        f
        for f in metadata_dir.iterdir()
        if f.suffix.lower() in screenshot_extensions and not f.name.startswith(".")
    ]

    if not screenshots:
        return {
            "check": "screenshots",
            "passed": False,
            "message": "No screenshots in metadata/. Add at least 1 PNG or JPG screenshot",
        }

    return {
        "check": "screenshots",
        "passed": True,
        "message": f"{len(screenshots)} screenshot(s) found in metadata/",
        "files": [f.name for f in screenshots],
    }


def check_readme(extension_dir: Path) -> dict[str, Any]:
    """Check that README.md exists and is not empty."""
    readme_path = extension_dir / "README.md"
    if not readme_path.exists():
        return {
            "check": "readme",
            "passed": False,
            "message": "No README.md found. Required for Store listing",
        }

    content = readme_path.read_text().strip()
    if not content:
        return {
            "check": "readme",
            "passed": False,
            "message": "README.md exists but is empty",
            "path": str(readme_path),
        }

    word_count = len(content.split())
    return {
        "check": "readme",
        "passed": True,
        "message": f"README.md found ({word_count} words)",
        "path": str(readme_path),
    }


def check_package_json_fields(extension_dir: Path) -> dict[str, Any]:
    """Check required fields in package.json."""
    package_json_path = extension_dir / "package.json"
    if not package_json_path.exists():
        return {
            "check": "package_json_fields",
            "passed": False,
            "message": "No package.json found",
        }

    data = json.loads(package_json_path.read_text())

    required_fields = {
        "title": "Human-readable extension title",
        "description": "Short description for Store listing",
        "author": "Author name (Raycast username)",
        "license": "License identifier (e.g., MIT)",
    }

    missing = []
    empty = []
    present = []

    for field, description in required_fields.items():
        value = data.get(field)
        if value is None:
            missing.append(f"{field} ({description})")
        elif isinstance(value, str) and not value.strip():
            empty.append(f"{field} ({description})")
        else:
            present.append(field)

    if missing or empty:
        issues = []
        if missing:
            issues.append(f"Missing: {', '.join(missing)}")
        if empty:
            issues.append(f"Empty: {', '.join(empty)}")
        return {
            "check": "package_json_fields",
            "passed": False,
            "message": "; ".join(issues),
            "present": present,
            "missing": missing,
            "empty": empty,
        }

    return {
        "check": "package_json_fields",
        "passed": True,
        "message": f"All required fields present: {', '.join(present)}",
    }


def check_package_lock(extension_dir: Path) -> dict[str, Any]:
    """Check that package-lock.json exists."""
    lock_path = extension_dir / "package-lock.json"
    if not lock_path.exists():
        return {
            "check": "package_lock",
            "passed": False,
            "message": "No package-lock.json. Run npm install to generate it",
        }

    return {
        "check": "package_lock",
        "passed": True,
        "message": "package-lock.json exists",
    }


def check_commands(extension_dir: Path) -> dict[str, Any]:
    """Check that at least one command is defined."""
    package_json_path = extension_dir / "package.json"
    if not package_json_path.exists():
        return {
            "check": "commands",
            "passed": False,
            "message": "No package.json found",
        }

    data = json.loads(package_json_path.read_text())
    commands = data.get("commands", [])

    if not commands:
        return {
            "check": "commands",
            "passed": False,
            "message": "No commands defined in package.json",
        }

    return {
        "check": "commands",
        "passed": True,
        "message": f"{len(commands)} command(s) defined",
        "commands": [command.get("name", "unnamed") for command in commands],
    }


@click.command()
@click.argument("extension")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(extension: str, json_output: bool) -> None:
    """
    Validate a Raycast extension before Store publishing.

    Runs through the Raycast Store publishing checklist and reports
    pass/fail for each requirement.

    \b
    Checks performed:
        icon              512x512 PNG in assets/
        screenshots       At least 1 image in metadata/
        readme            README.md exists and is non-empty
        package_json      Required fields (title, description, author, license)
        package_lock      package-lock.json exists
        commands          At least 1 command defined

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/publish-prep.py my-extension
        uv run ${CLAUDE_SKILL_DIR}/scripts/publish-prep.py my-extension --json
        uv run ${CLAUDE_SKILL_DIR}/scripts/publish-prep.py /path/to/extension

    \b
    Environment:
        RAYCAST_DEV_PATH  Path to Raycast development repository (required)

    \b
    Exit codes:
        0: All checks passed
        1: One or more checks failed or runtime error
    """
    dev_path = Path(
        require_env(
            "RAYCAST_DEV_PATH",
            "Set to your Raycast development repo path, e.g. ~/dev/raycast",
        )
    )

    extension_dir = resolve_extension_path(extension, dev_path)

    package_json_path = extension_dir / "package.json"
    if not package_json_path.exists():
        click.echo(f"❌ No package.json found in: {extension_dir}", err=True)
        sys.exit(1)

    package_data = json.loads(package_json_path.read_text())
    title = package_data.get("title", extension_dir.name)
    extension_name = package_data.get("name", extension_dir.name)

    checks = [
        check_icon(extension_dir),
        check_screenshots(extension_dir),
        check_readme(extension_dir),
        check_package_json_fields(extension_dir),
        check_package_lock(extension_dir),
        check_commands(extension_dir),
    ]

    passed_count = sum(1 for check in checks if check["passed"])
    total_count = len(checks)
    all_passed = passed_count == total_count

    result: dict[str, Any] = {
        "extension": extension_name,
        "title": title,
        "path": str(extension_dir),
        "passed": passed_count,
        "total": total_count,
        "ready": all_passed,
        "checks": checks,
    }

    if json_output:
        click.echo(json.dumps(result, indent=2))
    else:
        click.echo(f"Publishing validation for '{title}'")
        click.echo(f"  Path: {extension_dir}")
        click.echo()

        for check in checks:
            status = "✅ PASS" if check["passed"] else "❌ FAIL"
            click.echo(f"  {status}  {check['check']}")
            click.echo(f"         {check['message']}")
            click.echo()

        click.echo(f"Result: {passed_count}/{total_count} checks passed")

        if all_passed:
            click.echo()
            click.echo("🚀 Extension is ready for Store submission!")
            click.echo("   Submit via: https://www.raycast.com/extensions/new")
        else:
            click.echo()
            click.echo("Fix the failing checks above before submitting.")

    if not all_passed:
        sys.exit(1)


if __name__ == "__main__":
    main()
