# Jira Hub

Unified Jira dashboard for Raycast. Replaces the manual scan of a Jira-Browser-Dashboard with a list that surfaces what needs action first.

## What it does

**Command: Jira Dashboard** — Unified List with Action-Priority sections:

- 🔴 **Needs Action** — tickets that are overbooked (≥ 80% of estimate logged), have an unanswered comment older than 1 workday, or are stale (In-Progress with no update for > 5 workdays)
- 🟡 **Sprint** — your tickets in the active sprint (with sprint countdown in the header)
- 🟠 **Kunden** — customer-project tickets (everything outside the internal project keys)
- ⚫ **Intern** — internal core projects (LIA, LIAKI, LIAC by default)
- ⬜ **LIADEV** — dev/backlog (shown dimmed)

Right-side **Detail Panel** (⌘D) shows the last 3 comments + status/estimate/spent/assignee at a glance.

**Dropdown** switches between Action / Bucket / Flat views.

**Command: Jira Status** — Always-on counts in the macOS menu bar (Sprint · ⚠ Needs-Action). Refreshes every 5 minutes.

## Setup

Open Raycast → Preferences → Extensions → Jira Hub:

| Field | Notes |
|---|---|
| Jira Instance URL | e.g. `https://your-company.atlassian.net` |
| Atlassian Email | your login email |
| Atlassian API Token | create at https://id.atlassian.com/manage-profile/security/api-tokens |

Project-classification and threshold defaults can be tweaked but match a typical agile setup out of the box.

## Read-only by design

This extension does not write to Jira. Add Worklog / Add Comment / Transition / Estimate all stay in the Jira browser — the extension complements that workflow, it doesn't replace it.

## Keyboard

| Shortcut | Action |
|---|---|
| ↩ | Open ticket in Jira browser |
| ⌘C | Copy ticket key |
| ⌘⇧C | Copy ticket URL |
| ⌘B | Copy branch name (`feat/KEY-summary-slug`) |
| ⌘D | Toggle Detail Panel |
| ⌘⌃R | Force refresh (skip cache) |
