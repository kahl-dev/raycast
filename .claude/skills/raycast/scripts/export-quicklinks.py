#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Create a Raycast quicklinks JSON file from various sources.

Builds quicklink definitions from individual arguments or a CSV source.
Raycast stores quicklinks internally — this script helps create shareable
JSON definitions for bulk creation or documentation.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/export-quicklinks.py --name "GitHub" --link "https://github.com/search?q={query}"
    uv run ${CLAUDE_SKILL_DIR}/scripts/export-quicklinks.py --from-csv quicklinks.csv --output quicklinks.json
    uv run ${CLAUDE_SKILL_DIR}/scripts/export-quicklinks.py --from-csv quicklinks.csv --json
"""

from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path
from typing import Any

import click


def validate_quicklink(quicklink: dict[str, Any], index: int) -> None:
    """Validate a single quicklink has required fields."""
    if "name" not in quicklink or not quicklink["name"].strip():
        raise ValueError(f"Quicklink at index {index} is missing required field 'name'")
    if "link" not in quicklink or not quicklink["link"].strip():
        raise ValueError(f"Quicklink at index {index} is missing required field 'link'")

    link = quicklink["link"]
    has_scheme = "://" in link or link.startswith("mailto:") or link.startswith("tel:")
    if not has_scheme:
        raise ValueError(
            f"Quicklink at index {index}: link must include a scheme "
            f"(e.g., https://). Got: {link[:50]}"
        )


def parse_csv_source(csv_path: Path) -> list[dict[str, str]]:
    """Parse quicklinks from a CSV file with columns: name, link, openWith."""
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    content = csv_path.read_text(encoding="utf-8")
    reader = csv.DictReader(io.StringIO(content))

    required_columns = {"name", "link"}
    if reader.fieldnames is None:
        raise ValueError("CSV file has no header row")

    actual_columns = set(reader.fieldnames)
    missing = required_columns - actual_columns
    if missing:
        raise ValueError(
            f"CSV missing required columns: {', '.join(sorted(missing))}. "
            f"Found: {', '.join(sorted(actual_columns))}"
        )

    quicklinks = []
    for index, row in enumerate(reader):
        quicklink: dict[str, str] = {
            "name": row["name"].strip(),
            "link": row["link"].strip(),
        }
        open_with = row.get("openWith", "").strip()
        if open_with:
            quicklink["openWith"] = open_with

        validate_quicklink(quicklink, index)
        quicklinks.append(quicklink)

    return quicklinks


def build_single_quicklink(
    name: str, link: str, open_with: str | None
) -> dict[str, str]:
    """Build a single quicklink dict from arguments."""
    quicklink: dict[str, str] = {"name": name, "link": link}
    if open_with:
        quicklink["openWith"] = open_with
    validate_quicklink(quicklink, 0)
    return quicklink


def output_json(data: list[dict[str, str]]) -> None:
    """Output data as JSON."""
    click.echo(json.dumps(data, indent=2, ensure_ascii=False))


def output_human(data: list[dict[str, str]], output_path: Path | None) -> None:
    """Output data in human-readable format, optionally writing to file."""
    if output_path:
        output_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        click.echo(f"Wrote {len(data)} quicklink(s) to {output_path}")
        click.echo()
        click.echo("Create in Raycast:")
        click.echo("  Use create-quicklink.py --open for each, or")
        click.echo("  share the JSON file with team members.")
    else:
        click.echo(f"Generated {len(data)} quicklink(s):\n")
        for quicklink in data:
            click.echo(f"  {quicklink['name']}")
            click.echo(
                f"    Link: {quicklink['link'][:80]}{'...' if len(quicklink['link']) > 80 else ''}"
            )
            if "openWith" in quicklink:
                click.echo(f"    Open with: {quicklink['openWith']}")
            click.echo()

        click.echo("Use --output <file> to save, or --json to pipe elsewhere.")


@click.command()
@click.option("--name", help="Quicklink name (for single quicklink mode)")
@click.option("--link", help="Quicklink URL (for single quicklink mode)")
@click.option("--open-with", default=None, help="Application to open link with")
@click.option(
    "--from-csv",
    "csv_path",
    type=click.Path(exists=False),
    help="Import quicklinks from CSV (columns: name, link, openWith)",
)
@click.option(
    "--output",
    "output_path",
    type=click.Path(),
    help="Write JSON output to file (default: stdout)",
)
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(
    name: str | None,
    link: str | None,
    open_with: str | None,
    csv_path: str | None,
    output_path: str | None,
    json_output: bool,
) -> None:
    """
    Create Raycast quicklinks JSON for sharing or bulk creation.

    Build quicklink definitions from individual arguments or a CSV source.
    Output format: [{"name": "...", "link": "...", "openWith": "..."}]

    \b
    Quicklinks support dynamic placeholders in URLs:
        {query}       User input when quicklink is invoked
        {clipboard}   Current clipboard content
        {date}        Current date
        {time}        Current time

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-quicklinks.py --name "GitHub" --link "https://github.com/search?q={query}"
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-quicklinks.py --name "Jira" --link "https://jira.example.com/browse/{clipboard}" --open-with "Safari"
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-quicklinks.py --from-csv quicklinks.csv --output quicklinks.json
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-quicklinks.py --from-csv quicklinks.csv --json

    \b
    CSV format (header row required):
        name,link,openWith
        GitHub Search,https://github.com/search?q={query},Safari
        Translate,https://translate.google.com/?text={query},

    \b
    Exit codes:
        0: Success
        1: Error (message on stderr)
    """
    try:
        quicklinks: list[dict[str, str]]

        if csv_path:
            quicklinks = parse_csv_source(Path(csv_path))
        elif name and link:
            quicklinks = [build_single_quicklink(name, link, open_with)]
        else:
            click.echo(
                "❌ Provide either --name + --link for a single quicklink, "
                "or --from-csv for batch import",
                err=True,
            )
            sys.exit(1)

        resolved_output = Path(output_path) if output_path else None

        if json_output:
            output_json(quicklinks)
        else:
            output_human(quicklinks, resolved_output)

    except (FileNotFoundError, ValueError) as error:
        click.echo(f"❌ {error}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
