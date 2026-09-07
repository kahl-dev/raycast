#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "click>=8.1.7",
# ]
# ///
"""
Search the Raycast Store for extensions via GitHub API.

Uses `gh` CLI to search the raycast/extensions monorepo. Each extension
is a directory with a package.json containing metadata.

Usage:
    uv run ${CLAUDE_SKILL_DIR}/scripts/search-store.py "github notifications"
    uv run ${CLAUDE_SKILL_DIR}/scripts/search-store.py "clipboard" --limit 5
    uv run ${CLAUDE_SKILL_DIR}/scripts/search-store.py "todoist" --json
"""

from __future__ import annotations

import json
import subprocess
import sys
from typing import Any

import click


def search_github(query: str, limit: int) -> list[dict[str, Any]]:
    """Search raycast/extensions repo for matching extensions."""
    search_query = (
        f"{query} repo:raycast/extensions filename:package.json path:extensions"
    )

    result = subprocess.run(
        [
            "gh",
            "api",
            "search/code",
            "-f",
            f"q={search_query}",
            "-f",
            f"per_page={limit}",
            "--jq",
            ".items[] | {path: .path, name: .name, score: .score}",
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        if "gh: command not found" in result.stderr:
            click.echo(
                "❌ GitHub CLI (gh) not found. Install: brew install gh", err=True
            )
            sys.exit(1)
        raise RuntimeError(f"GitHub API search failed: {result.stderr.strip()}")

    results = []
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        try:
            item = json.loads(line)
            extension_path = item["path"].rsplit("/package.json", 1)[0]
            extension_name = extension_path.split("/")[-1]
            results.append(
                {
                    "name": extension_name,
                    "path": extension_path,
                    "score": item.get("score", 0),
                }
            )
        except (json.JSONDecodeError, KeyError, IndexError):
            continue

    seen = set()
    deduplicated = []
    for item in results:
        if item["name"] not in seen:
            seen.add(item["name"])
            deduplicated.append(item)

    return deduplicated


def fetch_extension_metadata(extension_path: str) -> dict[str, Any] | None:
    """Fetch package.json for an extension from GitHub."""
    result = subprocess.run(
        [
            "gh",
            "api",
            f"repos/raycast/extensions/contents/{extension_path}/package.json",
            "--jq",
            ".content",
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return None

    import base64

    try:
        content = base64.b64decode(result.stdout.strip()).decode()
        return json.loads(content)
    except (json.JSONDecodeError, Exception):
        return None


def enrich_results(
    results: list[dict[str, Any]], fetch_metadata: bool
) -> list[dict[str, Any]]:
    """Optionally enrich search results with full package.json metadata."""
    if not fetch_metadata:
        return results

    enriched = []
    for item in results:
        metadata = fetch_extension_metadata(item["path"])
        if metadata:
            item["title"] = metadata.get("title", item["name"])
            item["description"] = metadata.get("description", "")
            item["author"] = metadata.get("author", "")
            item["version"] = metadata.get("version", "")
            item["commands"] = len(metadata.get("commands", []))
            item["store_url"] = (
                f"https://raycast.com/{metadata.get('author', '')}/{item['name']}"
            )
        enriched.append(item)

    return enriched


def output_json(data: list[dict[str, Any]]) -> None:
    """Output data as JSON."""
    click.echo(json.dumps(data, indent=2))


def output_human(data: list[dict[str, Any]], query: str) -> None:
    """Output data in human-readable format."""
    if not data:
        click.echo(f"No extensions found for '{query}'")
        return

    click.echo(f"Raycast Store results for '{query}' ({len(data)} found):\n")

    for item in data:
        title = item.get("title", item["name"])
        description = item.get("description", "")
        author = item.get("author", "")
        commands = item.get("commands", "?")
        store_url = item.get("store_url", "")

        click.echo(f"  {title}")
        if description:
            click.echo(f"    {description[:80]}")
        if author:
            click.echo(f"    by {author} — {commands} command(s)")
        if store_url:
            click.echo(f"    {store_url}")
        click.echo()


@click.command()
@click.argument("query")
@click.option("--limit", default=10, help="Maximum results (default: 10)")
@click.option("--json", "json_output", is_flag=True, help="Output as JSON")
@click.option(
    "--detailed", is_flag=True, help="Fetch full metadata for each result (slower)"
)
def main(query: str, limit: int, json_output: bool, detailed: bool) -> None:
    """
    Search the Raycast Store for extensions.

    Searches the raycast/extensions GitHub monorepo using the GitHub API
    via the `gh` CLI. All 2000+ Store extensions are searchable.

    \b
    Examples:
        uv run ${CLAUDE_SKILL_DIR}/scripts/search-store.py "github"
        uv run ${CLAUDE_SKILL_DIR}/scripts/search-store.py "clipboard manager" --limit 5
        uv run ${CLAUDE_SKILL_DIR}/scripts/search-store.py "todoist" --detailed
        uv run ${CLAUDE_SKILL_DIR}/scripts/search-store.py "color picker" --json

    \b
    Options:
        --detailed  Fetches package.json for each result (adds title, description,
                    author, command count, Store URL). Slower due to extra API calls.

    \b
    Requirements:
        gh CLI authenticated (brew install gh && gh auth login)

    \b
    Exit codes:
        0: Success
        1: Error (message on stderr)
    """
    try:
        results = search_github(query, limit)
        results = enrich_results(results, detailed or json_output)

        if json_output:
            output_json(results)
        else:
            output_human(results, query)

    except FileNotFoundError:
        click.echo("❌ GitHub CLI (gh) not found. Install: brew install gh", err=True)
        sys.exit(1)
    except RuntimeError as e:
        click.echo(f"❌ {e}", err=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
