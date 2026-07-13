import * as vscode from 'vscode';
import { getMissingAgentGuidance, type Agent } from './agents.js';
import {
  buildExtensionSettingsQuery,
  buildTerminalName,
  resolveTerminalCwd,
  shouldPromptToInstall,
} from './command-utils.js';

const SETTINGS_NAMESPACE = 'superCli';

function collectShellExecutionOutput(execution: vscode.TerminalShellExecution): Promise<string> {
  return (async () => {
    let output = '';

    try {
      for await (const chunk of execution.read()) {
        output += chunk;
      }
    } catch {
      return output;
    }

    return output;
  })();
}

/** Runs a command in the terminal, reading output via shell integration with a sendText fallback. */
function executeCommandWithOptionalShellIntegration(
  terminal: vscode.Terminal,
  command: string,
  context: vscode.ExtensionContext,
  onShellExecutionEnd?: (event: vscode.TerminalShellExecutionEndEvent, output: string) => void | Promise<void>,
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

async function handleMissingAgent(agent: Agent): Promise<void> {
  const guidance = getMissingAgentGuidance(agent);
  const selection = guidance.documentationUrl
    ? await vscode.window.showWarningMessage(guidance.message, 'Open Official Installation Documentation')
    : await vscode.window.showWarningMessage(guidance.message);

  if (selection === 'Open Official Installation Documentation' && guidance.documentationUrl) {
    await vscode.env.openExternal(vscode.Uri.parse(guidance.documentationUrl));
  }
}

function watchForMissingAgent(
  terminal: vscode.Terminal,
  agent: Agent,
  context: vscode.ExtensionContext,
  runCommand: string,
): void {
  executeCommandWithOptionalShellIntegration(
    terminal,
    runCommand,
    context,
    async (endEvent, output) => {
      if (shouldPromptToInstall(agent.command, endEvent.exitCode, output)) {
        await handleMissingAgent(agent);
      }
    },
  );
}

/** Opens a side terminal and launches the given agent, watching for a missing CLI. */
export async function launchAgent(agent: Agent, context: vscode.ExtensionContext, sequence: number): Promise<void> {
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

    return;
  }

  const command = agent.command.trim();
  if (!command) {
    void vscode.window.showErrorMessage(`Agent "${agent.label}" has no command configured.`);
    return;
  }

  const location = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string>('terminalLocation', 'beside');
  const { useWsl } = resolveTerminalEnvironment();
  const cwd = resolveTerminalCwd(vscode.window.activeTextEditor, vscode.workspace);

  const terminal = vscode.window.createTerminal({
    name: buildTerminalName(agent.label, sequence, agent.label),
    location: location === 'panel' ? vscode.TerminalLocation.Panel : { viewColumn: vscode.ViewColumn.Beside },
    cwd,
    env: agent.env,
    shellPath: useWsl ? 'wsl.exe' : undefined,
  });
  terminal.show();
  watchForMissingAgent(terminal, agent, context, command);
  void vscode.window.setStatusBarMessage(`Started ${agent.label}`, 2500);
}

/** Runs the agent's official update command in a dedicated terminal (without launching the agent). */
export async function updateAgent(agent: Agent, context: vscode.ExtensionContext): Promise<void> {
  if (!vscode.workspace.isTrusted) {
    const selection = await vscode.window.showWarningMessage(
      `Super CLI runs terminal commands in the current workspace. Trust this workspace before updating ${agent.label}.`,
      'Manage Workspace Trust',
    );

    if (selection === 'Manage Workspace Trust') {
      await vscode.commands.executeCommand('workbench.trust.manage');
    }

    return;
  }

  const { useWsl } = resolveTerminalEnvironment();
  const updateCommand = agent.updateCommand;

  if (!updateCommand) {
    void vscode.window.showInformationMessage(`${agent.label} has no configured update command — it likely updates itself.`);
    return;
  }

  const cwd = resolveTerminalCwd(vscode.window.activeTextEditor, vscode.workspace);
  const terminal = vscode.window.createTerminal({
    name: `Update ${agent.label}`,
    location: vscode.TerminalLocation.Panel,
    cwd,
    env: agent.env,
    shellPath: useWsl ? 'wsl.exe' : undefined,
  });
  terminal.show();
  terminal.sendText(updateCommand, true);
  void vscode.window.setStatusBarMessage(`Updating ${agent.label}`, 2500);
}
