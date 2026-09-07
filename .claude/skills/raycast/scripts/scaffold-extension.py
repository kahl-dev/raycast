#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Scaffold a new Raycast extension using npx create-raycast-extension.

Wraps the official scaffolding tool and creates the extension in the
correct location within $RAYCAST_DEV_PATH/extensions/.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-extension.py "my-extension"
    uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-extension.py "my-extension" --template list
"""

from __future__ import annotations

import json
import os
import subprocess
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


TEMPLATES = [
    "list",
    "detail",
    "form",
    "grid",
    "menu-bar",
    "no-view",
    "typeahead",
    "ai",
    "tool",
]


def pin_deploy_target(extension_dir: Path, target: str) -> str:
    """Pin RAY_Target into the generated dev script and return the new command.

    create-raycast-extension emits an unpinned `"dev": "ray develop"`. Rewriting it
    at creation is what keeps a new extension's first deploy from landing in the
    CLI's default flavor instead of the one actually in use.
    """
    package_json = extension_dir / "package.json"
    package_data = json.loads(package_json.read_text())
    scripts = package_data.get("scripts", {})

    if "dev" not in scripts:
        click.echo(
            f"Extension created, but {package_json} has no 'dev' script to pin.",
            err=True,
        )
        click.echo(
            f'   Add it manually: "dev": "RAY_Target={target} ray develop"', err=True
        )
        sys.exit(1)

    scripts["dev"] = f"RAY_Target={target} ray develop"
    package_data["scripts"] = scripts
    package_json.write_text(json.dumps(package_data, indent=2) + "\n")
    return scripts["dev"]


@click.command()
@click.argument("name")
@click.option(
    "--template",
    "-t",
    type=click.Choice(TEMPLATES),
    default="list",
    help="Extension template (default: list)",
)
@click.option("--title", help="Human-readable title (defaults to name with spaces)")
@click.option("--description", "-d", default="", help="Extension description")
@click.option(
    "--target",
    default="x",
    help=(
        "Raycast flavor the dev script deploys into, pinned into package.json "
        "(default: x, the 2.0 app). Pass 'release' for stock Raycast."
    ),
)
@click.option(
    "--dry-run", is_flag=True, help="Show what would be created without creating"
)
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(
    name: str,
    template: str,
    title: str | None,
    description: str,
    target: str,
    dry_run: bool,
    json_output: bool,
) -> None:
    """
    Scaffold a new Raycast extension.

    Creates extension in $RAYCAST_DEV_PATH/extensions/NAME using the official
    npx create-raycast-extension scaffolding tool, then pins the deploy target
    into the generated dev script.

    The generated manifest ships an unpinned "dev": "ray develop", which deploys
    into whichever Raycast flavor the CLI defaults to — stock Raycast. Pinning it
    at creation keeps a new extension from silently deploying into an app that is
    installed but not in use. Change the flavor with --target.

    \b
    Templates:
        list       Searchable list view (default, most common)
        detail     Rich markdown content view
        form       Input form with fields
        grid       Image grid layout
        menu-bar   Persistent menu bar item (macOS only)
        no-view    Logic only, no UI (open URL, copy, HUD)
        typeahead  Searchable list with async results
        ai         AI-powered extension with AI.ask()
        tool       AI tool for Raycast AI Chat @-mention

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-extension.py my-extension
        uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-extension.py my-extension --template form
        uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-extension.py my-extension --title "My Extension"
        uv run ${CLAUDE_SKILL_DIR}/scripts/scaffold-extension.py my-extension --dry-run

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

    extensions_dir = dev_path / "extensions"
    target_dir = extensions_dir / name

    if not title:
        title = name.replace("-", " ").replace("_", " ").title()

    if target_dir.exists():
        click.echo(f"❌ Extension already exists: {target_dir}", err=True)
        sys.exit(1)

    result = {
        "name": name,
        "title": title,
        "template": template,
        "description": description,
        "path": str(target_dir),
        "target": target,
    }

    if dry_run:
        result["status"] = "dry_run"
        if json_output:
            click.echo(json.dumps(result, indent=2))
        else:
            click.echo(f"Would create extension '{title}' at:")
            click.echo(f"  {target_dir}")
            click.echo(f"  Template: {template}")
            click.echo(f'  Dev script: "RAY_Target={target} ray develop"')
            if description:
                click.echo(f"  Description: {description}")
        return

    extensions_dir.mkdir(parents=True, exist_ok=True)

    try:
        command = [
            "npx",
            "--yes",
            "create-raycast-extension@latest",
            "--name",
            name,
            "--title",
            title,
            "--template",
            template,
        ]

        if description:
            command.extend(["--description", description])

        process = subprocess.run(
            command,
            cwd=str(extensions_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )

        if process.returncode != 0:
            click.echo(f"❌ Scaffolding failed: {process.stderr.strip()}", err=True)
            if process.stdout.strip():
                click.echo(f"   stdout: {process.stdout.strip()}", err=True)
            sys.exit(1)

        result["status"] = "created"
        result["dev_script"] = pin_deploy_target(target_dir, target)

        if json_output:
            click.echo(json.dumps(result, indent=2))
        else:
            click.echo(f"Extension '{title}' created at {target_dir}")
            click.echo(f"Deploy target pinned: {result['dev_script']}")
            click.echo()
            click.echo("Next steps:")
            click.echo(f"  cd {target_dir}")
            click.echo("  npm install")
            click.echo("  npm run dev")

    except FileNotFoundError:
        click.echo("❌ npx not found. Install Node.js: brew install node", err=True)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        click.echo("❌ Scaffolding timed out after 120 seconds", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
