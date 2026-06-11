import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { Agent } from './agents.js';
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

function buildQuotedCommandPath(commandPath: string): string {
  return `"${commandPath.replace(/"/g, '\\"')}"`;
}

/** Returns the Node installer script executed inside a visible terminal after user consent. */
function buildInstallPromptScript(installCommand: string, label: string): string {
  const message = JSON.stringify(`${label} was not found.`);
  const prompt = JSON.stringify(`Install ${label} now? (y/N): `);
  const command = JSON.stringify(installCommand);

  return String.raw`const cp = require('node:child_process');
const readline = require('node:readline');

const installCommand = ${command};
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(${message});
rl.question(${prompt}, (answer) => {
  rl.close();
  const normalized = answer.trim().toLowerCase();
  if (normalized === 'y' || normalized === 'yes') {
    const child = cp.spawn(installCommand, [], { stdio: 'inherit', shell: true });
    child.on('exit', (code) => process.exit(code === null ? 1 : code));
    child.on('error', () => process.exit(1));
    return;
  }

  process.exit(0);
});
`;
}

function writeInstallPromptScript(agent: Agent): string {
  const scriptPath = path.join(os.tmpdir(), `super-cli-install-${agent.id}-${process.pid}-${Date.now()}.js`);
  fs.writeFileSync(scriptPath, buildInstallPromptScript(agent.installCommand ?? '', agent.label), 'utf8');

  return scriptPath;
}

function startGuidedInstall(agent: Agent, context: vscode.ExtensionContext): void {
  const installTerminal = vscode.window.createTerminal({
    name: `Install ${agent.label}`,
    location: vscode.TerminalLocation.Panel,
  });
  const installCommand = `node ${buildQuotedCommandPath(writeInstallPromptScript(agent))}`;

  installTerminal.show();
  executeCommandWithOptionalShellIntegration(installTerminal, installCommand, context);
}

async function handleMissingAgent(agent: Agent, context: vscode.ExtensionContext): Promise<void> {
  if (agent.installCommand && agent.autoInstall) {
    const selection = await vscode.window.showWarningMessage(
      `${agent.label} was not found. Install it now?`,
      { modal: true },
      'Install',
      'Open Settings',
    );

    if (selection === 'Install') {
      startGuidedInstall(agent, context);
    } else if (selection === 'Open Settings') {
      await openExtensionSettings(context);
    }

    return;
  }

  const installHint = agent.installCommand ? ` You can install it with: ${agent.installCommand}` : '';
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
