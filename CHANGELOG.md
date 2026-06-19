# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.7.3]

- **Fixed the Droid install command.** The `droid` built-in now installs the official scoped npm
  package `@factory/cli` (which provides the `droid` binary) instead of the incorrect unscoped
  `droid` package.
- **Raised the minimum VS Code version to `^1.93.0`**, the actual floor for the terminal shell
  integration APIs the extension uses (the manifest previously declared `^1.86.0`).
- **Added** `CONTRIBUTING.md`, `SECURITY.md`, `SUPPORT.md`, and `TRADEMARKS.md` governance documents,
  and compiled against the `ES2022` target. No functional changes beyond the Droid fix.

## [0.7.2]

- **Docs.** README updated to reflect 0.7.1: Cursor, Grok and Hermes now install natively on Windows
  (PowerShell), and Cursor, OpenCode and Droid show an update button. No functional changes.

## [0.7.1]

- **Verified every built-in CLI against current official sources** and completed the install/update
  presets:
  - **Native Windows installers** added for **Cursor**, **Grok**, and **Hermes** (these now ship a
    PowerShell installer upstream, so guided install works on native Windows, not only under WSL).
  - **Update buttons** added for **Cursor** (`cursor-agent update`), **OpenCode** (`opencode upgrade`),
    and **Droid** (`droid update`), which now expose official update commands.
- No changes to commands or package names — claude, codex, copilot, kilo, crush (`@charmland/crush`),
  command-code, antigravity, droid (`droid`), and mimo were all confirmed correct.

## [0.7.0]

- **Favorite agent.** Mark an agent as your favorite with the star (★) button next to it in the
  sidebar, and launch it from anywhere with **`Ctrl+Alt+A`** (`Cmd+Alt+A` on macOS; remappable in
  Keyboard Shortcuts). When no favorite is set, the shortcut opens the picker and offers to remember
  your choice. Stored in the new `superCli.favoriteAgent` setting.
- **Install-status indicator.** Agents whose CLI isn't found on your `PATH` are shown dimmed and
  marked *not installed* (best-effort, no process spawned). Not shown under `superCli.useWsl`, since
  the Windows `PATH` doesn't reflect what's installed inside WSL.

## [0.6.2]

- Added an **Open VSX** badge to the README (Super CLI is published on Open VSX for Cursor, Windsurf, VSCodium, and Gitpod users).
- Unified the `LICENSE` copyright holder to **Michael Gasperini (Mikesoft)**. No functional changes.

## [0.6.1]

- Marketplace discoverability: added the **AI** and **Chat** categories, a more descriptive title and
  summary, reordered keywords, and a **FAQ** in the README. No functional changes.

## [0.6.0]

- **Per-agent Update button.** Each sidebar agent that has a known update command now shows an update
  button next to Launch, which runs the CLI's official update (e.g. `codex update`, `copilot update`,
  `kilo upgrade`, `hermes update`, `claude update`, npm reinstall for Crush). CLIs that update
  themselves (OpenCode, Cursor, Droid, MiMo Code, Command Code) don't show one.
- New `updateCommand` agent field carrying each CLI's official update command.
- **Removed the `superCli.autoUpdate` setting** (added in 0.5.0): updating is now manual via the
  Update button, since most CLIs already self-update.
- **`superCli.useWsl`** (new): on Windows, open agents in a WSL terminal (native VS Code support);
  under WSL the agents use their Unix install/update commands.

## [0.5.0]

- New `superCli.autoUpdate` setting (default on): each coding agent CLI is updated to its latest
  version on launch — `npm install -g` for npm CLIs, or the official installer script for the others —
  before it starts. Turn it off to launch without updating.

## [0.4.1]

- Claude Code no longer auto-installs its companion IDE extension when launched from Super CLI. The
  launcher sets Claude Code's official `CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL` environment variable on the
  agent's terminal — in keeping with Super CLI's "one extension for every CLI" philosophy.
- New optional agent field `env` to set environment variables for an agent's terminal.

## [0.4.0]

- Added **Cursor CLI** (`cursor-agent`), **Droid CLI** (`droid`), **Crush** (`crush`), **Hermes**
  (`hermes`), and **MiMo Code** (`mimo`) to the built-in agent presets.
- Command Code no longer installs its companion editor extension when launched from Super CLI.
  In keeping with Super CLI's "one extension for every CLI" philosophy, the launcher sets
  `autoInstallExtension: false` in `~/.commandcode/config.json` (Command Code's own official opt-out)
  before launching it — added only if you have not set the value yourself.
- New optional agent field `ensureConfig` to ensure a CLI's JSON config contains certain keys before
  launch (existing keys are never overwritten).

## [0.3.2]

- Added a GitHub Sponsors link on the repository and the Marketplace listing.
- Added sidebar and settings screenshots to the README.
- Tidied documentation and metadata: keywords aligned to the built-in agents, and the per-OS
  `installCommand` form is now documented.

## [0.3.1]

- **Command Code** now launches with the `command-code` command instead of `cmd`, which Windows
  intercepts as the built-in Command Prompt. The new command works on Windows, macOS, Linux, and WSL.

## [0.3.0]

- Added **Command Code** (`cmd`, npm `command-code`) to the built-in presets.
- **Removed Gemini CLI**: Google retired it on June 18, 2026 in favor of **Antigravity CLI**, which is
  already included. Antigravity now uses Gemini's former icon.
- **Grok** and **Antigravity** now offer a guided install using their official installer scripts.
- `installCommand` can now be OS-specific: it accepts either a string (cross-platform, e.g. npm) or an
  object with `unix` and `windows` keys. The guided install runs the resolved command directly in a
  terminal after the confirmation dialog.

## [0.2.1]

- **Kilo** now installs from its official npm package (`@kilocode/cli`), so it joins the guided-install
  flow. Grok and Antigravity are distributed as standalone binaries (no official npm package), so they
  keep launching without an auto-install offer.

## [0.2.0]

- Added **OpenCode** to the built-in agent presets.
- Built-in CLIs that install from npm (Claude Code, Codex, Copilot, Gemini, OpenCode) now offer a
  guided install with their official command when the command is not found. Grok, Kilo, and
  Antigravity use OS-specific shell installers and are not auto-offered; add a custom `installCommand`
  for your platform if you want one.

## [0.1.0]

- Initial release.
- Unified launcher for coding agent CLIs with a **Super CLI** sidebar view and a quick-pick command.
- Built-in presets: Claude Code, Codex, GitHub Copilot CLI, Gemini, Grok, Kilo, Antigravity.
- User-extensible agent registry via the `superCli.agents` setting, with id-based overrides of the
  built-ins.
- Native integrated terminal launch with cross-platform missing-command detection and optional
  guided install.
- Themed monochrome activity-bar icon and a full-color toolbar/Marketplace icon.
