# Super CLI

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/mikesoft.vscode-super-cli?label=Marketplace&color=6366F1)](https://marketplace.visualstudio.com/items?itemName=mikesoft.vscode-super-cli)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/mikesoft.vscode-super-cli?color=0EA5E9)](https://marketplace.visualstudio.com/items?itemName=mikesoft.vscode-super-cli)
[![CI](https://github.com/TheStreamCode/super-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/super-cli/actions/workflows/ci.yml)
[![Sponsor](https://img.shields.io/badge/Sponsor-TheStreamCode-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/TheStreamCode)

One VS Code extension to launch any coding agent CLI — **Claude Code, Codex, GitHub Copilot CLI,
Cursor, Droid, Grok, Kilo, Antigravity, OpenCode, Command Code, Crush, Hermes, MiMo Code, and your
own** — from a single sidebar and a side terminal.

Works on Windows, macOS, and Linux, and across the VS Code family (VS Code, Cursor, Antigravity,
Windsurf).

This extension is unofficial and is not affiliated with, endorsed by, or sponsored by Anthropic,
OpenAI, GitHub, Google, or any other vendor.

![Super CLI — the Coding Agents sidebar listing the built-in presets](https://raw.githubusercontent.com/TheStreamCode/super-cli/main/media/screenshots/sidebar.png)

## Install

Install **Super CLI** from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=mikesoft.vscode-super-cli),
or from the command line:

```bash
code --install-extension mikesoft.vscode-super-cli
```

You can also open the Extensions view in VS Code (or Cursor, Antigravity, Windsurf), search for
**Super CLI**, and click **Install**.

## Features

- **One launcher for every agent.** A **Super CLI** view in the activity bar lists all configured
  agents; click one to open it in a terminal beside your editor. A toolbar button and the
  **Super CLI: Launch Coding Agent** command open a quick pick of the same list.
- **Built-in presets.** Claude Code, Codex, GitHub Copilot CLI, Cursor, Droid, Grok, Kilo, Antigravity,
  OpenCode, Command Code, Crush, Hermes, and MiMo Code are available out of the box. (Gemini CLI was
  retired by Google and replaced by Antigravity.)
- **Add your own, no code required.** Define new agents in `settings.json`. The sidebar updates
  automatically.
- **Guided install.** If a built-in CLI isn't found, Super CLI offers to install it with its official
  command after explicit confirmation — npm for Claude Code, Codex, Copilot, Kilo, OpenCode, Command
  Code, Droid, Crush and MiMo Code, and the official installer script for Grok, Antigravity, Cursor
  and Hermes.
- **Native integrated terminal.** Each agent runs in a real VS Code terminal, inheriting your
  shell, `PATH`, and environment. No bundled emulator, no runtime dependencies.

## Adding or overriding an agent

Add agents through the `superCli.agents` setting. Each entry creates a new agent, or — when it
reuses a built-in `id` — overrides that built-in (for example to point at a custom binary path).

```json
"superCli.agents": [
  {
    "id": "my-agent",
    "label": "My Agent",
    "command": "my-agent",
    "icon": "rocket",
    "installCommand": "npm install -g my-agent",
    "autoInstall": false
  },
  {
    "id": "claude",
    "label": "Claude Code",
    "command": "\"C:\\Tools\\claude\\claude.exe\""
  }
]
```

- `id` — unique identifier; reuse a built-in id to override it.
- `label` — name shown in the sidebar and quick pick.
- `command` — the command that starts the CLI. On Windows, quote executable paths that contain
  spaces.
- `icon` — optional [ThemeIcon](https://code.visualstudio.com/api/references/icons-in-labels) id,
  e.g. `sparkle` or `rocket`.
- `installCommand` / `autoInstall` — optional. `installCommand` is either a cross-platform string
  (e.g. an npm command) or an object with `unix` and `windows` keys for OS-specific installers. When
  the command is missing and `autoInstall` is `true`, the launcher offers a guided install after
  explicit confirmation.
- `ensureConfig` — optional; ensure a JSON config file contains certain keys before launch (added
  only when missing, existing keys untouched). For example, opt out of a CLI's companion
  editor-extension auto-install via its own config: `{ "file": "~/.commandcode/config.json",
  "defaults": { "autoInstallExtension": false } }`.

Only the user (global) value of `superCli.agents` is used; workspace overrides are ignored so that
an untrusted repository cannot inject commands.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `superCli.agents` | `[]` | Your agents (added to or overriding the built-ins). |
| `superCli.useBuiltins` | `true` | Include the built-in agent presets. |
| `superCli.terminalLocation` | `beside` | Open the terminal `beside` the editor or in the `panel`. |

Run **Super CLI: Open Settings** from the sidebar or the command palette to jump straight to these
settings.

![Super CLI settings: agents, terminal location, and built-in presets](https://raw.githubusercontent.com/TheStreamCode/super-cli/main/media/screenshots/settings.png)

## Troubleshooting

- **"… could not be started."** The configured `command` was not found. Install the CLI, or fix the
  command in settings. The launcher uses the active editor's workspace folder as the working
  directory.
- **Nothing happens on launch.** Make sure the workspace is trusted — the launcher is disabled in
  untrusted workspaces because it runs terminal commands.
- **Command Code's companion extension.** Super CLI keeps your editor free of per-CLI companion
  extensions: when you launch Command Code it sets `autoInstallExtension: false` in
  `~/.commandcode/config.json` (Command Code's own official opt-out), so it stops auto-installing its
  editor extension. To keep that extension, set the value back to `true` there.

## Support

If Super CLI is useful to you, consider [sponsoring its development](https://github.com/sponsors/TheStreamCode).
Bug reports, feature requests, and contributions are welcome on
[GitHub](https://github.com/TheStreamCode/super-cli).

## Privacy

This extension does not collect telemetry, analytics, or personal data. It only runs the commands
you configure, in your own integrated terminal.

## Building

```bash
npm install
npm run check     # compile + unit tests + VS Code integration smoke test
npm run package   # produce the .vsix
```
