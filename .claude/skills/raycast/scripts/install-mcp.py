#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Generate a Raycast MCP server install deeplink.

Creates the raycast://mcp/install deeplink for one-click MCP server
installation in Raycast AI. Supports command, args, and environment
variable configuration.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/install-mcp.py --command "npx" --args "-y @modelcontextprotocol/server-github" --env "GITHUB_TOKEN=xxx"
    uv run ${CLAUDE_SKILL_DIR}/scripts/install-mcp.py --from-json config.json --open
    uv run ${CLAUDE_SKILL_DIR}/scripts/install-mcp.py --command "uvx" --args "mcp-server-fetch" --name "Fetch" --json
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any
from urllib.parse import quote, urlencode

import click


def parse_env_pairs(env_pairs: tuple[str, ...]) -> dict[str, str]:
    """Parse KEY=VALUE environment variable pairs."""
    environment: dict[str, str] = {}
    for pair in env_pairs:
        if "=" not in pair:
            raise ValueError(
                f"Invalid environment variable format: '{pair}'. Expected KEY=VALUE"
            )
        key, value = pair.split("=", 1)
        if not key.strip():
            raise ValueError(f"Empty key in environment variable: '{pair}'")
        environment[key.strip()] = value
    return environment


def validate_config(config: dict[str, Any]) -> None:
    """Validate MCP server configuration."""
    if "command" not in config or not config["command"]:
        raise ValueError("MCP config requires 'command' field")

    command = config["command"]
    if not isinstance(command, str):
        raise ValueError(f"'command' must be a string, got {type(command).__name__}")

    if "args" in config:
        args = config["args"]
        if isinstance(args, str):
            config["args"] = args.split()
        elif not isinstance(args, list):
            raise ValueError(
                f"'args' must be a string or list, got {type(args).__name__}"
            )

    if "env" in config and not isinstance(config["env"], dict):
        raise ValueError(f"'env' must be an object, got {type(config['env']).__name__}")


def load_json_config(json_path: Path) -> dict[str, Any]:
    """Load MCP config from a JSON file."""
    if not json_path.exists():
        raise FileNotFoundError(f"Config file not found: {json_path}")

    content = json_path.read_text(encoding="utf-8")
    config = json.loads(content)

    if not isinstance(config, dict):
        raise ValueError(f"Expected JSON object, got {type(config).__name__}")

    return config


def build_deeplink(config: dict[str, Any], name: str | None) -> str:
    """Build the raycast://mcp/install deeplink."""
    parameters: dict[str, str] = {}

    if name:
        parameters["name"] = name

    parameters["command"] = config["command"]

    if "args" in config and config["args"]:
        args = config["args"]
        if isinstance(args, list):
            parameters["args"] = json.dumps(args)
        else:
            parameters["args"] = json.dumps([args])

    if "env" in config and config["env"]:
        parameters["env"] = json.dumps(config["env"])

    query_string = urlencode(parameters, quote_via=quote)
    return f"raycast://mcp/install?{query_string}"


def open_deeplink(deeplink: str) -> None:
    """Open the deeplink via macOS `open` command."""
    result = subprocess.run(
        ["open", deeplink],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"Failed to open deeplink: {result.stderr.strip()}")


def output_json(config: dict[str, Any], deeplink: str, name: str | None) -> None:
    """Output install data as JSON."""
    click.echo(
        json.dumps(
            {
                "name": name or config["command"],
                "config": config,
                "deeplink": deeplink,
            },
            indent=2,
        )
    )


def output_human(
    config: dict[str, Any], deeplink: str, name: str | None, opened: bool
) -> None:
    """Output install data in human-readable format."""
    display_name = name or config["command"]
    click.echo(f"MCP Server: {display_name}\n")
    click.echo(f"  Command: {config['command']}")

    if "args" in config and config["args"]:
        args = config["args"]
        if isinstance(args, list):
            click.echo(f"  Args: {' '.join(args)}")
        else:
            click.echo(f"  Args: {args}")

    if "env" in config and config["env"]:
        click.echo("  Environment:")
        for key, value in config["env"].items():
            masked = value[:4] + "..." if len(value) > 8 else "***"
            click.echo(f"    {key}={masked}")

    click.echo()

    if opened:
        click.echo("Deeplink opened — Raycast will prompt for installation.")
    else:
        click.echo("Deeplink (run to install in Raycast):")
        click.echo(f'  open "{deeplink}"')
        click.echo()
        click.echo("Or use --open to open directly.")


@click.command()
@click.option(
    "--command", "mcp_command", help="MCP server command (e.g., npx, uvx, node)"
)
@click.option(
    "--args",
    "mcp_args",
    help='Command arguments as a single string (e.g., "-y @modelcontextprotocol/server-github")',
)
@click.option(
    "--env",
    "env_pairs",
    multiple=True,
    help="Environment variable as KEY=VALUE (repeatable)",
)
@click.option("--name", default=None, help="Display name for the MCP server")
@click.option(
    "--from-json",
    "json_path",
    type=click.Path(exists=False),
    help="Load config from JSON file ({command, args, env})",
)
@click.option("--open", "open_link", is_flag=True, help="Open the deeplink in Raycast")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
def main(
    mcp_command: str | None,
    mcp_args: str | None,
    env_pairs: tuple[str, ...],
    name: str | None,
    json_path: str | None,
    open_link: bool,
    json_output: bool,
) -> None:
    """
    Generate a Raycast MCP server install deeplink.

    Creates the raycast://mcp/install?... deeplink for one-click
    installation of MCP servers in Raycast AI.

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/install-mcp.py --command "npx" --args "-y @modelcontextprotocol/server-github" --env "GITHUB_TOKEN=ghp_xxx"
        uv run ${CLAUDE_SKILL_DIR}/scripts/install-mcp.py --command "uvx" --args "mcp-server-fetch" --name "Fetch" --open
        uv run ${CLAUDE_SKILL_DIR}/scripts/install-mcp.py --from-json mcp-config.json --open
        uv run ${CLAUDE_SKILL_DIR}/scripts/install-mcp.py --command "node" --args "dist/index.js" --env "API_KEY=xxx" --env "BASE_URL=https://api.example.com" --json

    \b
    JSON config format:
        {"command": "npx", "args": ["-y", "server-name"], "env": {"KEY": "value"}}

    \b
    Exit codes:
        0: Success
        1: Error (message on stderr)
    """
    try:
        config: dict[str, Any]

        if json_path:
            config = load_json_config(Path(json_path))
        elif mcp_command:
            config = {"command": mcp_command}
            if mcp_args:
                config["args"] = mcp_args.split()
            if env_pairs:
                config["env"] = parse_env_pairs(env_pairs)
        else:
            click.echo(
                "❌ Provide either --command for inline config, "
                "or --from-json for file-based config",
                err=True,
            )
            sys.exit(1)

        validate_config(config)

        deeplink = build_deeplink(config, name)

        if open_link:
            open_deeplink(deeplink)

        if json_output:
            output_json(config, deeplink, name)
        else:
            output_human(config, deeplink, name, open_link)

    except (FileNotFoundError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        click.echo(f"❌ {error}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
