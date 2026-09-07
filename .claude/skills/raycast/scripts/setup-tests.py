#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Add Vitest testing setup to a Raycast extension.

Installs vitest and @types/node, creates vitest.config.ts,
a sample test file, and adds a "test" script to package.json.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/setup-tests.py my-extension
    uv run ${CLAUDE_SKILL_DIR}/scripts/setup-tests.py my-extension --dry-run
    uv run ${CLAUDE_SKILL_DIR}/scripts/setup-tests.py my-extension --json
"""

from __future__ import annotations

import json
import os
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


VITEST_CONFIG = """\
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}", "src/__tests__/**"],
    },
  },
});
"""

SAMPLE_TEST = """\
import { describe, it, expect } from "vitest";

describe("example", () => {
  it("adds numbers correctly", () => {
    expect(1 + 1).toBe(2);
  });

  it("handles string concatenation", () => {
    expect("hello" + " " + "world").toBe("hello world");
  });
});
"""


def read_package_json(extension_dir: Path) -> dict[str, Any]:
    """Read and parse package.json from extension directory."""
    package_json = extension_dir / "package.json"
    if not package_json.exists():
        click.echo(f"❌ No package.json found in: {extension_dir}", err=True)
        sys.exit(1)

    return json.loads(package_json.read_text())


def write_package_json(extension_dir: Path, data: dict[str, Any]) -> None:
    """Write package.json with consistent formatting."""
    package_json = extension_dir / "package.json"
    package_json.write_text(json.dumps(data, indent=2) + "\n")


def check_existing_setup(
    extension_dir: Path, package_data: dict[str, Any]
) -> list[str]:
    """Check for existing test setup and return list of conflicts."""
    conflicts = []

    dev_dependencies = package_data.get("devDependencies", {})
    if "vitest" in dev_dependencies:
        conflicts.append(
            f"vitest already in devDependencies ({dev_dependencies['vitest']})"
        )

    scripts = package_data.get("scripts", {})
    if "test" in scripts:
        conflicts.append(f"'test' script already defined: {scripts['test']}")

    vitest_config = extension_dir / "vitest.config.ts"
    if vitest_config.exists():
        conflicts.append("vitest.config.ts already exists")

    return conflicts


def install_dependencies(extension_dir: Path) -> subprocess.CompletedProcess[str]:
    """Install vitest and @types/node as dev dependencies."""
    return subprocess.run(
        ["npm", "install", "--save-dev", "vitest", "@types/node"],
        cwd=str(extension_dir),
        capture_output=True,
        text=True,
        timeout=120,
    )


@click.command()
@click.argument("extension")
@click.option(
    "--dry-run", is_flag=True, help="Show what would be created without creating"
)
@click.option("--force", is_flag=True, help="Overwrite existing test setup")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(extension: str, dry_run: bool, force: bool, json_output: bool) -> None:
    """
    Add Vitest testing setup to a Raycast extension.

    Installs vitest and @types/node as dev dependencies, creates a
    vitest.config.ts with TypeScript support, adds a sample test file
    in src/__tests__/, and adds a "test" script to package.json.

    \b
    What gets created:
        vitest.config.ts           Vitest configuration with TypeScript
        src/__tests__/example.test.ts  Sample test file
        package.json               Updated with "test" script + devDependencies

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/setup-tests.py my-extension
        uv run ${CLAUDE_SKILL_DIR}/scripts/setup-tests.py my-extension --dry-run
        uv run ${CLAUDE_SKILL_DIR}/scripts/setup-tests.py my-extension --force
        uv run ${CLAUDE_SKILL_DIR}/scripts/setup-tests.py my-extension --json

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

    extension_dir = resolve_extension_path(extension, dev_path)
    package_data = read_package_json(extension_dir)

    title = package_data.get("title", extension_dir.name)
    extension_name = package_data.get("name", extension_dir.name)

    conflicts = check_existing_setup(extension_dir, package_data)
    if conflicts and not force:
        click.echo(f"❌ Existing test setup detected in '{title}':", err=True)
        for conflict in conflicts:
            click.echo(f"   - {conflict}", err=True)
        click.echo("", err=True)
        click.echo("   Use --force to overwrite", err=True)
        sys.exit(1)

    vitest_config_path = extension_dir / "vitest.config.ts"
    tests_dir = extension_dir / "src" / "__tests__"
    sample_test_path = tests_dir / "example.test.ts"

    files_to_create = [
        {"path": str(vitest_config_path), "description": "Vitest configuration"},
        {"path": str(sample_test_path), "description": "Sample test file"},
    ]

    result: dict[str, Any] = {
        "extension": extension_name,
        "title": title,
        "path": str(extension_dir),
        "files": files_to_create,
        "dependencies_added": ["vitest", "@types/node"],
        "scripts_added": {"test": "vitest run", "test:watch": "vitest"},
    }

    if dry_run:
        result["status"] = "dry_run"
        if json_output:
            click.echo(json.dumps(result, indent=2))
        else:
            click.echo(f"Would set up Vitest for '{title}':")
            click.echo()
            click.echo("  Files to create:")
            for file_info in files_to_create:
                click.echo(f"    {file_info['path']}")
                click.echo(f"      {file_info['description']}")
            click.echo()
            click.echo("  Dev dependencies to add:")
            click.echo("    vitest, @types/node")
            click.echo()
            click.echo("  Scripts to add:")
            click.echo('    "test": "vitest run"')
            click.echo('    "test:watch": "vitest"')
        return

    # 1. Write vitest.config.ts
    vitest_config_path.write_text(VITEST_CONFIG)

    # 2. Create sample test
    tests_dir.mkdir(parents=True, exist_ok=True)
    if not sample_test_path.exists() or force:
        sample_test_path.write_text(SAMPLE_TEST)

    # 3. Update package.json scripts
    if "scripts" not in package_data:
        package_data["scripts"] = {}
    package_data["scripts"]["test"] = "vitest run"
    package_data["scripts"]["test:watch"] = "vitest"
    write_package_json(extension_dir, package_data)

    # 4. Install dependencies
    if not json_output:
        click.echo(f"Setting up Vitest for '{title}'...")
        click.echo()

    try:
        install_result = install_dependencies(extension_dir)
        if install_result.returncode != 0:
            click.echo(
                f"❌ npm install failed: {install_result.stderr.strip()}", err=True
            )
            sys.exit(1)
    except FileNotFoundError:
        click.echo("❌ npm not found. Install Node.js: brew install node", err=True)
        sys.exit(1)
    except subprocess.TimeoutExpired:
        click.echo("❌ npm install timed out after 120 seconds", err=True)
        sys.exit(1)

    result["status"] = "created"

    if json_output:
        click.echo(json.dumps(result, indent=2))
    else:
        click.echo("✅ Vitest setup complete")
        click.echo()
        click.echo("  Created:")
        click.echo(f"    {vitest_config_path}")
        click.echo(f"    {sample_test_path}")
        click.echo()
        click.echo("  Added to package.json:")
        click.echo('    scripts.test = "vitest run"')
        click.echo('    scripts.test:watch = "vitest"')
        click.echo("    devDependencies: vitest, @types/node")
        click.echo()
        click.echo("  Run tests:")
        click.echo(f"    cd {extension_dir}")
        click.echo("    npm test")
        click.echo("    npm run test:watch  # watch mode")


if __name__ == "__main__":
    main()
