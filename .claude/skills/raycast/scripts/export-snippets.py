#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Create a Raycast snippets JSON file from various sources.

Builds snippet definitions in Raycast's import format from CSV, text,
or individual arguments. Output can be piped or saved to a file for
import via Raycast Settings > Snippets > Import.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/export-snippets.py --name "Email" --text "user@example.com" --keyword "@@email"
    uv run ${CLAUDE_SKILL_DIR}/scripts/export-snippets.py --from-csv snippets.csv --output snippets.json
    uv run ${CLAUDE_SKILL_DIR}/scripts/export-snippets.py --from-csv snippets.csv --json
"""

from __future__ import annotations

import csv
import io
import json
import sys
from pathlib import Path
from typing import Any

import click


def validate_snippet(snippet: dict[str, Any], index: int) -> None:
    """Validate a single snippet has required fields."""
    if "name" not in snippet or not snippet["name"].strip():
        raise ValueError(f"Snippet at index {index} is missing required field 'name'")
    if "text" not in snippet or not snippet["text"].strip():
        raise ValueError(f"Snippet at index {index} is missing required field 'text'")


def parse_csv_source(csv_path: Path) -> list[dict[str, str]]:
    """Parse snippets from a CSV file with columns: name, text, keyword."""
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    content = csv_path.read_text(encoding="utf-8")
    reader = csv.DictReader(io.StringIO(content))

    required_columns = {"name", "text"}
    if reader.fieldnames is None:
        raise ValueError("CSV file has no header row")

    actual_columns = set(reader.fieldnames)
    missing = required_columns - actual_columns
    if missing:
        raise ValueError(
            f"CSV missing required columns: {', '.join(sorted(missing))}. "
            f"Found: {', '.join(sorted(actual_columns))}"
        )

    snippets = []
    for index, row in enumerate(reader):
        snippet: dict[str, str] = {
            "name": row["name"].strip(),
            "text": row["text"].strip(),
        }
        keyword = row.get("keyword", "").strip()
        if keyword:
            snippet["keyword"] = keyword

        validate_snippet(snippet, index)
        snippets.append(snippet)

    return snippets


def build_single_snippet(name: str, text: str, keyword: str | None) -> dict[str, str]:
    """Build a single snippet dict from arguments."""
    snippet: dict[str, str] = {"name": name, "text": text}
    if keyword:
        snippet["keyword"] = keyword
    validate_snippet(snippet, 0)
    return snippet


def output_json(data: list[dict[str, str]]) -> None:
    """Output data as JSON."""
    click.echo(json.dumps(data, indent=2, ensure_ascii=False))


def output_human(data: list[dict[str, str]], output_path: Path | None) -> None:
    """Output data in human-readable format, optionally writing to file."""
    if output_path:
        output_path.write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        click.echo(f"Wrote {len(data)} snippet(s) to {output_path}")
        click.echo()
        click.echo("Import into Raycast:")
        click.echo("  1. Open Raycast Settings (Cmd+,)")
        click.echo("  2. Go to Snippets tab")
        click.echo("  3. Click Import and select the file")
    else:
        click.echo(f"Generated {len(data)} snippet(s):\n")
        for snippet in data:
            click.echo(f"  {snippet['name']}")
            click.echo(
                f"    Text: {snippet['text'][:60]}{'...' if len(snippet['text']) > 60 else ''}"
            )
            if "keyword" in snippet:
                click.echo(f"    Keyword: {snippet['keyword']}")
            click.echo()

        click.echo("Use --output <file> to save, or --json to pipe elsewhere.")


@click.command()
@click.option("--name", help="Snippet name (for single snippet mode)")
@click.option("--text", help="Snippet expansion text (for single snippet mode)")
@click.option("--keyword", default=None, help="Snippet trigger keyword")
@click.option(
    "--from-csv",
    "csv_path",
    type=click.Path(exists=False),
    help="Import snippets from CSV (columns: name, text, keyword)",
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
    text: str | None,
    keyword: str | None,
    csv_path: str | None,
    output_path: str | None,
    json_output: bool,
) -> None:
    """
    Create Raycast snippets JSON for import.

    Build snippet definitions from individual arguments or a CSV source.
    The output format matches Raycast's snippet import schema:
    [{"name": "...", "text": "...", "keyword": "..."}]

    \b
    Dynamic variables supported in text:
        {clipboard}   Current clipboard content
        {date}        Current date
        {time}        Current time

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-snippets.py --name "Email" --text "user@example.com" --keyword "@@email"
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-snippets.py --from-csv snippets.csv --output snippets.json
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-snippets.py --from-csv snippets.csv --json
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-snippets.py --name "Date" --text "{date}" --keyword "ddate"

    \b
    CSV format (header row required):
        name,text,keyword
        Email,user@example.com,@@email
        Signature,"Best regards, Name",@@sig

    \b
    Exit codes:
        0: Success
        1: Error (message on stderr)
    """
    try:
        snippets: list[dict[str, str]]

        if csv_path:
            snippets = parse_csv_source(Path(csv_path))
        elif name and text:
            snippets = [build_single_snippet(name, text, keyword)]
        else:
            click.echo(
                "❌ Provide either --name + --text for a single snippet, "
                "or --from-csv for batch import",
                err=True,
            )
            sys.exit(1)

        resolved_output = Path(output_path) if output_path else None

        if json_output:
            output_json(snippets)
        else:
            output_human(snippets, resolved_output)

    except (FileNotFoundError, ValueError) as error:
        click.echo(f"❌ {error}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
