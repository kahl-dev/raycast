#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Get detailed info about a Raycast Store extension.

Fetches package.json from the raycast/extensions GitHub repository
using `gh api` and displays extension metadata.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/get-extension-info.py todoist
    uv run ${CLAUDE_SKILL_DIR}/scripts/get-extension-info.py todoist --json
    uv run ${CLAUDE_SKILL_DIR}/scripts/get-extension-info.py color-picker --show-dependencies
"""

from __future__ import annotations

import base64
import json
import subprocess
import sys
from typing import Any

import click


def fetch_package_json(extension_name: str) -> dict[str, Any]:
    """Fetch package.json for an extension from raycast/extensions repo."""
    api_path = (
        f"repos/raycast/extensions/contents/extensions/{extension_name}/package.json"
    )

    result = subprocess.run(
        ["gh", "api", api_path, "--jq", ".content"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        if "Not Found" in result.stderr:
            raise LookupError(
                f"Extension '{extension_name}' not found in raycast/extensions repo. "
                f"Check the name at https://github.com/raycast/extensions/tree/main/extensions"
            )
        if (
            "gh: command not found" in result.stderr
            or "not found" in result.stderr.lower()
        ):
            raise FileNotFoundError(
                "GitHub CLI (gh) not found. Install: brew install gh && gh auth login"
            )
        raise RuntimeError(f"GitHub API request failed: {result.stderr.strip()}")

    content_b64 = result.stdout.strip()
    if not content_b64:
        raise RuntimeError(
            f"Empty response from GitHub API for extension '{extension_name}'"
        )

    decoded = base64.b64decode(content_b64).decode()
    return json.loads(decoded)


def fetch_readme(extension_name: str) -> str | None:
    """Fetch README.md for an extension (returns None if not found)."""
    api_path = (
        f"repos/raycast/extensions/contents/extensions/{extension_name}/README.md"
    )

    result = subprocess.run(
        ["gh", "api", api_path, "--jq", ".content"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return None

    content_b64 = result.stdout.strip()
    if not content_b64:
        return None

    return base64.b64decode(content_b64).decode()


def extract_info(package_data: dict[str, Any]) -> dict[str, Any]:
    """Extract structured info from package.json."""
    commands = package_data.get("commands", [])
    dependencies = package_data.get("dependencies", {})
    dev_dependencies = package_data.get("devDependencies", {})
    preferences = package_data.get("preferences", [])

    command_details = []
    for command in commands:
        command_details.append(
            {
                "name": command.get("name", ""),
                "title": command.get("title", ""),
                "description": command.get("description", ""),
                "mode": command.get("mode", ""),
            }
        )

    return {
        "name": package_data.get("name", ""),
        "title": package_data.get("title", ""),
        "description": package_data.get("description", ""),
        "version": package_data.get("version", ""),
        "author": package_data.get("author", ""),
        "license": package_data.get("license", ""),
        "commands": command_details,
        "command_count": len(commands),
        "preferences": [
            {
                "name": preference.get("name", ""),
                "title": preference.get("title", ""),
                "type": preference.get("type", ""),
                "required": preference.get("required", False),
            }
            for preference in preferences
        ],
        "dependencies": dependencies,
        "dev_dependencies": dev_dependencies,
        "dependency_count": len(dependencies),
        "dev_dependency_count": len(dev_dependencies),
        "store_url": f"https://raycast.com/{package_data.get('author', '')}/{package_data.get('name', '')}",
        "source_url": f"https://github.com/raycast/extensions/tree/main/extensions/{package_data.get('name', '')}",
    }


def output_human(
    info: dict[str, Any],
    show_dependencies: bool,
    show_readme: bool,
    readme_content: str | None,
) -> None:
    """Output info in human-readable format."""
    click.echo(f"{info['title']}")
    click.echo(f"  {info['description']}")
    click.echo()

    click.echo("  Details:")
    click.echo(f"    Name:     {info['name']}")
    click.echo(f"    Version:  {info['version']}")
    click.echo(f"    Author:   {info['author']}")
    click.echo(f"    License:  {info['license']}")
    click.echo()

    click.echo(f"  Commands ({info['command_count']}):")
    for command in info["commands"]:
        mode_label = f" [{command['mode']}]" if command["mode"] else ""
        click.echo(f"    {command['title']}{mode_label}")
        if command["description"]:
            click.echo(f"      {command['description'][:80]}")
    click.echo()

    if info["preferences"]:
        click.echo(f"  Preferences ({len(info['preferences'])}):")
        for preference in info["preferences"]:
            required_label = " (required)" if preference["required"] else ""
            click.echo(
                f"    {preference['title']} [{preference['type']}]{required_label}"
            )
        click.echo()

    if show_dependencies:
        if info["dependencies"]:
            click.echo(f"  Dependencies ({info['dependency_count']}):")
            for dependency_name, version in sorted(info["dependencies"].items()):
                click.echo(f"    {dependency_name}: {version}")
            click.echo()

        if info["dev_dependencies"]:
            click.echo(f"  Dev Dependencies ({info['dev_dependency_count']}):")
            for dependency_name, version in sorted(info["dev_dependencies"].items()):
                click.echo(f"    {dependency_name}: {version}")
            click.echo()
    else:
        click.echo(
            f"  Dependencies: {info['dependency_count']} runtime, {info['dev_dependency_count']} dev"
        )
        click.echo("    Use --show-dependencies to list them")
        click.echo()

    click.echo("  Links:")
    click.echo(f"    Store:  {info['store_url']}")
    click.echo(f"    Source: {info['source_url']}")

    if show_readme and readme_content:
        click.echo()
        click.echo("  README:")
        click.echo("  " + "-" * 60)
        for line in readme_content.strip().split("\n"):
            click.echo(f"  {line}")


@click.command()
@click.argument("extension_name")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
@click.option(
    "--show-dependencies",
    is_flag=True,
    help="List all dependencies with versions",
)
@click.option(
    "--show-readme",
    is_flag=True,
    help="Include README.md content in output",
)
def main(
    extension_name: str,
    json_output: bool,
    show_dependencies: bool,
    show_readme: bool,
) -> None:
    """
    Get detailed info about a Raycast Store extension.

    Fetches the extension's package.json from the raycast/extensions GitHub
    repository using `gh api` and displays metadata including title,
    description, author, commands, version, and dependencies.

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/get-extension-info.py todoist
        uv run ${CLAUDE_SKILL_DIR}/scripts/get-extension-info.py color-picker --json
        uv run ${CLAUDE_SKILL_DIR}/scripts/get-extension-info.py todoist --show-dependencies
        uv run ${CLAUDE_SKILL_DIR}/scripts/get-extension-info.py todoist --show-readme

    \b
    Requirements:
        gh CLI authenticated (brew install gh && gh auth login)

    \b
    Exit codes:
        0: Success
        1: Error (message on stderr)
    """
    try:
        package_data = fetch_package_json(extension_name)
    except FileNotFoundError as e:
        click.echo(f"❌ {e}", err=True)
        sys.exit(1)
    except LookupError as e:
        click.echo(f"❌ {e}", err=True)
        sys.exit(1)
    except RuntimeError as e:
        click.echo(f"❌ {e}", err=True)
        sys.exit(1)

    info = extract_info(package_data)

    readme_content = None
    if show_readme or json_output:
        readme_content = fetch_readme(extension_name)

    if json_output:
        output = {**info}
        if readme_content:
            output["readme"] = readme_content
        click.echo(json.dumps(output, indent=2))
    else:
        output_human(info, show_dependencies, show_readme, readme_content)


if __name__ == "__main__":
    main()
