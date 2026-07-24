import * as vscode from 'vscode';
import {
  type Agent,
  type AgentDefinition,
  BUILTIN_AGENTS,
  filterHiddenBuiltins,
  resolveCommandAgentArgument,
  resolveAgentCommands,
  resolveAgents,
  resolveCommandPlatform,
} from './agents.js';
import {
  buildAgentSections,
  compareAgentsByLabel,
  shouldOfferFavoriteAfterLaunch,
  shouldOfferRatingAfterLaunch,
} from './agent-view.js';
import { executableExistsOnPath, isExecutableFile } from './command-utils.js';
import { buildDoctorReport, inspectAgents, type DoctorResult } from './doctor.js';
import { resolveAgentIcon } from './icons.js';
import { AgentTreeDataProvider } from './tree.js';
import { launchAgent, openExtensionSettings, updateAgent } from './terminal.js';

const SETTINGS_NAMESPACE = 'superCli';

let terminalSequence = 1;

function getGlobalStringArray(configuration: vscode.WorkspaceConfiguration, setting: string): string[] {
  const value = configuration.inspect<unknown>(setting)?.globalValue;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** Resolves the effective agent list from built-ins and user (global) configuration. */
function getEffectiveAgents(): Agent[] {
  const configuration = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE);
  const useBuiltins = configuration.get<boolean>('useBuiltins', true);
  const useWsl = configuration.get<boolean>('useWsl', false) && process.platform === 'win32';
  const commandPlatform = resolveCommandPlatform(process.platform, useWsl);
  // Read user-level config only; workspace overrides are ignored for security.
  const userAgents = configuration.inspect<AgentDefinition[]>('agents')?.globalValue;
  const hiddenBuiltins = getGlobalStringArray(configuration, 'hiddenBuiltins');

  const visibleBuiltins = filterHiddenBuiltins(BUILTIN_AGENTS, hiddenBuiltins);
  return resolveAgents(visibleBuiltins, userAgents, useBuiltins)
    .map((agent) => resolveAgentCommands(agent, commandPlatform));
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
  agent?: Agent;
}

export function activate(context: vscode.ExtensionContext): void {
  // Best-effort "installed / not installed" status per agent, keyed by id (undefined = unknown).
  const installStatus = new Map<string, boolean>();
  const doctorResults = new Map<string, DoctorResult>();
  let statusRefreshSequence = 0;
  const doctorReportUri = vscode.Uri.parse('super-cli:/agent-doctor.md');
  let doctorReport = '# Super CLI Agent Doctor\n\nRun **Super CLI: Run Agent Doctor** to inspect configured agents.\n';
  const doctorReportEmitter = new vscode.EventEmitter<vscode.Uri>();
  const doctorReportProvider: vscode.TextDocumentContentProvider = {
    onDidChange: doctorReportEmitter.event,
    provideTextDocumentContent: () => doctorReport,
  };

  const treeProvider = new AgentTreeDataProvider(
    getEffectiveAgents,
    getFavoriteId,
    (id) => installStatus.get(id),
    (id) => doctorResults.get(id),
    context.extensionUri,
  );
  const treeView = vscode.window.createTreeView('superCli.agents', { treeDataProvider: treeProvider });

  // Recomputes install status off the activation path. Under WSL the host PATH is not representative,
  // so status is left unknown rather than reported as missing.
  const refreshInstallStatus = (): void => {
    const refreshSequence = ++statusRefreshSequence;
    installStatus.clear();
    doctorResults.clear();
    treeProvider.refresh();

    setTimeout(() => {
      if (refreshSequence !== statusRefreshSequence) {
        return;
      }

      const useWsl = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<boolean>('useWsl', false)
        && process.platform === 'win32';

      if (!useWsl) {
        for (const agent of getEffectiveAgents()) {
          installStatus.set(
            agent.id,
            executableExistsOnPath(agent.command, process.env, process.platform, isExecutableFile),
          );
        }
      }

      treeProvider.refresh();
    }, 0);
  };

  const manageBuiltins = async (): Promise<void> => {
    const configuration = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE);
    const hiddenIds = new Set(getGlobalStringArray(configuration, 'hiddenBuiltins'));
    const items = [...BUILTIN_AGENTS]
      .sort(compareAgentsByLabel)
      .map((agent) => ({
        label: agent.label,
        description: agent.id,
        picked: !hiddenIds.has(agent.id),
        agentId: agent.id,
      }));
    const selection = await vscode.window.showQuickPick(items, {
      canPickMany: true,
      placeHolder: 'Choose the built-in agents shown by Super CLI',
      title: 'Manage Built-in Agents',
      ignoreFocusOut: true,
    });

    if (!selection) {
      return;
    }

    const selectedIds = new Set(selection.map((item) => item.agentId));
    const nextHiddenIds = BUILTIN_AGENTS
      .map((agent) => agent.id)
      .filter((id) => !selectedIds.has(id));
    await configuration.update('useBuiltins', selection.length > 0, vscode.ConfigurationTarget.Global);
    await configuration.update('hiddenBuiltins', nextHiddenIds, vscode.ConfigurationTarget.Global);

    const favoriteId = getFavoriteId();
    if (favoriteId && nextHiddenIds.includes(favoriteId)) {
      await setFavoriteId('');
      void vscode.window.showInformationMessage('The hidden agent was removed as your favorite.');
    }
  };

  const runDoctor = async (): Promise<void> => {
    const agents = getEffectiveAgents();
    const useWsl = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<boolean>('useWsl', false)
      && process.platform === 'win32';

    installStatus.clear();
    if (!useWsl) {
      for (const agent of agents) {
        installStatus.set(
          agent.id,
          executableExistsOnPath(agent.command, process.env, process.platform, isExecutableFile),
        );
      }
    }
    treeProvider.refresh();

    const results = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Super CLI: checking coding agents',
        cancellable: false,
      },
      () => inspectAgents(
        agents,
        (id) => installStatus.get(id),
        vscode.workspace.isTrusted,
        useWsl,
      ),
    );

    doctorResults.clear();
    for (const [id, result] of results) {
      doctorResults.set(id, result);
    }
    treeProvider.refresh();

    doctorReport = buildDoctorReport(
      agents,
      results,
      process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
      useWsl,
      vscode.workspace.isTrusted,
    );
    doctorReportEmitter.fire(doctorReportUri);
    const document = await vscode.workspace.openTextDocument(doctorReportUri);
    await vscode.window.showTextDocument(document, { preview: true });
  };

  const openAgentDocumentation = async (agent: Agent): Promise<void> => {
    if (agent.installationDocumentationUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(agent.installationDocumentationUrl));
    }
  };

  // Offers a one-time, local-only rating prompt once the user has launched agents enough to be a
  // genuine fan. No usage data ever leaves the machine: the launch count and prompt-shown flag are
  // both stored in this extension's own globalState. Fire-and-forget like the update-completion
  // notice in terminal.ts, so a pending toast never blocks the launch command itself.
  const maybeOfferRatingPrompt = (): void => {
    const launchCount = context.globalState.get<number>('launchCount', 0) + 1;
    void context.globalState.update('launchCount', launchCount);

    const ratingPromptShown = context.globalState.get<boolean>('hasShownRatingPrompt', false);
    if (!shouldOfferRatingAfterLaunch(launchCount, ratingPromptShown)) {
      return;
    }

    void context.globalState.update('hasShownRatingPrompt', true);
    void vscode.window.showInformationMessage(
      'Enjoying Super CLI? A quick rating helps other developers find it.',
      'Rate Super CLI',
    ).then((choice) => {
      if (choice === 'Rate Super CLI') {
        void vscode.commands.executeCommand('extension.open', context.extension.id);
      }
    });
  };

  const launchAndMaybeOfferRating = async (agent: Agent): Promise<boolean> => {
    const launched = await launchAgent(agent, context, terminalSequence++);
    if (launched) {
      maybeOfferRatingPrompt();
    }

    return launched;
  };

  const launchWithStatusGuard = async (agent: Agent): Promise<boolean> => {
    if (installStatus.get(agent.id) !== false) {
      return launchAndMaybeOfferRating(agent);
    }

    const actions = agent.installationDocumentationUrl
      ? ['Open Setup Guide', 'Launch Anyway'] as const
      : ['Open Settings', 'Launch Anyway'] as const;
    const selection = await vscode.window.showWarningMessage(
      `${agent.label} was not found on PATH.`,
      ...actions,
    );

    if (selection === 'Open Setup Guide') {
      await openAgentDocumentation(agent);
    } else if (selection === 'Open Settings') {
      await openExtensionSettings(context);
    } else if (selection === 'Launch Anyway') {
      return launchAndMaybeOfferRating(agent);
    }

    return false;
  };

  const buildQuickPickItems = (): AgentQuickPickItem[] => {
    const agents = getEffectiveAgents();
    const favoriteId = getFavoriteId();
    const sections = buildAgentSections(agents, favoriteId, (id) => installStatus.get(id));
    const items: AgentQuickPickItem[] = [];

    for (const section of sections) {
      items.push({ label: section.label, kind: vscode.QuickPickItemKind.Separator });
      for (const agent of section.agents) {
        const status = installStatus.get(agent.id);
        items.push({
          label: agent.label,
          description: agent.command,
          detail: status === false ? 'Setup required' : status === true ? 'Ready to launch' : 'Installation status unknown',
          iconPath: resolveAgentIcon(agent, context.extensionUri),
          buttons: [{
            iconPath: new vscode.ThemeIcon(agent.id === favoriteId ? 'star-full' : 'star-empty'),
            tooltip: agent.id === favoriteId ? 'Remove favorite' : 'Set as favorite',
          }],
          agent,
        });
      }
    }

    return items;
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

    const quickPick = vscode.window.createQuickPick<AgentQuickPickItem>();
    quickPick.placeholder = 'Select a coding agent to launch';
    quickPick.matchOnDescription = true;
    quickPick.matchOnDetail = true;
    quickPick.items = buildQuickPickItems();

    const picked = await new Promise<Agent | undefined>((resolve) => {
      let accepted = false;
      const acceptListener = quickPick.onDidAccept(() => {
        const agent = quickPick.selectedItems[0]?.agent;
        if (!agent) {
          return;
        }

        accepted = true;
        quickPick.hide();
        resolve(agent);
      });
      const buttonListener = quickPick.onDidTriggerItemButton(async (event) => {
        const agent = event.item.agent;
        if (!agent) {
          return;
        }

        await setFavoriteId(agent.id === getFavoriteId() ? '' : agent.id);
        quickPick.items = buildQuickPickItems();
        treeProvider.refresh();
      });
      const hideListener = quickPick.onDidHide(() => {
        acceptListener.dispose();
        buttonListener.dispose();
        hideListener.dispose();
        quickPick.dispose();
        if (!accepted) {
          resolve(undefined);
        }
      });

      quickPick.show();
    });

    if (!picked) {
      return;
    }

    const launched = await launchWithStatusGuard(picked);

    if (shouldOfferFavoriteAfterLaunch(offerFavorite, launched, picked.id, getFavoriteId())) {
      const choice = await vscode.window.showInformationMessage(
        `Set "${picked.label}" as your favorite agent? You can then launch it with Ctrl+Alt+A.`,
        'Set Favorite',
      );

      if (choice === 'Set Favorite') {
        await setFavoriteId(picked.id);
      }
    }
  };

  const launchCommand = vscode.commands.registerCommand('superCli.launch', () => runLaunchQuickPick(false));

  const launchFavoriteCommand = vscode.commands.registerCommand('superCli.launchFavorite', async () => {
    const favoriteId = getFavoriteId();
    const favorite = favoriteId ? getEffectiveAgents().find((agent) => agent.id === favoriteId) : undefined;

    if (favorite) {
      await launchWithStatusGuard(favorite);
      return;
    }

    // No favorite set (or it no longer exists): let the user pick one and offer to remember it.
    await runLaunchQuickPick(true);
  });

  const launchAgentCommand = vscode.commands.registerCommand('superCli.launchAgent', async (argument?: unknown) => {
    const agent = resolveCommandAgentArgument(argument);
    if (!agent) {
      return;
    }

    await launchWithStatusGuard(agent);
  });

  const setFavoriteCommand = vscode.commands.registerCommand('superCli.setFavorite', async (argument?: unknown) => {
    const agent = resolveCommandAgentArgument(argument);
    if (!agent) {
      return;
    }

    await setFavoriteId(agent.id);
    void vscode.window.setStatusBarMessage(`${agent.label} is now the favorite agent`, 2500);
  });

  const unsetFavoriteCommand = vscode.commands.registerCommand('superCli.unsetFavorite', async (argument?: unknown) => {
    const agent = resolveCommandAgentArgument(argument);
    if (!agent) {
      return;
    }

    await setFavoriteId('');
  });

  const updateAgentCommand = vscode.commands.registerCommand('superCli.updateAgent', async (argument?: unknown) => {
    const agent = resolveCommandAgentArgument(argument);
    if (!agent) {
      return;
    }

    await updateAgent(agent, context);
  });

  const openAgentDocumentationCommand = vscode.commands.registerCommand(
    'superCli.openAgentDocumentation',
    async (argument?: unknown) => {
      const agent = resolveCommandAgentArgument(argument);
      if (agent) {
        await openAgentDocumentation(agent);
      }
    },
  );

  const enableBuiltinsCommand = vscode.commands.registerCommand('superCli.enableBuiltins', async () => {
    const configuration = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE);
    await configuration.update('useBuiltins', true, vscode.ConfigurationTarget.Global);
    await configuration.update('hiddenBuiltins', [], vscode.ConfigurationTarget.Global);
    refreshInstallStatus();
  });

  const manageBuiltinsCommand = vscode.commands.registerCommand('superCli.manageBuiltins', manageBuiltins);
  const runDoctorCommand = vscode.commands.registerCommand('superCli.runDoctor', runDoctor);

  const refreshCommand = vscode.commands.registerCommand('superCli.refresh', () => {
    refreshInstallStatus();
  });

  const openSettingsCommand = vscode.commands.registerCommand('superCli.openSettings', async () => {
    await openExtensionSettings(context);
  });

  const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('superCli.agents') || event.affectsConfiguration('superCli.useBuiltins')
      || event.affectsConfiguration('superCli.hiddenBuiltins')
      || event.affectsConfiguration('superCli.useWsl')) {
      refreshInstallStatus();
    }

    if (event.affectsConfiguration('superCli.agents') || event.affectsConfiguration('superCli.useBuiltins')
      || event.affectsConfiguration('superCli.hiddenBuiltins')
      || event.affectsConfiguration('superCli.favoriteAgent')) {
      treeProvider.refresh();
    }
  });

  const themeWatcher = vscode.window.onDidChangeActiveColorTheme(() => {
    treeProvider.refresh();
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
    openAgentDocumentationCommand,
    enableBuiltinsCommand,
    manageBuiltinsCommand,
    runDoctorCommand,
    refreshCommand,
    openSettingsCommand,
    configWatcher,
    themeWatcher,
    doctorReportEmitter,
    vscode.workspace.registerTextDocumentContentProvider('super-cli', doctorReportProvider),
  );
}
