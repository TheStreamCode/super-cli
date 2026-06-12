# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
