#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Validate Raycast script command metadata headers.

Checks that @raycast.* metadata in script files is complete and correct.
Can validate a single file or all scripts in a directory.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/validate-script.py path/to/script.sh
    uv run ${CLAUDE_SKILL_DIR}/scripts/validate-script.py --all
    uv run ${CLAUDE_SKILL_DIR}/scripts/validate-script.py --all --json
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


REQUIRED_FIELDS = {"schemaVersion", "title", "mode"}
VALID_MODES = {"silent", "compact", "fullOutput", "inline"}
VALID_SCHEMA_VERSIONS = {"1"}
OPTIONAL_FIELDS = {
    "packageName",
    "icon",
    "iconDark",
    "description",
    "author",
    "authorURL",
    "currentDirectoryPath",
    "needsConfirmation",
    "refreshTime",
    "argument1",
    "argument2",
    "argument3",
}
ALL_KNOWN_FIELDS = REQUIRED_FIELDS | OPTIONAL_FIELDS


def parse_metadata(content: str) -> dict[str, str]:
    """Parse @raycast.* metadata from script content."""
    metadata = {}
    for match in re.finditer(r"@raycast\.(\w+)\s+(.*?)$", content, re.MULTILINE):
        metadata[match.group(1)] = match.group(2).strip()
    return metadata


def validate_metadata(filepath: Path, metadata: dict[str, str]) -> list[dict[str, Any]]:
    """Validate parsed metadata and return list of issues."""
    issues = []

    for field in REQUIRED_FIELDS:
        if field not in metadata:
            issues.append(
                {
                    "severity": "error",
                    "field": field,
                    "message": f"Missing required field: @raycast.{field}",
                }
            )

    if (
        "schemaVersion" in metadata
        and metadata["schemaVersion"] not in VALID_SCHEMA_VERSIONS
    ):
        issues.append(
            {
                "severity": "error",
                "field": "schemaVersion",
                "message": f"Invalid schemaVersion '{metadata['schemaVersion']}', expected: {', '.join(VALID_SCHEMA_VERSIONS)}",
            }
        )

    if "mode" in metadata and metadata["mode"] not in VALID_MODES:
        issues.append(
            {
                "severity": "error",
                "field": "mode",
                "message": f"Invalid mode '{metadata['mode']}', expected: {', '.join(sorted(VALID_MODES))}",
            }
        )

    if metadata.get("mode") == "inline" and "refreshTime" not in metadata:
        issues.append(
            {
                "severity": "warning",
                "field": "refreshTime",
                "message": "Inline mode without refreshTime — script won't auto-refresh",
            }
        )

    if "needsConfirmation" in metadata and metadata["needsConfirmation"] not in (
        "true",
        "false",
    ):
        issues.append(
            {
                "severity": "error",
                "field": "needsConfirmation",
                "message": f"needsConfirmation must be 'true' or 'false', got '{metadata['needsConfirmation']}'",
            }
        )

    for field in metadata:
        if field not in ALL_KNOWN_FIELDS:
            issues.append(
                {
                    "severity": "warning",
                    "field": field,
                    "message": f"Unknown field: @raycast.{field}",
                }
            )

    argument_count = sum(1 for key in metadata if key.startswith("argument"))
    if argument_count > 3:
        issues.append(
            {
                "severity": "error",
                "field": "arguments",
                "message": f"Maximum 3 arguments allowed, found {argument_count}",
            }
        )

    for i in range(1, 4):
        arg_key = f"argument{i}"
        if arg_key in metadata:
            try:
                arg_data = json.loads(metadata[arg_key])
                if "type" not in arg_data:
                    issues.append(
                        {
                            "severity": "error",
                            "field": arg_key,
                            "message": f"{arg_key} missing required 'type' field",
                        }
                    )
                if "placeholder" not in arg_data:
                    issues.append(
                        {
                            "severity": "warning",
                            "field": arg_key,
                            "message": f"{arg_key} missing 'placeholder' — will show empty input",
                        }
                    )
            except json.JSONDecodeError:
                issues.append(
                    {
                        "severity": "error",
                        "field": arg_key,
                        "message": f"{arg_key} is not valid JSON",
                    }
                )

    if not filepath.stat().st_mode & 0o111:
        issues.append(
            {
                "severity": "warning",
                "field": "permissions",
                "message": "Script is not executable (chmod +x needed)",
            }
        )

    return issues


def validate_file(filepath: Path) -> dict[str, Any]:
    """Validate a single script file."""
    try:
        content = filepath.read_text(errors="replace")
    except OSError as e:
        return {
            "path": str(filepath),
            "valid": False,
            "issues": [{"severity": "error", "field": "file", "message": str(e)}],
        }

    if "@raycast.schemaVersion" not in content:
        return {
            "path": str(filepath),
            "valid": False,
            "issues": [
                {
                    "severity": "error",
                    "field": "schemaVersion",
                    "message": "Not a Raycast script (no @raycast.schemaVersion found)",
                }
            ],
        }

    metadata = parse_metadata(content)
    issues = validate_metadata(filepath, metadata)
    errors = [issue for issue in issues if issue["severity"] == "error"]

    return {
        "path": str(filepath),
        "valid": len(errors) == 0,
        "metadata": metadata,
        "issues": issues,
    }


def find_scripts(directory: Path) -> list[Path]:
    """Find all potential Raycast script files in a directory."""
    scripts = []
    for entry in sorted(directory.iterdir()):
        if entry.is_dir() or entry.name.startswith("."):
            continue
        try:
            content = entry.read_text(errors="replace")
            if "@raycast.schemaVersion" in content:
                scripts.append(entry)
        except OSError:
            continue
    return scripts


def output_json(data: Any) -> None:
    """Output data as JSON."""
    click.echo(json.dumps(data, indent=2))


def output_human(results: list[dict[str, Any]]) -> None:
    """Output validation results in human-readable format."""
    total = len(results)
    valid_count = sum(1 for result in results if result["valid"])
    invalid_count = total - valid_count

    for result in results:
        status = "PASS" if result["valid"] else "FAIL"
        click.echo(f"[{status}] {result['path']}")

        for issue in result.get("issues", []):
            severity = issue["severity"].upper()
            click.echo(f"  {severity}: {issue['message']}")

        if result.get("issues"):
            click.echo()

    click.echo(f"Results: {valid_count} passed, {invalid_count} failed out of {total}")


@click.command()
@click.argument("file_path", required=False, type=click.Path())
@click.option(
    "--all",
    "validate_all",
    is_flag=True,
    help="Validate all scripts in $RAYCAST_DEV_PATH/scripts/",
)
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(file_path: str | None, validate_all: bool, json_output: bool) -> None:
    """
    Validate Raycast script command metadata.

    Checks @raycast.* metadata headers for correctness: required fields
    (schemaVersion, title, mode), valid values, argument JSON format,
    and file permissions.

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/validate-script.py my-script.sh
        uv run ${CLAUDE_SKILL_DIR}/scripts/validate-script.py --all
        uv run ${CLAUDE_SKILL_DIR}/scripts/validate-script.py --all --json

    \b
    Checks:
        - Required fields present (schemaVersion, title, mode)
        - Valid schemaVersion (must be "1")
        - Valid mode (silent, compact, fullOutput, inline)
        - Inline mode has refreshTime
        - Arguments are valid JSON with required fields
        - Maximum 3 arguments
        - File is executable

    \b
    Environment:
        RAYCAST_DEV_PATH  Path to Raycast development repository (for --all)

    \b
    Exit codes:
        0: All scripts valid
        1: Validation errors found or runtime error
    """
    if not file_path and not validate_all:
        click.echo("❌ Provide a file path or use --all", err=True)
        sys.exit(1)

    results = []

    if validate_all:
        dev_path = Path(
            require_env(
                "RAYCAST_DEV_PATH",
                "Set to your Raycast development repo path, e.g. ~/dev/raycast",
            )
        )
        scripts_dir = dev_path / "scripts"
        if not scripts_dir.exists():
            click.echo(f"❌ Scripts directory not found: {scripts_dir}", err=True)
            sys.exit(1)

        scripts = find_scripts(scripts_dir)
        if not scripts:
            click.echo("No Raycast script commands found.", err=True)
            sys.exit(1)

        for script_path in scripts:
            results.append(validate_file(script_path))
    else:
        target = Path(file_path)
        if not target.exists():
            click.echo(f"❌ File not found: {target}", err=True)
            sys.exit(1)
        results.append(validate_file(target))

    if json_output:
        output_json(results)
    else:
        output_human(results)

    has_errors = any(not result["valid"] for result in results)
    sys.exit(1 if has_errors else 0)


if __name__ == "__main__":
    main()
