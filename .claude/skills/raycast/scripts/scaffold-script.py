#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Create a new Raycast script command with proper metadata headers.

Generates a script file with @raycast.* metadata in $RAYCAST_DEV_PATH/scripts/.
Supports bash, python, ruby, swift, applescript, node, and php.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-script.py "My Script" --language bash
    uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-script.py "My Script" --language python --mode compact
"""

from __future__ import annotations

import json
import os
import stat
import sys
from pathlib import Path

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


SHEBANGS = {
    "bash": "#!/bin/bash",
    "python": "#!/usr/bin/env python3",
    "ruby": "#!/usr/bin/env ruby",
    "swift": "#!/usr/bin/swift",
    "applescript": "#!/usr/bin/osascript",
    "node": "#!/usr/bin/env node",
    "php": "#!/usr/bin/env php",
}

EXTENSIONS = {
    "bash": ".sh",
    "python": ".py",
    "ruby": ".rb",
    "swift": ".swift",
    "applescript": ".applescript",
    "node": ".js",
    "php": ".php",
}

COMMENT_PREFIX = {
    "bash": "#",
    "python": "#",
    "ruby": "#",
    "swift": "//",
    "applescript": "#",
    "node": "//",
    "php": "//",
}

BODY_TEMPLATES = {
    "bash": '\necho "Hello from {title}"',
    "python": '\nprint("Hello from {title}")',
    "ruby": '\nputs "Hello from {title}"',
    "swift": '\nprint("Hello from {title}")',
    "applescript": '\nreturn "Hello from {title}"',
    "node": '\nconsole.log("Hello from {title}");',
    "php": '\n<?php\necho "Hello from {title}";\n?>',
}

MODES = ["silent", "compact", "fullOutput", "inline"]


def generate_script(
    title: str,
    language: str,
    mode: str,
    description: str,
    package_name: str,
    icon: str,
    has_argument: bool,
) -> str:
    """Generate script content with Raycast metadata headers."""
    shebang = SHEBANGS[language]
    comment = COMMENT_PREFIX[language]
    body = BODY_TEMPLATES[language].format(title=title)

    lines = [
        shebang,
        "",
        f"{comment} Required parameters:",
        f"{comment} @raycast.schemaVersion 1",
        f"{comment} @raycast.title {title}",
        f"{comment} @raycast.mode {mode}",
        "",
        f"{comment} Optional parameters:",
    ]

    if package_name:
        lines.append(f"{comment} @raycast.packageName {package_name}")

    if icon:
        lines.append(f"{comment} @raycast.icon {icon}")

    if description:
        lines.append(f"{comment} @raycast.description {description}")

    if has_argument:
        lines.append(
            f'{comment} @raycast.argument1 {{"type": "text", "placeholder": "Input"}}'
        )

    if mode == "inline":
        lines.append(f"{comment} @raycast.refreshTime 30s")

    lines.append("")
    lines.append(body.lstrip("\n"))
    lines.append("")

    return "\n".join(lines)


def title_to_filename(title: str) -> str:
    """Convert title to kebab-case filename."""
    return title.lower().replace(" ", "-").replace("_", "-")


@click.command()
@click.argument("title")
@click.option(
    "--language",
    "-l",
    type=click.Choice(list(SHEBANGS.keys())),
    default="bash",
    help="Script language (default: bash)",
)
@click.option(
    "--mode",
    "-m",
    type=click.Choice(MODES),
    default="silent",
    help="Output mode (default: silent)",
)
@click.option("--description", "-d", default="", help="Script description")
@click.option("--package", "-p", default="", help="Package name for grouping")
@click.option("--icon", default="", help="Icon emoji or path")
@click.option("--argument", is_flag=True, help="Add a text argument placeholder")
@click.option("--filename", help="Custom filename (without extension)")
@click.option("--dry-run", is_flag=True, help="Show content without creating file")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(
    title: str,
    language: str,
    mode: str,
    description: str,
    package: str,
    icon: str,
    argument: bool,
    filename: str | None,
    dry_run: bool,
    json_output: bool,
) -> None:
    """
    Create a new Raycast script command.

    Generates a script file with @raycast.* metadata headers in
    $RAYCAST_DEV_PATH/scripts/. The script is made executable automatically.

    \b
    Languages: bash, python, ruby, swift, applescript, node, php

    \b
    Output modes:
        silent      No output shown, just runs
        compact     Short result in notification bar
        fullOutput  Long result in scrollable view
        inline      Live result in Root Search (supports refreshTime)

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-script.py "Open Jira" --language bash
        uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-script.py "Upload Image" -l bash -m compact
        uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-script.py "CPU Usage" -l python -m inline
        uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-script.py "Translate" --argument
        uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-script.py "My Script" --dry-run

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

    scripts_dir = dev_path / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    if not filename:
        filename = title_to_filename(title)

    extension = EXTENSIONS[language]
    filepath = scripts_dir / f"{filename}{extension}"

    content = generate_script(
        title, language, mode, description, package, icon, argument
    )

    result = {
        "title": title,
        "language": language,
        "mode": mode,
        "path": str(filepath),
        "filename": f"{filename}{extension}",
    }

    if dry_run:
        result["status"] = "dry_run"
        result["content"] = content
        if json_output:
            click.echo(json.dumps(result, indent=2))
        else:
            click.echo(f"Would create: {filepath}\n")
            click.echo(content)
        return

    if filepath.exists():
        click.echo(f"❌ File already exists: {filepath}", err=True)
        sys.exit(1)

    filepath.write_text(content)
    filepath.chmod(filepath.stat().st_mode | stat.S_IEXEC)

    result["status"] = "created"

    if json_output:
        click.echo(json.dumps(result, indent=2))
    else:
        click.echo(f"Script command '{title}' created at {filepath}")
        click.echo()
        click.echo("Add the scripts directory in Raycast:")
        click.echo(
            f"  Settings > Extensions > Script Commands > Add Directory: {scripts_dir}"
        )


if __name__ == "__main__":
    main()
