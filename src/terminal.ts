import * as vscode from 'vscode';
import { getMissingAgentGuidance, type Agent } from './agents.js';
import { resolveAgentIcon } from './icons.js';
import type { AgentSessionRegistry } from './sessions.js';
import {
  appendBoundedText,
  buildExtensionSettingsQuery,
  buildTerminalName,
  isTerminalCwdAmbiguous,
  resolveTerminalCwd,
  shouldPromptToInstall,
} from './command-utils.js';

const SETTINGS_NAMESPACE = 'superCli';
const MAX_CAPTURED_SHELL_OUTPUT = 16 * 1024;
const SHELL_INTEGRATION_TIMEOUT_MS = 3000;

/**
 * Teardown callbacks for terminal commands that are still in flight. Every invocation of
 * `executeCommandWithOptionalShellIntegration` adds exactly one entry and removes it again the moment
 * that command settles or its terminal closes, so this set stays proportional to what is running now.
 *
 * This is why per-invocation disposables are deliberately kept out of `context.subscriptions`: VS Code
 * empties that array only at deactivate, and disposing an entry does not remove it from the array. A
 * push per launch or per update would therefore grow it for the entire session. `activate` registers
 * `createPendingCommandsDisposable()` once instead, and `metadata.test.js` pins that there is exactly
 * one `context.subscriptions.push(` in the whole of `src/`.
 */
const pendingCommandTeardowns = new Set<() => void>();

/**
 * Releases every listener and timer still owned by an in-flight terminal command. Registered once by
 * `activate`, so that a command left pending at deactivate cannot outlive the extension.
 */
export function createPendingCommandsDisposable(): vscode.Disposable {
  return {
    dispose: () => {
      for (const teardown of [...pendingCommandTeardowns]) {
        teardown();
      }
    },
  };
}

/** Test hook: how many terminal commands are still in flight. See AGENTS.md. */
export function countPendingTerminalCommands(): number {
  return pendingCommandTeardowns.size;
}

function collectShellExecutionOutput(execution: vscode.TerminalShellExecution): Promise<string> {
  return (async () => {
    let output = '';

    try {
      for await (const chunk of execution.read()) {
        output = appendBoundedText(output, chunk, MAX_CAPTURED_SHELL_OUTPUT);
      }
    } catch {
      return output;
    }

    return output;
  })();
}

/** Runs a command in the terminal, reading output via shell integration with a sendText fallback. */
export function executeCommandWithOptionalShellIntegration(
  terminal: vscode.Terminal,
  command: string,
  onShellExecutionEnd?: (event: vscode.TerminalShellExecutionEndEvent, output: string) => void | Promise<void>,
  // Called instead of onShellExecutionEnd when shell integration never attached in time: sendText has
  // no completion signal at all, so callers that need to resolve (e.g. a bulk operation awaiting each
  // step) can treat "we sent it" as done rather than waiting forever for an end event that never comes.
  onFallback?: () => void,
  // Terminal output is streamed and retained only where a caller genuinely needs it — the launch path,
  // so a missing CLI can be spotted. Every other caller leaves it off, so no command's output is
  // buffered just in case. See "Terminal content reading is the exception" in AGENTS.md.
  captureOutput = false,
): void {
  let executionStarted = false;
  let executionListener: vscode.Disposable | undefined;

  // Everything this one invocation owns, released together: on the shell-execution end event, on the
  // fallback, when the terminal closes, or at deactivate.
  const release = (): void => {
    pendingCommandTeardowns.delete(release);
    shellIntegrationListener.dispose();
    closeListener.dispose();
    executionListener?.dispose();
    clearTimeout(fallbackHandle);
  };

  const startExecution = (shellIntegration: vscode.TerminalShellIntegration) => {
    if (executionStarted) {
      return;
    }

    executionStarted = true;
    shellIntegrationListener.dispose();
    clearTimeout(fallbackHandle);

    if (!onShellExecutionEnd) {
      shellIntegration.executeCommand(command);
      release();
      return;
    }

    let execution: vscode.TerminalShellExecution | undefined;
    let outputPromise: Promise<string> | undefined;

    executionListener = vscode.window.onDidEndTerminalShellExecution(async (endEvent) => {
      if (endEvent.terminal !== terminal || (execution && endEvent.execution !== execution)) {
        return;
      }

      release();
      const output = outputPromise ? await outputPromise : '';
      await onShellExecutionEnd(endEvent, output);
    });

    execution = shellIntegration.executeCommand(command);
    if (captureOutput) {
      outputPromise = collectShellExecutionOutput(execution);
    }
  };

  const shellIntegrationListener = vscode.window.onDidChangeTerminalShellIntegration((event) => {
    if (event.terminal !== terminal) {
      return;
    }

    startExecution(event.shellIntegration);
  });

  // A terminal that closes inside the fallback window has to cancel the pending sendText. VS Code
  // throws "Terminal has already been disposed" when sendText targets a terminal the extension itself
  // disposed — which superCli.stopSession, superCli.stopAllSessions and superCli.restartSession all
  // do — so stopping or restarting an agent within the timeout used to raise that from the timer,
  // with the command going nowhere either way.
  const closeListener = vscode.window.onDidCloseTerminal((closed) => {
    if (closed === terminal) {
      release();
    }
  });

  const fallbackHandle = setTimeout(() => {
    if (terminal.shellIntegration) {
      startExecution(terminal.shellIntegration);
      return;
    }

    executionStarted = true;
    release();
    terminal.sendText(command, true);
    onFallback?.();
  }, SHELL_INTEGRATION_TIMEOUT_MS);

  pendingCommandTeardowns.add(release);

  if (terminal.shellIntegration) {
    startExecution(terminal.shellIntegration);
  }
}

/** Opens the Settings UI filtered to this extension. */
export async function openExtensionSettings(context: vscode.ExtensionContext): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', buildExtensionSettingsQuery(context.extension.id));
}

/** Resolves whether launches should use VS Code's WSL terminal. */
function resolveTerminalEnvironment(): { useWsl: boolean } {
  const useWsl = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<boolean>('useWsl', false)
    && process.platform === 'win32';
  return { useWsl };
}

// Only prompts when resolveTerminalCwd would otherwise guess arbitrarily (a multi-root workspace
// with no active-editor-derived folder). Canceling the picker falls back to that same guess rather
// than aborting the launch, so declining the extra choice never blocks the command.
async function resolveLaunchCwd(): Promise<vscode.Uri | undefined> {
  const activeEditor = vscode.window.activeTextEditor;

  if (isTerminalCwdAmbiguous(activeEditor, vscode.workspace)) {
    const picked = await vscode.window.showWorkspaceFolderPick({
      placeHolder: 'Select a workspace folder to launch in',
    });
    if (picked) {
      return picked.uri;
    }
  }

  return resolveTerminalCwd(activeEditor, vscode.workspace);
}

async function handleMissingAgent(agent: Agent): Promise<void> {
  const guidance = getMissingAgentGuidance(agent);
  const selection = guidance.documentationUrl
    ? await vscode.window.showWarningMessage(guidance.message, 'Open Official Installation Documentation')
    : await vscode.window.showWarningMessage(guidance.message);

  if (selection === 'Open Official Installation Documentation' && guidance.documentationUrl) {
    await vscode.env.openExternal(vscode.Uri.parse(guidance.documentationUrl));
  }
}

// Watches the agent command started in `terminal`: ends its tracked session once that command exits
// (the terminal itself may stay open at a bare shell prompt), and separately flags a likely-missing
// CLI. Both share one shell-integration listener since the agent command is the first and only thing
// this terminal runs.
function watchAgentLifecycle(
  terminal: vscode.Terminal,
  agent: Agent,
  runCommand: string,
  sessions: AgentSessionRegistry,
  sessionId: string,
): void {
  executeCommandWithOptionalShellIntegration(
    terminal,
    runCommand,
    async (endEvent, output) => {
      sessions.end(sessionId);
      if (shouldPromptToInstall(agent.command, endEvent.exitCode, output)) {
        await handleMissingAgent(agent);
      }
    },
    undefined,
    // The one place that reads terminal output: the bounded missing-command detector above.
    true,
  );
}

/** Opens a side terminal and launches the given agent, tracking it as a running session. */
export async function launchAgent(
  agent: Agent,
  context: vscode.ExtensionContext,
  sequence: number,
  sessions: AgentSessionRegistry,
  // When set (e.g. a restart reusing a session's original cwd), resolution — and its workspace-folder
  // picker for ambiguous multi-root cases — is skipped entirely in favor of this exact cwd.
  cwdOverride?: vscode.Uri,
): Promise<boolean> {
  if (!vscode.workspace.isTrusted) {
    const selection = await vscode.window.showWarningMessage(
      `Super CLI runs terminal commands in the current workspace. Trust this workspace before launching ${agent.label}.`,
      'Manage Workspace Trust',
      'Open Settings',
    );

    if (selection === 'Manage Workspace Trust') {
      await vscode.commands.executeCommand('workbench.trust.manage');
    } else if (selection === 'Open Settings') {
      await openExtensionSettings(context);
    }

    return false;
  }

  const command = agent.command.trim();
  if (!command) {
    void vscode.window.showErrorMessage(`Agent "${agent.label}" has no command configured.`);
    return false;
  }

  const location = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string>('terminalLocation', 'beside');
  const { useWsl } = resolveTerminalEnvironment();
  const cwd = cwdOverride ?? await resolveLaunchCwd();

  const terminal = vscode.window.createTerminal({
    name: buildTerminalName(agent.label, sequence, agent.label),
    location: location === 'panel' ? vscode.TerminalLocation.Panel : { viewColumn: vscode.ViewColumn.Beside },
    cwd,
    env: agent.env,
    iconPath: resolveAgentIcon(agent, context.extensionUri),
    shellPath: useWsl ? 'wsl.exe' : undefined,
  });
  terminal.show();
  const session = sessions.start(agent, terminal, cwd);
  watchAgentLifecycle(terminal, agent, command, sessions, session.sessionId);
  void vscode.window.setStatusBarMessage(`Started ${agent.label}`, 2500);
  return true;
}

/**
 * How one agent's update finished. `terminal-closed` means the terminal went away before the command
 * reported an exit code — the update's real fate is unknown, and a bulk caller should stop rather than
 * keep sending commands to a dead terminal.
 */
export type UpdateOutcome = 'succeeded' | 'failed' | 'unsupported' | 'terminal-closed';

/** The shared terminal that superCli.updateAllAgents runs every update in, one after another. */
export function createSharedUpdateTerminal(): vscode.Terminal {
  const { useWsl } = resolveTerminalEnvironment();
  const terminal = vscode.window.createTerminal({
    name: 'Super CLI: updates',
    location: vscode.TerminalLocation.Panel,
    cwd: resolveTerminalCwd(vscode.window.activeTextEditor, vscode.workspace),
    iconPath: new vscode.ThemeIcon('arrow-circle-up'),
    shellPath: useWsl ? 'wsl.exe' : undefined,
  });
  terminal.show();
  return terminal;
}

/** Creates the single-agent update terminal used when updating one agent on its own. */
function createAgentUpdateTerminal(agent: Agent, context: vscode.ExtensionContext): vscode.Terminal {
  const { useWsl } = resolveTerminalEnvironment();
  // No workspace-folder picker here (unlike launchAgent): an update command is typically a global
  // package-manager invocation that doesn't depend on which folder it runs in, so prompting once per
  // agent in superCli.updateAllAgents would be pure friction for no benefit.
  const terminal = vscode.window.createTerminal({
    name: `Update ${agent.label}`,
    location: vscode.TerminalLocation.Panel,
    cwd: resolveTerminalCwd(vscode.window.activeTextEditor, vscode.workspace),
    env: agent.env,
    iconPath: resolveAgentIcon(agent, context.extensionUri),
    shellPath: useWsl ? 'wsl.exe' : undefined,
  });
  terminal.show();
  return terminal;
}

/**
 * Runs one agent's update command in `terminal` and resolves once its fate is known. There are three
 * ways it can settle, and every one of them must resolve, or a bulk caller awaiting this would hang
 * forever: the command reports an exit code, shell integration never attached so `sendText` was used
 * (no completion signal exists, so sending counts as done), or the terminal is closed first — which
 * also covers an update that never finishes on its own, e.g. one stuck on an interactive prompt.
 */
export function runAgentUpdate(
  agent: Agent,
  updateCommand: string,
  terminal: vscode.Terminal,
  options: { notify: boolean },
): Promise<UpdateOutcome> {
  return new Promise<UpdateOutcome>((resolve) => {
    let settled = false;
    const settle = (outcome: UpdateOutcome): void => {
      if (settled) {
        return;
      }

      settled = true;
      closeListener.dispose();
      resolve(outcome);
    };

    const closeListener = vscode.window.onDidCloseTerminal((closed) => {
      if (closed === terminal) {
        settle('terminal-closed');
      }
    });

    executeCommandWithOptionalShellIntegration(
      terminal,
      updateCommand,
      (endEvent) => {
        // Settled as soon as the exit code is known, independent of the notification below: a caller
        // awaiting every agent in a bulk update must not block on the user dismissing a toast.
        const succeeded = endEvent.exitCode === 0;
        settle(succeeded ? 'succeeded' : 'failed');

        if (!options.notify) {
          return;
        }

        const notification = succeeded
          ? vscode.window.showInformationMessage(`${agent.label} update completed.`, 'Show Terminal')
          : vscode.window.showErrorMessage(
            `${agent.label} update failed${endEvent.exitCode === undefined ? '' : ` with exit code ${endEvent.exitCode}`}.`,
            'Show Terminal',
          );
        void notification.then((selection) => {
          if (selection === 'Show Terminal') {
            terminal.show();
          }
        });
      },
      () => settle('succeeded'),
    );
  });
}

/** Runs the agent's official update command in a dedicated terminal (without launching the agent). */
export async function updateAgent(agent: Agent, context: vscode.ExtensionContext): Promise<UpdateOutcome> {
  if (!vscode.workspace.isTrusted) {
    const selection = await vscode.window.showWarningMessage(
      `Super CLI runs terminal commands in the current workspace. Trust this workspace before updating ${agent.label}.`,
      'Manage Workspace Trust',
    );

    if (selection === 'Manage Workspace Trust') {
      await vscode.commands.executeCommand('workbench.trust.manage');
    }

    return 'unsupported';
  }

  const updateCommand = agent.updateCommand;

  if (!updateCommand) {
    void vscode.window.showInformationMessage(`${agent.label} has no configured update command — it likely updates itself.`);
    return 'unsupported';
  }

  const terminal = createAgentUpdateTerminal(agent, context);
  void vscode.window.setStatusBarMessage(`Updating ${agent.label}`, 2500);
  return runAgentUpdate(agent, updateCommand, terminal, { notify: true });
}
