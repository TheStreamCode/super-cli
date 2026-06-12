import * as fs from 'node:fs';
import * as vscode from 'vscode';
import { type Agent, BUILTIN_AGENTS, resolveAgents } from './agents.js';
import { executableExistsOnPath } from './command-utils.js';
import { AgentTreeDataProvider } from './tree.js';
import { launchAgent, openExtensionSettings, updateAgent } from './terminal.js';

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

/** Returns the id of the user's favorite agent, or '' when none is set. */
function getFavoriteId(): string {
  return vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string>('favoriteAgent', '');
}

/** Persists the favorite agent id (or clears it when empty) at the user (global) level. */
async function setFavoriteId(id: string): Promise<void> {
  await vscode.workspace
    .getConfiguration(SETTINGS_NAMESPACE)
    .update('favoriteAgent', id || undefined, vscode.ConfigurationTarget.Global);
}

interface AgentQuickPickItem extends vscode.QuickPickItem {
  agent: Agent;
}

export function activate(context: vscode.ExtensionContext): void {
  // Best-effort "installed / not installed" status per agent, keyed by id (undefined = unknown).
  const installStatus = new Map<string, boolean>();

  const treeProvider = new AgentTreeDataProvider(
    getEffectiveAgents,
    getFavoriteId,
    (id) => installStatus.get(id),
  );
  const treeView = vscode.window.createTreeView('superCli.agents', { treeDataProvider: treeProvider });

  // Recomputes install status off the activation path. Under WSL the host PATH is not representative,
  // so status is left unknown rather than reported as missing.
  const refreshInstallStatus = (): void => {
    setTimeout(() => {
      installStatus.clear();
      const useWsl = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<boolean>('useWsl', false)
        && process.platform === 'win32';

      if (!useWsl) {
        for (const agent of getEffectiveAgents()) {
          installStatus.set(agent.id, executableExistsOnPath(agent.command, process.env, process.platform, fs.existsSync));
        }
      }

      treeProvider.refresh();
    }, 0);
  };

  // Shows the agent picker and launches the chosen agent; optionally offers to remember it as favorite.
  const runLaunchQuickPick = async (offerFavorite: boolean): Promise<void> => {
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

    if (!picked) {
      return;
    }

    await launchAgent(picked.agent, context, terminalSequence++);

    if (offerFavorite) {
      const choice = await vscode.window.showInformationMessage(
        `Set "${picked.agent.label}" as your favorite agent? You can then launch it with Ctrl+Alt+A.`,
        'Set Favorite',
      );

      if (choice === 'Set Favorite') {
        await setFavoriteId(picked.agent.id);
      }
    }
  };

  const launchCommand = vscode.commands.registerCommand('superCli.launch', () => runLaunchQuickPick(false));

  const launchFavoriteCommand = vscode.commands.registerCommand('superCli.launchFavorite', async () => {
    const favoriteId = getFavoriteId();
    const favorite = favoriteId ? getEffectiveAgents().find((agent) => agent.id === favoriteId) : undefined;

    if (favorite) {
      await launchAgent(favorite, context, terminalSequence++);
      return;
    }

    // No favorite set (or it no longer exists): let the user pick one and offer to remember it.
    await runLaunchQuickPick(true);
  });

  const launchAgentCommand = vscode.commands.registerCommand('superCli.launchAgent', async (agent?: Agent) => {
    if (!agent) {
      return;
    }

    await launchAgent(agent, context, terminalSequence++);
  });

  const setFavoriteCommand = vscode.commands.registerCommand('superCli.setFavorite', async (agent?: Agent) => {
    if (!agent) {
      return;
    }

    await setFavoriteId(agent.id);
    void vscode.window.setStatusBarMessage(`${agent.label} is now the favorite agent`, 2500);
  });

  const unsetFavoriteCommand = vscode.commands.registerCommand('superCli.unsetFavorite', async (agent?: Agent) => {
    if (!agent) {
      return;
    }

    await setFavoriteId('');
  });

  const updateAgentCommand = vscode.commands.registerCommand('superCli.updateAgent', async (agent?: Agent) => {
    if (!agent) {
      return;
    }

    await updateAgent(agent, context);
  });

  const refreshCommand = vscode.commands.registerCommand('superCli.refresh', () => {
    refreshInstallStatus();
    treeProvider.refresh();
  });

  const openSettingsCommand = vscode.commands.registerCommand('superCli.openSettings', async () => {
    await openExtensionSettings(context);
  });

  const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('superCli.agents') || event.affectsConfiguration('superCli.useBuiltins')
      || event.affectsConfiguration('superCli.useWsl')) {
      refreshInstallStatus();
    }

    if (event.affectsConfiguration('superCli.agents') || event.affectsConfiguration('superCli.useBuiltins')
      || event.affectsConfiguration('superCli.favoriteAgent')) {
      treeProvider.refresh();
    }
  });

  refreshInstallStatus();

  context.subscriptions.push(
    treeView,
    launchCommand,
    launchFavoriteCommand,
    launchAgentCommand,
    setFavoriteCommand,
    unsetFavoriteCommand,
    updateAgentCommand,
    refreshCommand,
    openSettingsCommand,
    configWatcher,
  );
}

export function deactivate(): void {
}
