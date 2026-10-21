# Troubleshooting

This guide covers the failure modes documented for Super CLI. The root [README](../README.md) covers
installation, requirements, and the configuration summary.

## Command not found

**"… was not found."** The configured `command` was not found. Open the official documentation offered
by Super CLI, or fix the command in settings. The launcher uses the active editor's workspace folder as
the working directory.

## Nothing happens on launch

Make sure the workspace is trusted: the launcher is disabled in untrusted workspaces because it runs
terminal commands.

## Setup indicator looks wrong

**"Setup required" looks wrong.** The indicator is a best-effort check of your `PATH` and does not
spawn the CLI. WSL agents stay in the neutral **Agents** group because the Windows `PATH` does not
reflect what is installed inside WSL. Use **Refresh Agents** after installing a CLI.

## The wrong OS command runs

Platform-specific custom commands must define all three keys: `windows`, `macos`, and `linux`. Super
CLI selects the host OS automatically; WSL deliberately uses the `linux` variant because the command
runs inside the WSL terminal.

## A version is unavailable

Run **Super CLI: Run Agent Doctor**. A custom agent needs a verified `versionCommand`; untrusted
workspaces skip version commands, and each check is limited to five seconds and 4 KB of output.

## Companion editor extensions

Super CLI does not modify agent configuration files or shell profiles. It launches **Claude Code** with
the official `CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL=1` environment variable so its companion extension is
not installed automatically.

## No Running section

It only appears once at least one agent has an active terminal session. Launch an agent from the
sidebar and it appears at the top instantly. It disappears once that terminal closes, or sooner when
the CLI itself exits; the latter needs terminal shell integration, so without it (or on a shell that
does not support it) the row stays until you close the terminal.

## Super CLI asks which folder to launch in

This only happens when Super CLI genuinely cannot tell on its own: no active editor, and more than one
folder open in a multi-root workspace. Press Escape to fall back to the first folder instead. Restarting
a running session never asks; it reuses that session's original folder directly.

## Update All Agents seems stuck

An update command that waits for input (a confirmation prompt, a credential) cannot complete on its
own. Cancel the progress notification, or close the **Super CLI: updates** terminal; either one ends
the run and reports how far it got. Cancelling stops Super CLI from starting further updates, but a
command already running in the terminal keeps going, so check that terminal before closing it.

## The extension update has no effect

Reload the window (**Developer: Reload Window** from the Command Palette) or restart your editor.
Extension code loaded into a running window is not replaced until the window reloads, even after a
newer version finishes installing.

## A running agent did not come back after a reload

Recovery matches a surviving terminal to an agent by the terminal's name, so a renamed terminal cannot
be matched. It also relies on VS Code's own terminal persistence: if
`terminal.integrated.enablePersistentSessions` is off, the terminals themselves do not survive a
reload and there is nothing left to recover.

## Sessions in another window are not listed

Each window sees only its own terminals. VS Code gives an extension no access to another window's
terminals, so a shared view across windows (or across two different editors) is not something Super CLI
can provide today.
