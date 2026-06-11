# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
