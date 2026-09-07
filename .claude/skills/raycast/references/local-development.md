# Local Extension Development

How an extension gets from source into a running Raycast app, and what to check when it does not arrive.

## Table of Contents

1. The Deploy Model
2. Flavor Targeting
3. What Lands Where
4. Manifest Changes
5. Verification
6. Troubleshooting

## The Deploy Model

Raycast has no separate install step for local extensions. `ray develop` compiles the extension and
writes the result directly into the target app's extension directory. **That write is the install.**
The official docs confirm both halves: `ray develop` performs an automatic Raycast import if needed,
and after stopping the dev server "The extension stays in Raycast" with its commands searchable from
the root. The running process only adds hot reload on save and error overlays.

`ray build` compiles and validates for Store submission. It installs nothing into any app. An
extension that has never been through `ray develop` reports `Missing executable. You might need to
build the extension.` no matter how many times it builds successfully — the message names the wrong
remedy, which makes this failure hard to read.

Locally deployed extensions appear as development extensions in Raycast. That status comes from the
install path, not from a running process; installing from the Store is the only thing that changes
it. There is no local build that produces a non-development install, so a permanently running dev
server is never required.

## Flavor Targeting

Several Raycast flavors can be installed side by side. One `ray` CLI serves all of them, and
`RAY_Target` selects which one a command talks to. Resolution order:

1. `RAY_Target` environment variable
2. `"Target"` in `~/.config/raycast/config.json`
3. `release` (the macOS default)

Every path derives from the resolved flavor:

| `RAY_Target` | Config and extension directory | Bundle ID | Deeplink scheme |
|---|---|---|---|
| `release` (default) | `~/.config/raycast` | `com.raycast.macos` | `raycast` |
| `x` | `~/.config/raycast-x` | `com.raycast-x.macos` | `raycast` |
| `internal` | `~/.config/raycast-internal` | `com.raycast.macos.internal` | `raycastinternal` |
| `debug` | `~/.config/raycast-debug` | `com.raycast.macos.debug` | `raycastdebug` |
| `x-internal` | `~/.config/raycast-x-internal` | `com.raycast-x.macos.internal` | `raycast-x-internal` |
| `x-development` | `~/.config/raycast-x-development` | `com.raycast-x.macos.development` | `raycast-x-development` |

Source: `raycastConfigDirectory()`, `raycastBundleID()`, `raycastAppScheme()` and
`extensionBuildDirectory()` in `@raycast/api/dist/config.js`. Raycast does not document `RAY_Target`
at all — this table is read from the CLI implementation, so it can change between CLI versions.
Derive the answer from the installed CLI rather than trusting the table when it matters.

Ask the CLI rather than assuming — this reports where the next deploy will actually land:

```bash
node -e 'const c=require("./node_modules/@raycast/api/dist/config.js");console.log(c.extensionBuildDirectory())'
```

To target a non-default flavor for one command, prefix it: `RAY_Target=x npm run dev`. To make a
flavor the permanent default, add `"Target": "<flavor>"` to `~/.config/raycast/config.json` — the
CLI reads that file before resolving anything else, so the key redirects every later `ray` command.

A third option pins the flavor per extension, in the manifest's dev script:

```json
"dev": "RAY_Target=x ray develop"
```

The inline assignment is applied inside the npm script and therefore wins over whatever environment
the caller passed down. That makes the pin the most visible of the three — it sits at the point of
use, under version control — and it is why tooling should read such a pin rather than try to
override it from outside.

The trap worth internalizing: with more than one flavor installed, deploying to the wrong one is
indistinguishable from a successful deploy. The CLI prints `built extension successfully`, the files
land, and the app the user actually opens never changes. Before concluding that a code change had no
effect, confirm the target.

Note on deeplinks: `release` and `x` both resolve to the `raycast` scheme. Which app answers a
`raycast://` URL when both are installed is not established here — treat deeplink-based operations
(settings export, MCP install) as ambiguous in a multi-flavor setup.

## What Lands Where

Deploy destination is `<config directory>/extensions/<name from package.json>/`, containing:

| File | Meaning |
|---|---|
| `<command-name>.js` | One compiled bundle per entry in the manifest's `commands` array. These are the executables Raycast runs. |
| `package.json` | The manifest Raycast reads. Written by both `ray develop` and Import Extension. |
| `assets/` | Icons and other bundled assets, copied from source. |
| `<command-name>.js.map` | Source map. Optional and not always regenerated. |
| `dev.log` | Runtime log written by the app, not by the CLI. |
| `cli.pid` | Present while a dev session holds the extension; removed on clean shutdown. |

Renamed or removed commands leave their old files behind — the CLI does not prune the directory. The
manifest decides what Raycast shows, so stale `.js` and `.js.map` files are clutter rather than a
fault signal.

## Manifest Changes

Code changes inside commands that already exist propagate by hot reload while a dev session runs.

Adding, renaming, or removing a command changes the manifest, and an app may keep serving its cached
version. Where that happens, the fix is to remove the extension in the app's settings and run its
`Import Extension` command on the source folder.

**An import can leave the extension directory holding only `package.json` and `assets/`** — manifest
and icons present, not a single command bundle. Every command then appears in Raycast and none of
them runs. Raycast does not document what Import Extension writes, so treat the mechanism as
unsettled and the remedy as fixed: after any re-import, run `ray develop` once and verify the
bundles landed.

## Verification

The check that closes the loop — every command in the manifest has a bundle on disk:

```bash
DEST=$(node -e 'console.log(require("./node_modules/@raycast/api/dist/config.js").extensionBuildDirectory())')
diff <(node -pe 'require("./package.json").commands.map(c=>c.name+".js").sort().join("\n")') \
     <(cd "$DEST" && ls *.js 2>/dev/null | sort)
```

No output means the deploy is complete. A directory containing only `package.json` and `assets/` is a
registered-but-not-deployed extension.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Missing executable. You might need to build the extension.` | No command bundles in the extension directory | Run `ray develop` against the correct flavor. Building does not help despite what the message says. |
| Build succeeds, the app is unchanged | Deployed to a different flavor than the one in use | Resolve the target, then redeploy with the right `RAY_Target` |
| New or renamed command does not appear | App serving a cached manifest | Remove the extension in settings, `Import Extension`, then `ray develop` |
| Commands listed but every one errors | Import ran without a following deploy | Run `ray develop` |

## Sources

Which claims rest on official documentation and which on inspection — check the latter against the
installed CLI before relying on them.

| Claim | Basis |
|---|---|
| Extension stays installed after the dev server stops | Official docs, "Create your first extension" |
| `ray develop` imports into Raycast, `ray build` produces a distribution build validated with `-e dist` | Official docs, "Developer Tools > CLI" |
| Development status vs Store install | Official docs, `environment.isDevelopment` — "a development command (vs. an installed command from the Store)" |
| Manifest shape, `commands[].name` | Official docs, "Information > Manifest" |
| Flavor mapping: `RAY_Target` → directory, bundle ID, scheme | Undocumented. Read from `@raycast/api/dist/config.js` and confirmed by executing it. |
| Resolution order env → `config.json` → `release` | Undocumented. Confirmed by executing the CLI config module against a throwaway `HOME`. |
| Import leaving a directory without command bundles | Undocumented. Observed once, remedy confirmed. |
