#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Create a Raycast quicklink via deeplink or JSON export.

Generates quicklink definitions with support for dynamic placeholders.
Can output the `open raycast://` deeplink command or a JSON definition
for bulk operations.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/create-quicklink.py --url "https://github.com/search?q={query}" --name "GitHub Search"
    uv run ${CLAUDE_SKILL_DIR}/scripts/create-quicklink.py --url "https://google.com/search?q={query}" --name "Google" --open
    uv run ${CLAUDE_SKILL_DIR}/scripts/create-quicklink.py --url "https://jira.example.com/browse/{clipboard}" --name "Jira Ticket" --json
"""

from __future__ import annotations

import json
import subprocess
import sys
from urllib.parse import quote

import click

SUPPORTED_PLACEHOLDERS = {
    "{query}": "User input at invocation time",
    "{clipboard}": "Current clipboard content",
    "{date}": "Current date",
    "{time}": "Current time",
    "{uuid}": "Generated UUID",
}

SUPPORTED_APPLICATIONS = [
    "Safari",
    "Google Chrome",
    "Firefox",
    "Arc",
    "Brave Browser",
    "Microsoft Edge",
    "Finder",
    "Terminal",
    "iTerm",
]


def validate_url(url: str) -> None:
    """Validate the quicklink URL."""
    if not url.strip():
        raise ValueError("URL must not be empty")

    has_scheme = "://" in url or url.startswith("mailto:") or url.startswith("tel:")
    if not has_scheme:
        raise ValueError(f"URL must include a scheme (e.g., https://). Got: {url[:50]}")


def detect_placeholders(url: str) -> list[str]:
    """Detect which dynamic placeholders are used in the URL."""
    return [placeholder for placeholder in SUPPORTED_PLACEHOLDERS if placeholder in url]


def build_deeplink(url: str, name: str, open_with: str | None) -> str:
    """Build the raycast:// deeplink for creating a quicklink."""
    encoded_url = quote(url, safe="")
    encoded_name = quote(name, safe="")
    deeplink = f"raycast://quicklinks/new?link={encoded_url}&name={encoded_name}"

    if open_with:
        deeplink += f"&openWith={quote(open_with, safe='')}"

    return deeplink


def build_json_definition(url: str, name: str, open_with: str | None) -> dict[str, str]:
    """Build a JSON quicklink definition."""
    definition: dict[str, str] = {"name": name, "link": url}
    if open_with:
        definition["openWith"] = open_with
    return definition


def open_deeplink(deeplink: str) -> None:
    """Open the deeplink via macOS `open` command."""
    result = subprocess.run(
        ["open", deeplink],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to open deeplink: {result.stderr.strip()}")


def output_json(
    definition: dict[str, str], deeplink: str, placeholders: list[str]
) -> None:
    """Output quicklink data as JSON."""
    click.echo(
        json.dumps(
            {
                "quicklink": definition,
                "deeplink": deeplink,
                "placeholders": placeholders,
            },
            indent=2,
        )
    )


def output_human(
    definition: dict[str, str], deeplink: str, placeholders: list[str], opened: bool
) -> None:
    """Output quicklink data in human-readable format."""
    click.echo(f"Quicklink: {definition['name']}")
    click.echo(f"  URL: {definition['link']}")

    if definition.get("openWith"):
        click.echo(f"  Open with: {definition['openWith']}")

    if placeholders:
        click.echo(f"  Placeholders: {', '.join(placeholders)}")
        for placeholder in placeholders:
            click.echo(f"    {placeholder} — {SUPPORTED_PLACEHOLDERS[placeholder]}")

    click.echo()

    if opened:
        click.echo("Deeplink opened in Raycast.")
    else:
        click.echo("Deeplink (run to create in Raycast):")
        click.echo(f'  open "{deeplink}"')


@click.command()
@click.option("--url", required=True, help="Quicklink URL (supports placeholders)")
@click.option("--name", required=True, help="Quicklink display name")
@click.option(
    "--open-with",
    default=None,
    help=f"Application to open with ({', '.join(SUPPORTED_APPLICATIONS[:4])}, ...)",
)
@click.option("--open", "open_link", is_flag=True, help="Open the deeplink in Raycast")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(
    url: str,
    name: str,
    open_with: str | None,
    open_link: bool,
    json_output: bool,
) -> None:
    """
    Create a Raycast quicklink via deeplink.

    Generates the raycast:// deeplink to create a quicklink, with
    support for dynamic placeholders that Raycast resolves at runtime.

    \b
    Supported placeholders in URL:
        {query}       User input when quicklink is invoked
        {clipboard}   Current clipboard content
        {date}        Current date
        {time}        Current time
        {uuid}        Generated UUID

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/create-quicklink.py --url "https://github.com/search?q={query}" --name "GitHub Search"
        uv run ${CLAUDE_SKILL_DIR}/scripts/create-quicklink.py --url "https://google.com/search?q={query}" --name "Google" --open
        uv run ${CLAUDE_SKILL_DIR}/scripts/create-quicklink.py --url "https://jira.example.com/browse/{clipboard}" --name "Jira Ticket" --open-with "Safari"
        uv run ${CLAUDE_SKILL_DIR}/scripts/create-quicklink.py --url "https://translate.google.com/?text={query}" --name "Translate" --json

    \b
    Exit codes:
        0: Success
        1: Error (message on stderr)
    """
    try:
        validate_url(url)

        placeholders = detect_placeholders(url)
        deeplink = build_deeplink(url, name, open_with)
        definition = build_json_definition(url, name, open_with)

        if open_link:
            open_deeplink(deeplink)

        if json_output:
            output_json(definition, deeplink, placeholders)
        else:
            output_human(definition, deeplink, placeholders, open_link)

    except (ValueError, RuntimeError) as error:
        click.echo(f"❌ {error}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
