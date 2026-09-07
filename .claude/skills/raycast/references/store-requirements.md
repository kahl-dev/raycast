# Raycast Store Publishing Requirements

## Contents

- [Mandatory Assets](#mandatory-assets)
- [Package Configuration](#package-configuration)
- [Naming and Style](#naming-and-style)
- [Code Requirements](#code-requirements)
- [Security and Privacy](#security-and-privacy)
- [Review Process](#review-process)
- [Common Rejection Reasons](#common-rejection-reasons)
- [Store Categories](#store-categories)
- [Pre-Publish Checklist](#pre-publish-checklist)

---

## Mandatory Assets

### Extension Icon

| Requirement | Detail |
|-------------|--------|
| Size | 512x512 pixels |
| Format | PNG |
| Background | Solid color, not transparent |
| Content | Custom icon representing the extension's purpose |
| Restriction | Default Raycast icon is not allowed |
| Location | Root of extension directory as `icon.png` |

The icon appears in Raycast's Store listing, search results, and the user's command list. Low-effort icons (plain text on white, blurry upscales) get rejected.

### Command Icons

Each command in `package.json` should have its own icon. Use Raycast's built-in icon set (`Icon.*`) or provide custom 512x512 PNG icons in the `assets/` directory.

### Screenshots

| Requirement | Detail |
|-------------|--------|
| Minimum | 0 required, 3+ recommended |
| Format | PNG |
| Resolution | Retina (@2x) preferred |
| Content | Show the extension in use with realistic data |
| Location | `metadata/` directory, named `{command-name}-1.png`, `{command-name}-2.png` |
| Naming | Must match a command name from `package.json` |

Screenshots without realistic data (placeholder text, empty lists) weaken the listing.

### README

A `README.md` is required when the extension needs:
- API key setup or authentication
- Environment configuration
- Non-obvious usage instructions
- Third-party service accounts

Simple extensions with self-explanatory commands can omit the README.

---

## Package Configuration

### package.json Requirements

```jsonc
{
  "name": "extension-name",           // kebab-case, unique in Store
  "title": "Extension Name",          // Apple Style Guide casing
  "description": "Clear one-liner",   // What it does, not how
  "icon": "icon.png",                 // 512x512 PNG
  "author": "your-raycast-username",  // Raycast account username
  "license": "MIT",                   // MIT required
  "commands": [...]                   // At least one command
}
```

### License

MIT license is required. Include a `LICENSE` file in the extension root. Extensions with other licenses (Apache, GPL, proprietary) are rejected.

### Lock File

`package-lock.json` must be committed. The Raycast CI runs `npm ci` which requires it. Extensions with only `yarn.lock` or missing lock files fail the build step.

### Raycast API Version

Use the latest `@raycast/api` version. Extensions pinned to old API versions may be asked to upgrade during review.

---

## Naming and Style

### Apple Style Guide for Command Titles

Command titles follow Apple's Human Interface Guidelines for capitalization:

| Rule | Example |
|------|---------|
| Title Case for commands | "Search Issues", "Create Document" |
| Capitalize major words | "Open in Browser", "Copy to Clipboard" |
| Lowercase articles, prepositions (under 4 letters) | "Search for Items", "Add to Queue" |
| Capitalize first and last word regardless | "Log In", "Sign Out" |
| Verbs in imperative mood | "Search", "Create", "Open" (not "Searching", "Creates") |

### Extension Naming

| Rule | Detail |
|------|--------|
| Unique | No duplicate names in the Store |
| Descriptive | Name reflects purpose, not implementation |
| No prefixes | Don't prefix with "Raycast" |
| kebab-case | `my-extension` in `package.json` name field |
| Title Case | `My Extension` in `package.json` title field |

### Description

One clear sentence describing what the extension does. Focus on the user benefit, not technical details.

- Good: "Search and manage your Linear issues directly from Raycast"
- Bad: "A Raycast extension that uses the Linear GraphQL API to fetch issues"

---

## Code Requirements

### TypeScript

All extension code must be TypeScript. JavaScript-only submissions are rejected.

### React Components

Use Raycast's built-in components (`List`, `Detail`, `Form`, `Grid`, `ActionPanel`). Custom rendering or DOM manipulation is not supported.

### API Usage

- Use `@raycast/api` for all Raycast interactions
- Use `@raycast/utils` for common patterns (useFetch, useForm, useCachedPromise)
- Preferences for user configuration (API keys, defaults) — not hardcoded values
- `LocalStorage` or `Cache` for persistence — not filesystem writes to arbitrary paths

### Dependencies

- Minimize external dependencies
- No native/binary dependencies unless from trusted sources (node-gyp builds fail in CI)
- Binary dependencies must come from: npm registry, official package maintainers, well-known OSS projects
- Prefer `@raycast/utils` built-in helpers over third-party packages for common tasks

---

## Security and Privacy

| Restriction | Detail |
|-------------|--------|
| No external analytics | No tracking, telemetry, or analytics SDKs (Mixpanel, Amplitude, GA, etc.) |
| No Keychain access | Cannot read or write macOS Keychain |
| No arbitrary file access | Limit file operations to extension sandbox and user-selected paths |
| API keys via Preferences | Use Raycast's Preferences API, not environment variables or config files |
| No data exfiltration | Extension must not send user data to third parties without explicit consent |
| HTTPS only | All network requests must use HTTPS |

---

## Review Process

### Submission

1. Fork `raycast/extensions` on GitHub
2. Add extension to `extensions/` directory
3. Run `npm run build` to verify it compiles
4. Open PR to `raycast/extensions` main branch
5. Raycast bot runs automated checks (build, lint, icon validation)

### Timeline

| Stage | Duration |
|-------|----------|
| Automated checks | Minutes (on PR creation) |
| First human response | 3-7 business days |
| Revision turnaround | 1-3 business days per round |
| Total (clean submission) | 1-2 weeks |
| Total (with revisions) | 2-4 weeks |

### Review Criteria

Reviewers check for: functionality, code quality, naming conventions, icon quality, security compliance, duplicate detection (is there already an extension for this?), and API usage patterns.

### Post-Publish Updates

Updates follow the same PR process. Bug fixes get faster review. Breaking changes require migration notes in the PR description.

---

## Common Rejection Reasons

| Reason | Fix |
|--------|-----|
| Default or low-quality icon | Design a custom 512x512 PNG icon |
| Missing `package-lock.json` | Run `npm install` and commit the lock file |
| Non-MIT license | Switch to MIT, add LICENSE file |
| Duplicate of existing extension | Contribute to the existing extension instead |
| External analytics included | Remove all tracking/telemetry code |
| Hardcoded API keys | Move to Preferences API |
| Incorrect command title casing | Apply Apple Style Guide Title Case |
| Build failure | Run `npm run build` locally, fix TypeScript errors |
| Missing README for complex setup | Add setup instructions |
| Unnecessary dependencies | Remove unused packages, use `@raycast/utils` |
| Poor error handling | Add user-facing error messages with `showToast` |
| Keychain access | Remove Keychain usage, use Preferences instead |

---

## Store Categories

Extensions must be assigned to exactly one category in `package.json`:

| Category | Examples |
|----------|----------|
| Applications | App launchers, app-specific integrations |
| Communication | Email, chat, messaging, video calls |
| Data | Databases, data tools, converters |
| Design Tools | Figma, color tools, image manipulation |
| Developer Tools | Git, CI/CD, code utilities, API clients |
| Documentation | Note-taking, wikis, knowledge bases |
| Finance | Banking, crypto, invoicing, expense tracking |
| Fun | Games, jokes, random generators |
| Media | Music, video, podcast, streaming |
| News | RSS, news aggregators, feeds |
| Other | Anything that does not fit other categories |
| Productivity | Task management, calendars, time tracking |
| Security | Password managers, 2FA, VPN |
| System | System utilities, clipboard, window management |
| Web | Bookmarks, web search, URL tools |

---

## Pre-Publish Checklist

Run `publish-prep.py` to automate most of these checks. Manual verification items:

- [ ] `icon.png` is custom, 512x512, solid background
- [ ] `package-lock.json` is committed
- [ ] `LICENSE` file contains MIT license text
- [ ] All command titles follow Apple Style Guide
- [ ] `package.json` has correct author, description, category
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm run lint` passes (if configured)
- [ ] No external analytics or tracking code
- [ ] No Keychain access
- [ ] API keys use Preferences, not hardcoded values
- [ ] Screenshots in `metadata/` with realistic data (recommended)
- [ ] README if extension requires setup
- [ ] Searched Store for duplicates via `search-store.py`
