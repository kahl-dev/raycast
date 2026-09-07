#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Deploy a Raycast extension into a Raycast app via `ray develop`.

Finds an extension by name or path in $RAYCAST_DEV_PATH/extensions/ and runs
`npm run dev`. This is the install step — `ray develop` writes the compiled
command bundles into the target app's extension directory, and they persist
after the dev server stops. The running server only adds hot reloading.

Which app receives the deploy depends on the Raycast flavor (RAY_Target). The
resolved destination is reported before starting and the landed bundles are
verified after stopping, because a deploy into the wrong flavor otherwise looks
exactly like a successful one.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/dev-server.py my-extension
    uv run ${CLAUDE_SKILL_DIR}/scripts/dev-server.py my-extension --target x
    uv run ${CLAUDE_SKILL_DIR}/scripts/dev-server.py my-extension --json
    uv run ${CLAUDE_SKILL_DIR}/scripts/dev-server.py /absolute/path/to/extension
"""

from __future__ import annotations

import json
import os
import re
import subprocess
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


def resolve_extension_path(name_or_path: str, dev_path: Path) -> Path:
    """Resolve extension name or path to absolute directory path."""
    candidate = Path(name_or_path)
    if candidate.is_absolute() and candidate.exists():
        return candidate

    extensions_dir = dev_path / "extensions"
    extension_dir = extensions_dir / name_or_path

    if extension_dir.exists():
        return extension_dir

    available = []
    if extensions_dir.exists():
        available = sorted(
            entry.name
            for entry in extensions_dir.iterdir()
            if entry.is_dir() and (entry / "package.json").exists()
        )

    click.echo(f"❌ Extension not found: {name_or_path}", err=True)
    click.echo(f"   Looked in: {extensions_dir}", err=True)

    if available:
        click.echo("", err=True)
        click.echo("   Available extensions:", err=True)
        for extension_name in available[:15]:
            click.echo(f"     - {extension_name}", err=True)
        if len(available) > 15:
            click.echo(f"     ... and {len(available) - 15} more", err=True)

    sys.exit(1)


def read_package_json(extension_dir: Path) -> dict[str, Any]:
    """Read and parse package.json from extension directory."""
    package_json = extension_dir / "package.json"
    if not package_json.exists():
        click.echo(f"❌ No package.json found in: {extension_dir}", err=True)
        sys.exit(1)

    return json.loads(package_json.read_text())


def verify_dev_script(package_data: dict[str, Any], extension_dir: Path) -> None:
    """Verify that the extension has a dev script defined."""
    scripts = package_data.get("scripts", {})
    if "dev" not in scripts:
        click.echo(f"❌ No 'dev' script in package.json: {extension_dir}", err=True)
        click.echo('   Expected: "dev": "ray develop" in scripts', err=True)
        sys.exit(1)


def resolve_deploy_target(extension_dir: Path, target: str | None) -> dict[str, str]:
    """Ask the Raycast CLI where a deploy will land.

    The flavor decides the destination directory, so a deploy whose destination is
    unknown cannot be verified. This exits rather than guessing the mapping.
    """
    config_module = extension_dir / "node_modules/@raycast/api/dist/config.js"
    if not config_module.exists():
        click.echo(f"Cannot resolve deploy target: {config_module} missing", err=True)
        click.echo("   Run 'npm install' in the extension directory first.", err=True)
        sys.exit(1)

    environment = dict(os.environ)
    if target:
        environment["RAY_Target"] = target

    probe = (
        f"const config = require({json.dumps(str(config_module))});"
        "console.log(JSON.stringify({"
        "configDirectory: config.raycastConfigDirectory(),"
        "destination: config.extensionBuildDirectory(),"
        "bundleId: config.raycastBundleID()}))"
    )
    result = subprocess.run(
        ["node", "-e", probe],
        cwd=str(extension_dir),
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        click.echo(
            f"Cannot resolve deploy target: {result.stderr.strip()}",
            err=True,
        )
        sys.exit(1)

    resolved = json.loads(result.stdout)
    resolved["flavor"] = Path(resolved["configDirectory"]).name
    return resolved


def pinned_target(package_data: dict[str, Any]) -> str | None:
    """Return a RAY_Target pinned inline in the package.json dev script, if any.

    An inline assignment in the npm script wins over the environment this process
    passes down, so the pin has to be read rather than overridden silently.
    """
    match = re.search(r"\bRAY_Target=(\S+)", package_data["scripts"]["dev"])
    return match.group(1) if match else None


def verify_deploy(
    package_data: dict[str, Any], destination: Path
) -> tuple[list[str], list[str]]:
    """Return (deployed, missing) command names by checking for bundles on disk."""
    command_names = [command["name"] for command in package_data.get("commands", [])]
    deployed = [name for name in command_names if (destination / f"{name}.js").exists()]
    missing = [name for name in command_names if name not in deployed]
    return deployed, missing


def verify_node_modules(extension_dir: Path) -> None:
    """Warn if node_modules is missing."""
    if not (extension_dir / "node_modules").exists():
        click.echo("⚠️  node_modules not found — running npm install first", err=True)
        install_result = subprocess.run(
            ["npm", "install"],
            cwd=str(extension_dir),
            capture_output=True,
            text=True,
            timeout=120,
        )
        if install_result.returncode != 0:
            click.echo(
                f"❌ npm install failed: {install_result.stderr.strip()}", err=True
            )
            sys.exit(1)


@click.command()
@click.argument("extension")
@click.option(
    "--target",
    help=(
        "Raycast flavor to deploy into, sets RAY_Target "
        "(release, x, internal, debug, x-internal, x-development). "
        "Omit to use the CLI's own resolution."
    ),
)
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(extension: str, target: str | None, json_output: bool) -> None:
    """
    Deploy a Raycast extension into a Raycast app via `ray develop`.

    Finds the extension by name in $RAYCAST_DEV_PATH/extensions/ (or accepts
    an absolute path) and runs `npm run dev`. Reports the resolved destination
    before starting, and which command bundles landed after stopping.

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/dev-server.py my-extension
        uv run ${CLAUDE_SKILL_DIR}/scripts/dev-server.py my-extension --target x
        uv run ${CLAUDE_SKILL_DIR}/scripts/dev-server.py my-extension --json
        uv run ${CLAUDE_SKILL_DIR}/scripts/dev-server.py /path/to/extension

    \b
    Notes:
        `ray develop` is the install step — the compiled command bundles are
        written into the target app's extension directory and stay there after
        the dev server stops. The running server adds hot reloading on save.

        The extension appears in Raycast as a development extension. That comes
        from the install path, not from the running process; only a Store
        install changes it.

        With several Raycast flavors installed, deploying into the wrong one
        reports success while the app in use never changes. --target picks the
        flavor explicitly; without it the CLI resolves RAY_Target, then
        "Target" in ~/.config/raycast/config.json, then release.

        Press Ctrl+C to stop the dev server.

    \b
    Environment:
        RAYCAST_DEV_PATH  Path to Raycast development repository (required)
        RAY_Target        Raycast flavor, overridden by --target

    \b
    Exit codes:
        0: Dev server stopped cleanly and every manifest command has a bundle
        1: Error, or commands left without a bundle (message on stderr)
    """
    dev_path = Path(
        require_env(
            "RAYCAST_DEV_PATH",
            "Set to your Raycast development repo path, e.g. ~/dev/raycast",
        )
    )

    extension_dir = resolve_extension_path(extension, dev_path)
    package_data = read_package_json(extension_dir)
    verify_dev_script(package_data, extension_dir)
    verify_node_modules(extension_dir)

    pinned = pinned_target(package_data)
    if pinned and target and pinned != target:
        click.echo(
            f"Conflicting targets: the dev script pins RAY_Target={pinned}, "
            f"which overrides --target {target}.",
            err=True,
        )
        click.echo(
            "   Drop --target, or change the dev script in package.json.", err=True
        )
        sys.exit(1)

    effective_target = target or pinned
    deploy_target = resolve_deploy_target(extension_dir, effective_target)
    destination = Path(deploy_target["destination"])

    title = package_data.get("title", extension_dir.name)
    extension_name = package_data.get("name", extension_dir.name)

    result: dict[str, Any] = {
        "extension": extension_name,
        "title": title,
        "path": str(extension_dir),
        "status": "starting",
        "command": "npm run dev",
        "flavor": deploy_target["flavor"],
        "bundle_id": deploy_target["bundleId"],
        "destination": str(destination),
    }

    if json_output:
        click.echo(json.dumps(result, indent=2))
    else:
        click.echo(f"Deploying '{title}' via ray develop")
        click.echo(f"  Source:      {extension_dir}")
        click.echo(
            f"  Flavor:      {deploy_target['flavor']} ({deploy_target['bundleId']})"
        )
        click.echo(f"  Destination: {destination}")
        if pinned:
            click.echo(f"  Pinned by the dev script: RAY_Target={pinned}")
        click.echo("  Hot reloading enabled — changes compile automatically")
        click.echo("  Press Ctrl+C to stop; the deploy persists")
        click.echo()

    environment = dict(os.environ)
    if effective_target:
        environment["RAY_Target"] = effective_target

    server_failed = False
    try:
        process = subprocess.run(
            ["npm", "run", "dev"],
            cwd=str(extension_dir),
            env=environment,
            text=True,
        )
        server_failed = process.returncode not in (0, -2)
        if server_failed:
            click.echo(f"Dev server exited with code {process.returncode}", err=True)

    except FileNotFoundError:
        click.echo("npm not found. Install Node.js: brew install node", err=True)
        sys.exit(1)
    except KeyboardInterrupt:
        click.echo("\nDev server stopped.")

    deployed, missing = verify_deploy(package_data, destination)

    if json_output:
        click.echo(
            json.dumps(
                {
                    **result,
                    "status": "stopped",
                    "deployed": deployed,
                    "missing": missing,
                },
                indent=2,
            )
        )
    else:
        click.echo()
        click.echo(
            f"Deployed {len(deployed)}/{len(deployed) + len(missing)} commands to {destination}"
        )
        for name in deployed:
            click.echo(f"  ok      {name}.js")
        for name in missing:
            click.echo(f"  MISSING {name}.js", err=True)

    if missing:
        click.echo(
            "Commands without a bundle report 'Missing executable' in Raycast.",
            err=True,
        )

    if server_failed or missing:
        sys.exit(1)


if __name__ == "__main__":
    main()
