# Super CLI

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/mikesoft.vscode-super-cli?label=Marketplace&color=6366F1)](https://marketplace.visualstudio.com/items?itemName=mikesoft.vscode-super-cli)
[![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/mikesoft.vscode-super-cli?color=0EA5E9)](https://marketplace.visualstudio.com/items?itemName=mikesoft.vscode-super-cli)
[![CI](https://github.com/TheStreamCode/super-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/super-cli/actions/workflows/ci.yml)

One VS Code extension to launch any coding agent CLI — **Claude Code, Codex, GitHub Copilot CLI,
Gemini, Grok, Kilo, Antigravity, OpenCode, and your own** — from a single sidebar and a side terminal.

Works on Windows, macOS, and Linux, and across the VS Code family (VS Code, Cursor, Antigravity,
Windsurf).

This extension is unofficial and is not affiliated with, endorsed by, or sponsored by Anthropic,
OpenAI, GitHub, Google, or any other vendor.

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
- **Built-in presets.** Claude Code, Codex, GitHub Copilot CLI, Gemini, Grok, Kilo, Antigravity, and
  OpenCode are available out of the box.
- **Add your own, no code required.** Define new agents in `settings.json`. The sidebar updates
  automatically.
- **Guided install.** If a built-in CLI that installs from npm (Claude Code, Codex, Copilot, Gemini,
  Kilo, OpenCode) isn't found, Super CLI offers to install it with its official command — after
  explicit confirmation.
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
- `installCommand` / `autoInstall` — optional; when the command is missing and `autoInstall` is
  `true`, the launcher offers a guided install after explicit confirmation.

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

## Troubleshooting

- **"… could not be started."** The configured `command` was not found. Install the CLI, or fix the
  command in settings. The launcher uses the active editor's workspace folder as the working
  directory.
- **Nothing happens on launch.** Make sure the workspace is trusted — the launcher is disabled in
  untrusted workspaces because it runs terminal commands.

## Privacy

This extension does not collect telemetry, analytics, or personal data. It only runs the commands
you configure, in your own integrated terminal.

## Building

```bash
npm install
npm run check     # compile + unit tests + VS Code integration smoke test
npm run package   # produce the .vsix
```
