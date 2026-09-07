#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
List Raycast extensions and script commands in $RAYCAST_DEV_PATH.

Scans for TypeScript extensions (package.json with @raycast/api) and
script commands (files with @raycast.schemaVersion metadata).

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/list-installed.py
    uv run ${CLAUDE_SKILL_DIR}/scripts/list-installed.py --type extensions
    uv run ${CLAUDE_SKILL_DIR}/scripts/list-installed.py --type scripts
    uv run ${CLAUDE_SKILL_DIR}/scripts/list-installed.py --json
"""

from __future__ import annotations

import json
import os
import re
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


def scan_extensions(base_path: Path) -> list[dict[str, Any]]:
    """Scan for Raycast extensions (directories with package.json containing @raycast/api)."""
    extensions_dir = base_path / "extensions"
    results = []

    if not extensions_dir.exists():
        return results

    for entry in sorted(extensions_dir.iterdir()):
        package_json = entry / "package.json"
        if not package_json.exists():
            continue

        try:
            data = json.loads(package_json.read_text())
        except (json.JSONDecodeError, OSError):
            continue

        dependencies = data.get("dependencies", {})
        dev_dependencies = data.get("devDependencies", {})
        all_deps = {**dependencies, **dev_dependencies}

        if "@raycast/api" not in all_deps:
            continue

        commands = data.get("commands", [])
        results.append(
            {
                "name": data.get("name", entry.name),
                "title": data.get("title", entry.name),
                "description": data.get("description", ""),
                "type": "extension",
                "path": str(entry),
                "version": data.get("version", "unknown"),
                "raycast_api_version": all_deps.get("@raycast/api", "unknown"),
                "commands": len(commands),
                "command_names": [command.get("name", "") for command in commands],
            }
        )

    return results


def scan_scripts(base_path: Path) -> list[dict[str, Any]]:
    """Scan for Raycast script commands (files with @raycast.schemaVersion)."""
    scripts_dir = base_path / "scripts"
    results = []

    if not scripts_dir.exists():
        return results

    for entry in sorted(scripts_dir.iterdir()):
        if entry.is_dir() or entry.name.startswith("."):
            continue

        try:
            content = entry.read_text(errors="replace")
        except OSError:
            continue

        if "@raycast.schemaVersion" not in content:
            continue

        metadata = parse_script_metadata(content)
        results.append(
            {
                "name": entry.stem,
                "title": metadata.get("title", entry.stem),
                "description": metadata.get("description", ""),
                "type": "script",
                "path": str(entry),
                "mode": metadata.get("mode", "unknown"),
                "language": detect_script_language(entry),
                "package_name": metadata.get("packageName", ""),
            }
        )

    return results


def parse_script_metadata(content: str) -> dict[str, str]:
    """Parse @raycast.* metadata from script content."""
    metadata = {}
    for match in re.finditer(r"@raycast\.(\w+)\s+(.*?)$", content, re.MULTILINE):
        metadata[match.group(1)] = match.group(2).strip()
    return metadata


def detect_script_language(filepath: Path) -> str:
    """Detect script language from extension or shebang."""
    suffix_map = {
        ".sh": "bash",
        ".py": "python",
        ".rb": "ruby",
        ".swift": "swift",
        ".applescript": "applescript",
        ".js": "javascript",
        ".ts": "typescript",
        ".php": "php",
    }

    if filepath.suffix in suffix_map:
        return suffix_map[filepath.suffix]

    try:
        first_line = filepath.read_text(errors="replace").split("\n")[0]
        if "bash" in first_line or "sh" in first_line:
            return "bash"
        if "python" in first_line:
            return "python"
        if "node" in first_line:
            return "javascript"
        if "osascript" in first_line:
            return "applescript"
    except OSError:
        pass

    return "unknown"


def output_json(data: dict[str, Any]) -> None:
    """Output data as JSON."""
    click.echo(json.dumps(data, indent=2))


def output_human(data: dict[str, Any]) -> None:
    """Output data in human-readable format."""
    extensions = data.get("extensions", [])
    scripts = data.get("scripts", [])

    if extensions:
        click.echo(f"Extensions ({len(extensions)}):")
        for extension in extensions:
            commands = extension.get("commands", 0)
            click.echo(f"  {extension['title']} — {extension['description'][:60]}")
            click.echo(
                f"    {commands} command(s), @raycast/api {extension['raycast_api_version']}"
            )
            click.echo(f"    {extension['path']}")
            click.echo()

    if scripts:
        click.echo(f"Script Commands ({len(scripts)}):")
        for script in scripts:
            click.echo(f"  {script['title']} [{script['language']}] ({script['mode']})")
            if script["description"]:
                click.echo(f"    {script['description'][:60]}")
            click.echo(f"    {script['path']}")
            click.echo()

    if not extensions and not scripts:
        click.echo("No Raycast extensions or scripts found.")

    click.echo(f"Total: {len(extensions)} extensions, {len(scripts)} scripts")


@click.command()
@click.option(
    "--type",
    "artifact_type",
    type=click.Choice(["all", "extensions", "scripts"]),
    default="all",
    help="Filter by artifact type",
)
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(artifact_type: str, json_output: bool) -> None:
    """
    List Raycast extensions and script commands in $RAYCAST_DEV_PATH.

    Scans for TypeScript extensions (package.json with @raycast/api) and
    script commands (files with @raycast.schemaVersion metadata headers).

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/list-installed.py
        uv run ${CLAUDE_SKILL_DIR}/scripts/list-installed.py --type extensions
        uv run ${CLAUDE_SKILL_DIR}/scripts/list-installed.py --type scripts
        uv run ${CLAUDE_SKILL_DIR}/scripts/list-installed.py --json

    \b
    Environment:
        RAYCAST_DEV_PATH  Path to Raycast development repository (required)

    \b
    Exit codes:
        0: Success
        1: Error (message on stderr)
    """
    dev_path = Path(
        require_env(
            "RAYCAST_DEV_PATH",
            "Set to your Raycast development repo path, e.g. ~/dev/raycast",
        )
    )

    if not dev_path.exists():
        click.echo(f"❌ RAYCAST_DEV_PATH does not exist: {dev_path}", err=True)
        sys.exit(1)

    result: dict[str, Any] = {"path": str(dev_path)}

    if artifact_type in ("all", "extensions"):
        result["extensions"] = scan_extensions(dev_path)

    if artifact_type in ("all", "scripts"):
        result["scripts"] = scan_scripts(dev_path)

    if json_output:
        output_json(result)
    else:
        output_human(result)


if __name__ == "__main__":
    main()
