#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Validate a Raycast snippets JSON file for import.

Checks that the JSON structure matches Raycast's expected format and
reports any issues. Since Raycast does not expose a direct import API,
this script validates the file and guides the user through manual import.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/import-snippets.py snippets.json
    uv run ${CLAUDE_SKILL_DIR}/scripts/import-snippets.py snippets.json --strict
    uv run ${CLAUDE_SKILL_DIR}/scripts/import-snippets.py snippets.json --json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import click

REQUIRED_FIELDS = {"name", "text"}
OPTIONAL_FIELDS = {"keyword"}
ALL_KNOWN_FIELDS = REQUIRED_FIELDS | OPTIONAL_FIELDS


def validate_snippets(
    data: Any, strict: bool
) -> tuple[list[dict[str, str]], list[str], list[str]]:
    """Validate snippet data structure. Returns (valid_snippets, errors, warnings)."""
    errors: list[str] = []
    warnings: list[str] = []
    valid: list[dict[str, str]] = []

    if not isinstance(data, list):
        errors.append(f"Expected JSON array at root, got {type(data).__name__}")
        return valid, errors, warnings

    if len(data) == 0:
        errors.append("Snippets array is empty")
        return valid, errors, warnings

    for index, item in enumerate(data):
        prefix = f"Snippet [{index}]"

        if not isinstance(item, dict):
            errors.append(f"{prefix}: expected object, got {type(item).__name__}")
            continue

        missing = REQUIRED_FIELDS - set(item.keys())
        if missing:
            errors.append(
                f"{prefix}: missing required field(s): {', '.join(sorted(missing))}"
            )
            continue

        for field in REQUIRED_FIELDS:
            value = item[field]
            if not isinstance(value, str):
                errors.append(
                    f"{prefix}.{field}: expected string, got {type(value).__name__}"
                )
                continue
            if not value.strip():
                errors.append(f"{prefix}.{field}: must not be empty")

        unknown = set(item.keys()) - ALL_KNOWN_FIELDS
        if unknown and strict:
            errors.append(f"{prefix}: unknown field(s): {', '.join(sorted(unknown))}")
        elif unknown:
            warnings.append(
                f"{prefix}: unknown field(s) will be ignored by Raycast: "
                f"{', '.join(sorted(unknown))}"
            )

        if "keyword" in item and item["keyword"]:
            keyword = item["keyword"]
            if not isinstance(keyword, str):
                errors.append(
                    f"{prefix}.keyword: expected string, got {type(keyword).__name__}"
                )
            elif " " in keyword:
                warnings.append(
                    f"{prefix}.keyword: contains spaces — may not trigger reliably"
                )

        if not errors or not any(prefix in error for error in errors):
            valid.append(item)

    duplicates = find_duplicate_keywords(data)
    for keyword, count in duplicates.items():
        warnings.append(
            f"Keyword '{keyword}' used {count} times — only one will trigger"
        )

    return valid, errors, warnings


def find_duplicate_keywords(data: list[Any]) -> dict[str, int]:
    """Find duplicate keywords across snippets."""
    keyword_counts: dict[str, int] = {}
    for item in data:
        if isinstance(item, dict) and "keyword" in item and item["keyword"]:
            keyword = item["keyword"]
            keyword_counts[keyword] = keyword_counts.get(keyword, 0) + 1
    return {keyword: count for keyword, count in keyword_counts.items() if count > 1}


def output_json(
    valid: list[dict[str, str]], errors: list[str], warnings: list[str], path: str
) -> None:
    """Output validation result as JSON."""
    click.echo(
        json.dumps(
            {
                "file": path,
                "valid": len(errors) == 0,
                "total_snippets": len(valid) + len(errors),
                "valid_snippets": len(valid),
                "errors": errors,
                "warnings": warnings,
            },
            indent=2,
        )
    )


def output_human(
    valid: list[dict[str, str]], errors: list[str], warnings: list[str], path: str
) -> None:
    """Output validation result in human-readable format."""
    if errors:
        click.echo(f"Validation FAILED for {path}:\n")
        for error in errors:
            click.echo(f"  ❌ {error}")
        click.echo()
    else:
        click.echo(f"Validation PASSED for {path}\n")

    if warnings:
        for warning in warnings:
            click.echo(f"  ⚠️  {warning}")
        click.echo()

    click.echo(f"  {len(valid)} valid snippet(s)")

    if not errors:
        click.echo()
        click.echo("Import into Raycast:")
        click.echo("  1. Open Raycast Settings (Cmd+,)")
        click.echo("  2. Go to the Snippets tab")
        click.echo("  3. Click the Import button")
        click.echo(f"  4. Select: {Path(path).resolve()}")


@click.command()
@click.argument("file", type=click.Path(exists=True))
@click.option("--strict", is_flag=True, help="Treat unknown fields as errors")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(file: str, strict: bool, json_output: bool) -> None:
    """
    Validate a Raycast snippets JSON file for import.

    Checks structure, required fields (name, text), data types, and
    warns about potential issues like duplicate keywords. Raycast does
    not have a programmatic import API — this validates the file and
    provides manual import instructions.

    \b
    Expected JSON format:
        [{"name": "...", "text": "...", "keyword": "..."}, ...]

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/import-snippets.py snippets.json
        uv run ${CLAUDE_SKILL_DIR}/scripts/import-snippets.py snippets.json --strict
        uv run ${CLAUDE_SKILL_DIR}/scripts/import-snippets.py snippets.json --json

    \b
    Exit codes:
        0: Validation passed
        1: Error (invalid JSON or validation failed)
    """
    try:
        content = Path(file).read_text(encoding="utf-8")
        data = json.loads(content)
    except json.JSONDecodeError as error:
        click.echo(f"❌ Invalid JSON in {file}: {error}", err=True)
        sys.exit(1)

    valid, errors, warnings = validate_snippets(data, strict)

    if json_output:
        output_json(valid, errors, warnings, file)
    else:
        output_human(valid, errors, warnings, file)

    if errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
