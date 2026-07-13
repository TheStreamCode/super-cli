# Super CLI

[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=mikesoft.vscode-super-cli)
· [Open VSX](https://open-vsx.org/extension/mikesoft/vscode-super-cli)
· [CI](https://github.com/TheStreamCode/super-cli/actions/workflows/ci.yml)
· [Sponsor](https://github.com/sponsors/TheStreamCode)

One VS Code extension to launch any coding agent CLI — **Claude Code, Codex, GitHub Copilot CLI,
Cursor, Droid, Grok, Kilo, Antigravity, OpenCode, Command Code, Crush, Hermes, MiMo Code, Pi, and
your own** — from a single sidebar and a side terminal.

Works on Windows, macOS, and Linux, and across the VS Code family (VS Code, Cursor, Antigravity,
Windsurf).

This extension is unofficial and is not affiliated with, endorsed by, or sponsored by Anthropic,
OpenAI, GitHub, Google, or any other vendor. See the [third-party
notices](TRADEMARKS.md).

![Super CLI — the Coding Agents sidebar listing the built-in presets](media/screenshots/sidebar.png)

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
- **Favorite agent, one keystroke.** Click the star (★) next to an agent to mark it as your favorite,
  then launch it anywhere with **`Ctrl+Alt+A`** (`Cmd+Alt+A` on macOS; remap it in Keyboard
  Shortcuts). With no favorite set the shortcut opens the picker and offers to remember your choice.
- **Install status at a glance.** Agents whose CLI isn't on your `PATH` are shown dimmed and marked
  *not installed*, so you know what to install before launching.
- **Built-in presets.** Claude Code, Codex, GitHub Copilot CLI, Cursor, Droid, Grok, Kilo, Antigravity,
  OpenCode, Command Code, Crush, Hermes, MiMo Code, and Pi are available out of the box. (Gemini CLI
  was retired by Google and replaced by Antigravity.)
- **Add your own, no code required.** Define new agents in `settings.json`. The sidebar updates
  automatically.
- **Update from the sidebar.** Agents with a known update command show an update button next to
  Launch, which runs the CLI's official update (e.g. `codex update`, `kilo upgrade`, `cursor-agent
  update`, `opencode upgrade`, `droid update`). CLIs that update themselves don't show one.
- **Official installation docs.** If a supported CLI isn't found, Super CLI opens that agent's verified
  official installation documentation in your browser. It never installs a CLI, runs an installer, or
  changes your shell profile.
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
    "icon": "rocket"
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
- `installationDocumentationUrl` — optional verified official installation documentation URL. When
  the command is missing, Super CLI offers to open this URL in your external browser; it does not run
  any installation command.
- `env` — optional environment variables set for the agent's terminal, e.g. to opt out of a CLI's
  IDE-extension auto-install via its own variable: `{ "CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL": "1" }`.
- `updateCommand` — optional command to update the CLI. Adds an update button next to the agent in the
  sidebar.

Only the user (global) value of `superCli.agents` is used; workspace overrides are ignored so that
an untrusted repository cannot inject commands.

## Configuration

| Setting | Default | Description |
| --- | --- | --- |
| `superCli.agents` | `[]` | Your agents (added to or overriding the built-ins). |
| `superCli.useBuiltins` | `true` | Include the built-in agent presets. |
| `superCli.favoriteAgent` | `""` | Id of the agent launched by `Ctrl+Alt+A`. Set it with the ★ button in the sidebar rather than by hand. |
| `superCli.terminalLocation` | `beside` | Open the terminal `beside` the editor or in the `panel`. |
| `superCli.useWsl` | `false` | On Windows, open agents in a WSL terminal instead of the default shell. Ignored on macOS/Linux. |

Run **Super CLI: Open Settings** from the sidebar or the command palette to jump straight to these
settings.

![Super CLI settings: agents, terminal location, and built-in presets](media/screenshots/settings.png)

## Troubleshooting

- **"… was not found."** The configured `command` was not found. Open the official documentation
  offered by Super CLI, or fix the command in settings. The launcher uses the active editor's
  workspace folder as the working directory.
- **Nothing happens on launch.** Make sure the workspace is trusted — the launcher is disabled in
  untrusted workspaces because it runs terminal commands.
- **"Not installed" looks wrong.** The indicator is a best-effort check of your `PATH` and doesn't
  spawn the CLI. It isn't shown when `superCli.useWsl` is on, because the Windows `PATH` doesn't
  reflect what's installed inside WSL. Use **Refresh Agents** after installing a CLI.
- **Companion editor extensions.** Super CLI does not modify agent configuration files or shell
  profiles. It launches **Claude Code** with the official `CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL=1`
  environment variable so its companion extension is not installed automatically.

## FAQ

**How do I run Claude Code (or Codex, Copilot, Cursor, …) in VS Code?**
Install Super CLI, open the **Super CLI** view in the activity bar, and click the agent — it opens in
a terminal beside your editor. The toolbar button and the **Super CLI: Launch Coding Agent** command
do the same. It also works in Cursor, Antigravity, and Windsurf.

**Which AI coding agents are supported?**
Claude Code, Codex, GitHub Copilot CLI, Grok, Kilo, Antigravity, OpenCode, Command Code, Cursor,
Droid, Crush, Hermes, MiMo Code, and Pi out of the box — plus any CLI you add in `settings.json`.

**Does it work on Windows, macOS, and Linux?**
Yes. On Windows you can also launch agents inside WSL with `superCli.useWsl`.

**Is it free? Does it collect data?**
Free and open-source (MIT), with no telemetry. It only runs the commands you configure, in your own
integrated terminal.

## Support

If Super CLI is useful to you, consider [sponsoring its development](https://github.com/sponsors/TheStreamCode).
Bug reports, feature requests, and contributions are welcome on
[GitHub](https://github.com/TheStreamCode/super-cli).

## Privacy

This extension does not collect telemetry, analytics, or personal data. It never installs CLIs or
modifies shell profiles; it only runs launch and user-requested update commands in your integrated
terminal.

## Building

```bash
npm install
npm run check     # compile + unit tests + VS Code integration smoke test
npm run package   # produce the .vsix
```
