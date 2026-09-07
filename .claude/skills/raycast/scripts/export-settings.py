#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Trigger Raycast settings export or import via deeplink.

Opens the Raycast export/import settings deeplink. The export creates
a .rayconfig file containing extensions, snippets, quicklinks, and
preferences.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/export-settings.py
    uv run ${CLAUDE_SKILL_DIR}/scripts/export-settings.py --import
    uv run ${CLAUDE_SKILL_DIR}/scripts/export-settings.py --json
"""

from __future__ import annotations

import json
import subprocess
import sys

import click

EXPORT_DEEPLINK = "raycast://extensions/raycast/raycast/export-settings-data"
IMPORT_DEEPLINK = "raycast://extensions/raycast/raycast/import-settings-data"

EXPORT_CONTENTS = [
    "Extensions and their preferences",
    "Snippets",
    "Quicklinks",
    "Script commands",
    "Window management settings",
    "Theme preferences",
    "Hotkey assignments",
    "General preferences",
]


def open_deeplink(deeplink: str) -> None:
    """Open the deeplink via macOS `open` command."""
    result = subprocess.run(
        ["open", deeplink],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to open deeplink: {result.stderr.strip()}")


def output_json(action: str, deeplink: str, opened: bool) -> None:
    """Output action data as JSON."""
    click.echo(
        json.dumps(
            {
                "action": action,
                "deeplink": deeplink,
                "opened": opened,
                "contents": EXPORT_CONTENTS if action == "export" else [],
                "file_format": ".rayconfig",
            },
            indent=2,
        )
    )


def output_human_export(deeplink: str, opened: bool) -> None:
    """Output export instructions in human-readable format."""
    if opened:
        click.echo("Raycast export settings dialog opened.\n")
    else:
        click.echo("Raycast Settings Export\n")

    click.echo("The .rayconfig file includes:")
    for item in EXPORT_CONTENTS:
        click.echo(f"  - {item}")

    click.echo()

    if opened:
        click.echo("Choose a save location in the Raycast dialog.")
    else:
        click.echo("Run to open export dialog:")
        click.echo(f'  open "{deeplink}"')

    click.echo()
    click.echo("Tip: Share the .rayconfig file with team members or")
    click.echo("     use it to sync settings across machines.")


def output_human_import(deeplink: str, opened: bool) -> None:
    """Output import instructions in human-readable format."""
    if opened:
        click.echo("Raycast import settings dialog opened.\n")
        click.echo("Select a .rayconfig file in the Raycast dialog.")
    else:
        click.echo("Raycast Settings Import\n")
        click.echo("Run to open import dialog:")
        click.echo(f'  open "{deeplink}"')

    click.echo()
    click.echo("The import will merge with existing settings.")
    click.echo("Conflicting items will be overwritten by the imported values.")


@click.command()
@click.option(
    "--import", "import_mode", is_flag=True, help="Open import dialog instead of export"
)
@click.option("--no-open", is_flag=True, help="Show deeplink without opening it")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(import_mode: bool, no_open: bool, json_output: bool) -> None:
    """
    Trigger Raycast settings export or import.

    Opens the Raycast deeplink for exporting or importing settings.
    The export creates a .rayconfig file that bundles all Raycast
    configuration for sharing or backup.

    \b
    Export includes:
        Extensions, snippets, quicklinks, script commands,
        window management, themes, hotkeys, preferences.

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-settings.py
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-settings.py --import
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-settings.py --no-open
        uv run ${CLAUDE_SKILL_DIR}/scripts/export-settings.py --json

    \b
    Exit codes:
        0: Success
        1: Error (message on stderr)
    """
    try:
        action = "import" if import_mode else "export"
        deeplink = IMPORT_DEEPLINK if import_mode else EXPORT_DEEPLINK
        should_open = not no_open and not json_output

        if should_open:
            open_deeplink(deeplink)

        if json_output:
            output_json(action, deeplink, should_open)
        elif action == "export":
            output_human_export(deeplink, should_open)
        else:
            output_human_import(deeplink, should_open)

    except RuntimeError as error:
        click.echo(f"❌ {error}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
