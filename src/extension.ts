import * as vscode from 'vscode';
import { type Agent, BUILTIN_AGENTS, resolveAgents } from './agents.js';
import { AgentTreeDataProvider } from './tree.js';
import { launchAgent, openExtensionSettings } from './terminal.js';

const SETTINGS_NAMESPACE = 'superCli';

let terminalSequence = 1;

/** Resolves the effective agent list from built-ins and user (global) configuration. */
function getEffectiveAgents(): Agent[] {
  const configuration = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE);
  const useBuiltins = configuration.get<boolean>('useBuiltins', true);
  // Read user-level config only; workspace overrides are ignored for security.
  const userAgents = configuration.inspect<Agent[]>('agents')?.globalValue;

  return resolveAgents(BUILTIN_AGENTS, userAgents, useBuiltins);
}

interface AgentQuickPickItem extends vscode.QuickPickItem {
  agent: Agent;
}

export function activate(context: vscode.ExtensionContext): void {
  const treeProvider = new AgentTreeDataProvider(getEffectiveAgents);
  const treeView = vscode.window.createTreeView('superCli.agents', { treeDataProvider: treeProvider });

  const launchCommand = vscode.commands.registerCommand('superCli.launch', async () => {
    const agents = getEffectiveAgents();

    if (agents.length === 0) {
      const selection = await vscode.window.showInformationMessage(
        'No coding agents are configured. Add one in settings or enable the built-in presets.',
        'Open Settings',
      );

      if (selection === 'Open Settings') {
        await openExtensionSettings(context);
      }

      return;
    }

    const picked = await vscode.window.showQuickPick<AgentQuickPickItem>(
      agents.map((agent) => ({ label: agent.label, description: agent.command, agent })),
      { placeHolder: 'Select a coding agent to launch' },
    );

    if (picked) {
      await launchAgent(picked.agent, context, terminalSequence++);
    }
  });

  const launchAgentCommand = vscode.commands.registerCommand('superCli.launchAgent', async (agent?: Agent) => {
    if (!agent) {
      return;
    }

    await launchAgent(agent, context, terminalSequence++);
  });

  const refreshCommand = vscode.commands.registerCommand('superCli.refresh', () => {
    treeProvider.refresh();
  });

  const openSettingsCommand = vscode.commands.registerCommand('superCli.openSettings', async () => {
    await openExtensionSettings(context);
  });

  const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('superCli.agents') || event.affectsConfiguration('superCli.useBuiltins')) {
      treeProvider.refresh();
    }
  });

  context.subscriptions.push(
    treeView,
    launchCommand,
    launchAgentCommand,
    refreshCommand,
    openSettingsCommand,
    configWatcher,
  );
}

export function deactivate(): void {
}
