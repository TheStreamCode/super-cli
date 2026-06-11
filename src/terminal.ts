import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { type Agent, resolveInstallCommand } from './agents.js';
import {
  buildExtensionSettingsQuery,
  buildTerminalName,
  mergeMissingDefaults,
  resolveHomePath,
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

    if (executionListener) {
      context.subscriptions.push(executionListener);
    }

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

/** Runs the resolved install command in a dedicated terminal. The modal dialog is the confirmation. */
function startGuidedInstall(agent: Agent, installCommand: string): void {
  const installTerminal = vscode.window.createTerminal({
    name: `Install ${agent.label}`,
    location: vscode.TerminalLocation.Panel,
  });

  installTerminal.show();
  installTerminal.sendText(installCommand, true);
}

async function handleMissingAgent(agent: Agent, context: vscode.ExtensionContext): Promise<void> {
  const installCommand = resolveInstallCommand(agent.installCommand, process.platform);

  if (installCommand && agent.autoInstall) {
    const selection = await vscode.window.showWarningMessage(
      `${agent.label} was not found. Install it now?`,
      { modal: true, detail: `This will run: ${installCommand}` },
      'Install',
      'Open Settings',
    );

    if (selection === 'Install') {
      startGuidedInstall(agent, installCommand);
    } else if (selection === 'Open Settings') {
      await openExtensionSettings(context);
    }

    return;
  }

  const installHint = installCommand ? ` You can install it with: ${installCommand}` : '';
  const selection = await vscode.window.showWarningMessage(
    `${agent.label} could not be started. Check its command in settings.${installHint}`,
    'Open Settings',
  );

  if (selection === 'Open Settings') {
    await openExtensionSettings(context);
  }
}

function watchForMissingAgent(terminal: vscode.Terminal, agent: Agent, context: vscode.ExtensionContext): void {
  executeCommandWithOptionalShellIntegration(
    terminal,
    agent.command,
    context,
    async (endEvent, output) => {
      if (shouldPromptToInstall(agent.command, endEvent.exitCode, output)) {
        await handleMissingAgent(agent, context);
      }
    },
  );
}

/**
 * Ensures the agent's declared config file contains the required keys, adding only the missing ones.
 * Super CLI is one extension for every CLI, so this is how an agent's companion editor-extension
 * auto-install is opted out of (via that CLI's own config switch). Never blocks a launch on failure.
 */
function applyEnsureConfig(agent: Agent): void {
  const ensure = agent.ensureConfig;
  if (!ensure) {
    return;
  }

  try {
    const file = resolveHomePath(ensure.file, os.homedir());
    let existing: Record<string, unknown> = {};

    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return;
      }
      existing = parsed as Record<string, unknown>;
    }

    const { merged, changed } = mergeMissingDefaults(existing, ensure.defaults);
    if (!changed) {
      return;
    }

    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  } catch {
    // Never block a launch because of config seeding.
  }
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

  applyEnsureConfig(agent);

  const location = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string>('terminalLocation', 'beside');
  const cwd = resolveTerminalCwd(vscode.window.activeTextEditor, vscode.workspace);

  const terminal = vscode.window.createTerminal({
    name: buildTerminalName(agent.label, sequence, agent.label),
    location: location === 'panel' ? vscode.TerminalLocation.Panel : { viewColumn: vscode.ViewColumn.Beside },
    cwd,
  });
  terminal.show();
  watchForMissingAgent(terminal, agent, context);
  void vscode.window.setStatusBarMessage(`Started ${agent.label}`, 2500);
}
