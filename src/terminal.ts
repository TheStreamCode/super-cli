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
  context: vscode.ExtensionContext,
  onShellExecutionEnd?: (event: vscode.TerminalShellExecutionEndEvent, output: string) => void | Promise<void>,
  // Called instead of onShellExecutionEnd when shell integration never attached in time: sendText has
  // no completion signal at all, so callers that need to resolve (e.g. a bulk operation awaiting each
  // step) can treat "we sent it" as done rather than waiting forever for an end event that never comes.
  onFallback?: () => void,
): void {
  let executionStarted = false;

  const startExecution = (shellIntegration: vscode.TerminalShellIntegration) => {
    if (executionStarted) {
      return;
    }

    executionStarted = true;
    shellIntegrationListener.dispose();
    clearTimeout(fallbackHandle);

    let execution: vscode.TerminalShellExecution | undefined;
    let outputPromise: Promise<string> | undefined;

    const executionListener = onShellExecutionEnd
      ? vscode.window.onDidEndTerminalShellExecution(async (endEvent) => {
        if (endEvent.terminal !== terminal || (execution && endEvent.execution !== execution)) {
          return;
        }

        executionListener?.dispose();
        const output = outputPromise ? await outputPromise : '';
        await onShellExecutionEnd(endEvent, output);
      })
      : undefined;

    execution = shellIntegration.executeCommand(command);
    outputPromise = collectShellExecutionOutput(execution);
  };

  const shellIntegrationListener = vscode.window.onDidChangeTerminalShellIntegration((event) => {
    if (event.terminal !== terminal) {
      return;
    }

    startExecution(event.shellIntegration);
  });

  const fallbackHandle = setTimeout(() => {
    if (terminal.shellIntegration) {
      startExecution(terminal.shellIntegration);
      return;
    }

    executionStarted = true;
    shellIntegrationListener.dispose();
    terminal.sendText(command, true);
    onFallback?.();
  }, 3000);

  if (terminal.shellIntegration) {
    startExecution(terminal.shellIntegration);
    return;
  }

  context.subscriptions.push(
    shellIntegrationListener,
    { dispose: () => clearTimeout(fallbackHandle) },
  );
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
  context: vscode.ExtensionContext,
  runCommand: string,
  sessions: AgentSessionRegistry,
  sessionId: string,
): void {
  executeCommandWithOptionalShellIntegration(
    terminal,
    runCommand,
    context,
    async (endEvent, output) => {
      sessions.end(sessionId);
      if (shouldPromptToInstall(agent.command, endEvent.exitCode, output)) {
        await handleMissingAgent(agent);
      }
    },
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
  watchAgentLifecycle(terminal, agent, context, command, sessions, session.sessionId);
  void vscode.window.setStatusBarMessage(`Started ${agent.label}`, 2500);
  return true;
}

/**
 * Runs the agent's official update command in a dedicated terminal (without launching the agent).
 * Resolves true/false on the update's real exit code once shell integration reports it; if shell
 * integration never attaches, resolves true as soon as the command is sent, since sendText has no
 * completion signal to wait for (see executeCommandWithOptionalShellIntegration's onFallback).
 */
export async function updateAgent(agent: Agent, context: vscode.ExtensionContext): Promise<boolean> {
  if (!vscode.workspace.isTrusted) {
    const selection = await vscode.window.showWarningMessage(
      `Super CLI runs terminal commands in the current workspace. Trust this workspace before updating ${agent.label}.`,
      'Manage Workspace Trust',
    );

    if (selection === 'Manage Workspace Trust') {
      await vscode.commands.executeCommand('workbench.trust.manage');
    }

    return false;
  }

  const { useWsl } = resolveTerminalEnvironment();
  const updateCommand = agent.updateCommand;

  if (!updateCommand) {
    void vscode.window.showInformationMessage(`${agent.label} has no configured update command — it likely updates itself.`);
    return false;
  }

  // No workspace-folder picker here (unlike launchAgent): an update command is typically a global
  // package-manager invocation that doesn't depend on which folder it runs in, so prompting once per
  // agent in superCli.updateAllAgents would be pure friction for no benefit.
  const cwd = resolveTerminalCwd(vscode.window.activeTextEditor, vscode.workspace);
  const terminal = vscode.window.createTerminal({
    name: `Update ${agent.label}`,
    location: vscode.TerminalLocation.Panel,
    cwd,
    env: agent.env,
    iconPath: resolveAgentIcon(agent, context.extensionUri),
    shellPath: useWsl ? 'wsl.exe' : undefined,
  });
  terminal.show();
  void vscode.window.setStatusBarMessage(`Updating ${agent.label}`, 2500);

  return new Promise<boolean>((resolve) => {
    executeCommandWithOptionalShellIntegration(
      terminal,
      updateCommand,
      context,
      (endEvent) => {
        // Resolved as soon as the exit code is known, independent of the notification below: a caller
        // awaiting every agent in a bulk update must not block on the user dismissing a toast.
        const succeeded = endEvent.exitCode === 0;
        resolve(succeeded);

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
      () => resolve(true),
    );
  });
}
