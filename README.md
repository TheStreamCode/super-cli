# Super CLI

One launcher. Every coding agent.

[![CI](https://github.com/TheStreamCode/super-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/TheStreamCode/super-cli/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Visual Studio Marketplace](https://img.shields.io/visual-studio-marketplace/v/mikesoft.vscode-super-cli?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=mikesoft.vscode-super-cli)

![Super CLI — one secure VS Code launcher for more than 30 AI coding-agent CLIs](media/social-preview.png)

Launch Claude Code, OpenAI Codex CLI, GitHub Copilot CLI, Google Antigravity, OpenCode, and other AI coding agents from one VS Code sidebar and terminal, without replacing each CLI's official experience. It works on Windows, macOS, Linux, and WSL, and in any editor that supports the VS Code extension model.

It is free, open source, has zero runtime dependencies, and collects no telemetry.

> **Independent project.** Super CLI is unofficial and is not affiliated with, endorsed by, or sponsored by Anthropic, OpenAI, GitHub, Google, or any other vendor. See the [third-party notices](TRADEMARKS.md).

## Install

Install Super CLI in VS Code from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=mikesoft.vscode-super-cli), or run:

```bash
code --install-extension mikesoft.vscode-super-cli
```

VS Code forks install from [Open VSX](https://open-vsx.org/extension/mikesoft/vscode-super-cli), or install a reviewed `.vsix` from [GitHub releases](https://github.com/TheStreamCode/super-cli/releases) via **Extensions: Install from VSIX...**. Zed and JetBrains IDEs cannot load a `.vsix`.

## Quick start

1. Install and authenticate the coding-agent CLI you want to use.
2. Install Super CLI, open a folder, and trust the workspace.
3. Open **Super CLI** from the activity bar, or run **Super CLI: Launch Coding Agent** from the Command Palette.
4. Star agents and use `Ctrl+Alt+A` (`Cmd+Alt+A` on macOS) for fast access.

Commands run in a native integrated terminal rooted at the workspace folder; Super CLI never proxies the CLI or replaces its authentication.

## Features

- **One launcher for every agent.** The activity bar lists configured agents grouped as Running, Favorites, Ready, and Setup required, in alphabetical order. The editor toolbar button and **Super CLI: Launch Coding Agent** open a quick pick of the same list.
- **Favorites, one keystroke.** Star agents from the sidebar or the launcher, then press `Ctrl+Alt+A` (`Cmd+Alt+A` on macOS; remappable). One favorite launches directly, several open a scoped quick pick, and none opens the full picker.
- **Running sessions, live.** A Running group appears as soon as an agent launches, with duration, reveal, restart, stop, and Stop All actions. Status follows terminal lifecycle events and never reads terminal content.
- **Survives a window reload.** VS Code reconnects the terminals and Super CLI adopts them back, marking recovered sessions as reconnected rather than inventing a duration.
- **Agent Manager and Agent Doctor.** Choose visible built-ins and run a bounded local version check. Agent Doctor performs no network checks and its report excludes environment variables, PATH contents, launch commands, and raw output.
- **Updates from the sidebar.** Updatable agents show an update button. **Super CLI: Update All Agents** runs every update in sequence in a single cancellable terminal, skipping agents missing from PATH.
- **Built-in presets.** Claude Code, Codex CLI, GitHub Copilot CLI, Grok CLI, Kilo CLI, Kiro CLI, OpenClaw CLI, Antigravity CLI, OpenCode, Command Code, Cursor CLI, Droid CLI, Crush, Devin CLI, Hermes, MiMo Code, Pi, Kimi Code CLI, Qoder CLI, Qwen Code CLI, Amp, OpenClaude, Oh My Pi, goose, Auggie CLI, Cline CLI, Codebuff, Continue CLI, Mistral Vibe, Rovo Dev CLI, CodeArts Agent CLI, and CodeBuddy Code CLI are available out of the box. Any other CLI can be added in `settings.json`.
- **No hidden behavior.** Each agent runs in a real VS Code terminal with your shell, PATH, and environment: no bundled emulator, telemetry, runtime dependency, automatic installer, or shell-profile modification.

![Super CLI AI coding agent launcher sidebar in VS Code with Claude Code, Codex CLI, Copilot CLI, Google Antigravity, OpenCode, Kiro and OpenClaw](media/screenshots/sidebar.png)

## Requirements

- VS Code `1.93` or newer, or a compatible desktop editor that can install VS Code extensions.
- At least one supported coding-agent CLI installed and authenticated according to that vendor's documentation. Super CLI never installs or configures the CLI for you.
- A trusted workspace before launch, update, or version commands can run.

Node.js and npm are needed only to develop or package Super CLI.

## Configuration

| Setting | Purpose | Default |
| --- | --- | --- |
| `superCli.agents` | Agents added to or overriding the built-ins. | `[]` |
| `superCli.useBuiltins` | Include the built-in agent presets. | `true` |
| `superCli.hiddenBuiltins` | Built-in ids hidden by **Manage Built-in Agents**. | `[]` |
| `superCli.favoriteAgents` | Ids launched by `Ctrl+Alt+A`; set them with the star button. | `[]` |
| `superCli.terminalLocation` | Open the terminal `beside` the editor or in the `panel`. | `beside` |
| `superCli.useWsl` | On Windows, launch agents in WSL with their Linux command variants. | `false` |

Run **Super CLI: Open Settings** from the Command Palette. Only the global value of `superCli.agents` is used; workspace overrides are ignored so an untrusted repository cannot inject commands. See [`docs/USAGE.md`](docs/USAGE.md) for the custom-agent schema and command reference.

## Privacy and security

Super CLI does not collect telemetry, analytics, or personal data. Running sessions are tracked only through VS Code terminal lifecycle events. Exception: on a direct launch with shell integration, the first 16 KB of output is retained in memory to detect a missing CLI, never persisted or transmitted.

`superCli.agents` is machine-scoped and the launcher refuses to run in untrusted workspaces. The extension never installs CLIs or changes shell profiles; missing CLIs link their official documentation. The only local state is configuration plus a launch counter for the one-time rating nudge.

Keep credentials in each CLI's credential store or environment, never embedded in commands. See [`SECURITY.md`](SECURITY.md) for vulnerability reporting.

## Troubleshooting

- **"… was not found."** Fix the command in settings.
- **Nothing happens on launch.** Trust the workspace first; the launcher runs terminal commands and stays disabled otherwise.
- **"Setup required" looks wrong.** The indicator is a best-effort PATH check. Use **Refresh Agents** after installing a CLI; WSL agents stay neutral because the Windows PATH does not reflect WSL installs.
- **The wrong OS command runs.** Platform-specific custom commands must define all three keys: `windows`, `macos`, and `linux`.
- **A running agent did not come back after a reload.** Recovery matches surviving terminals by name and needs VS Code persistent terminal sessions enabled.

See [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) for the remaining failure modes.

## Development

Requirements: Node.js 22 (see `.nvmrc`), npm, and VS Code 1.93 or newer.

```bash
git clone https://github.com/TheStreamCode/super-cli.git
cd super-cli
npm ci
npm run check
npm run audit
```

`npm run check` compiles strict TypeScript, runs unit and Extension Development Host smoke tests, and performs the `vsce ls` packaging dry run. There is no separate linter: `tsc --strict` with `noUnusedLocals` and `noUnusedParameters` is the static gate. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for conventions.

For a release candidate, run `npm run audit`, `npm run check`, then `npm run package` for a verified `.vsix`. Pushing the matching `v<version>` tag triggers the release workflow. Marketplace and Open VSX publication are separate owner steps; credentials must never be committed. Full checklist: [`CONTRIBUTING.md`](CONTRIBUTING.md#release-checklist-maintainers).

## Support

Bug reports and feature requests belong on [GitHub](https://github.com/TheStreamCode/super-cli); usage questions fit [Discussions](https://github.com/TheStreamCode/super-cli/discussions). See [`SUPPORT.md`](SUPPORT.md) and the [FAQ](docs/USAGE.md). Report vulnerabilities privately per [`SECURITY.md`](SECURITY.md), never in a public issue. If Super CLI is useful, consider [sponsoring](https://github.com/sponsors/TheStreamCode).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md); pull requests must pass CI.

## License

MIT License — see [`LICENSE`](LICENSE).

---

Maintained by [Michael Gasperini (Mikesoft)](https://mikesoft.it).
If this project is useful to you, consider [sponsoring its maintenance](https://github.com/sponsors/TheStreamCode).
