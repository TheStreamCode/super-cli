# Usage

This guide covers the Super CLI interface, custom agents, and frequently asked questions. The root
[README](../README.md) covers installation, the configuration summary, and first-run steps.

## Interface

### Agent sidebar and editor launcher

The activity bar opens a status-aware list with vendor-specific agent icons. A live **Running** group
leads the list the moment you launch an agent, followed by your own **Favorites** group, then **Ready**
agents; CLIs not found on the active `PATH` are grouped under **Setup required**. Agents are sorted
alphabetically within each group. The colored Router S in the editor toolbar opens the same launcher
without leaving the current file.

### Focused configuration

All settings are available in one filtered view. Commands can be shared across platforms or defined
explicitly for Windows, macOS, and Linux; WSL deliberately selects the Linux command. Open the
maintained settings surface with **Super CLI: Open Settings** rather than editing deprecated keys by
hand.

## Adding or overriding an agent

Add agents through the `superCli.agents` setting. Each entry creates a new agent, or, when it reuses a
built-in `id`, overrides that built-in (for example to point at a custom binary path).

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
  },
  {
    "id": "adaptive-agent",
    "label": "Adaptive Agent",
    "command": {
      "windows": "adaptive-agent.exe",
      "macos": "adaptive-agent-macos",
      "linux": "adaptive-agent-linux"
    }
  }
]
```

- `id`: unique identifier; reuse a built-in id to override it.
- `label`: name shown in the sidebar and quick pick.
- `command`: the command that starts the CLI. Use one string when it is cross-platform, or an object
  with `windows`, `macos`, and `linux` strings for OS-specific commands. On Windows, quote executable
  paths that contain spaces.
- `icon`: optional [ThemeIcon](https://code.visualstudio.com/api/references/icons-in-labels) id, for
  example `sparkle` or `rocket`.
- `installationDocumentationUrl`: optional verified official HTTPS installation documentation URL.
  Credential-bearing URLs and non-HTTPS schemes are ignored. When the command is missing, Super CLI
  offers to open the URL in your external browser; it does not run any installation command.
- `env`: optional environment variables set for the agent's terminal, for example to opt out of a
  CLI's IDE-extension auto-install: `{ "CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL": "1" }`.
- `updateCommand`: optional command to update the CLI. It accepts the same cross-platform string or
  `windows`/`macos`/`linux` object as `command`, and adds an update button next to the agent.
- `versionCommand`: optional command used only when you explicitly run Agent Doctor. It accepts the
  same cross-platform forms and should print a short version string without requiring authentication.

Every built-in preset defines its launch and update commands through the same platform-aware model.
When `superCli.useWsl` is enabled on Windows, Super CLI selects the `linux` command variant because the
command runs inside WSL.

Only the user (global) value of `superCli.agents` is used; workspace overrides are ignored so that an
untrusted repository cannot inject commands.

## Environment variables and secrets

Super CLI itself requires no environment variables and does not load `.env` files. The optional `env`
object on a custom agent applies only to that agent's terminal; executable detection uses the same
overrides so a custom `PATH` is reflected in the sidebar status.

Keep credentials in the CLI vendor's supported credential store or in your normal shell environment.
Do not commit secrets in settings, command strings, or environment files. `.env` variants are ignored
by Git and explicitly excluded from VSIX packages as a defensive safeguard.

## FAQ

### How do I launch Claude Code in VS Code?

Install Super CLI, open the **Super CLI** view in the activity bar, and select **Claude Code**. The
official `claude` CLI opens in a native integrated terminal beside your editor. You can also set it as
your favorite and launch it with `Ctrl+Alt+A` (`Cmd+Alt+A` on macOS).

### How do I run Codex CLI or GitHub Copilot CLI in VS Code?

Select **Codex CLI** or **GitHub Copilot CLI** from the Super CLI sidebar, or run **Super CLI: Launch
Coding Agent** from the Command Palette. Super CLI starts the official `codex` or `copilot` command in
the current workspace.

### Can I use Google Antigravity, Kiro CLI, and OpenClaw CLI in VS Code?

Yes. Google Antigravity, Kiro CLI, and OpenClaw CLI are built-in presets. Super CLI detects their
commands, links to official setup documentation when available, and launches them with the correct
Windows, macOS, Linux, or WSL command variant.

### Which AI coding agents are supported?

Claude Code, Codex CLI, GitHub Copilot CLI, Grok CLI, Kilo CLI, Kiro CLI, OpenClaw CLI, Antigravity
CLI, OpenCode, Command Code, Cursor CLI, Droid CLI, Crush, Devin CLI, Hermes, MiMo Code, Pi, Kimi Code
CLI, Qoder CLI, Qwen Code CLI, Amp, OpenClaude, Oh My Pi, goose, Auggie CLI, Cline CLI, Codebuff,
Continue CLI, Mistral Vibe, Rovo Dev CLI, CodeArts Agent CLI, and CodeBuddy Code CLI out of the box,
plus any CLI you add in `settings.json`.

### Does Super CLI work on Windows, macOS, Linux, and WSL?

Yes. On Windows you can also launch agents inside WSL with `superCli.useWsl`.

### Is Super CLI free, and does it collect data?

Free and open source (MIT), with no telemetry. It only runs the commands you configure, in your own
integrated terminal.
