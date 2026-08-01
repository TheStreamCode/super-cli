import * as vscode from 'vscode';
import {
  type Agent,
  type AgentDefinition,
  BUILTIN_AGENTS,
  filterHiddenBuiltins,
  normalizeInstallationDocumentationUrl,
  resolveCommandAgentArgument,
  resolveAgentCommands,
  resolveAgents,
  resolveCommandPlatform,
} from './agents.js';
import {
  buildAgentGroups,
  compareAgentsByLabel,
  retainAvailableFavoriteIds,
  resolveMigratedFavorites,
  shouldOfferFavoriteAfterLaunch,
  shouldOfferRatingAfterLaunch,
} from './agent-view.js';
import { executableExistsOnPath, findAgentByTerminalName, isExecutableFile } from './command-utils.js';
import { buildDoctorReport, inspectAgents, type DoctorResult } from './doctor.js';
import { resolveAgentIcon } from './icons.js';
import { AgentSessionRegistry, resolveCommandSessionArgument } from './sessions.js';
import { AgentTreeDataProvider } from './tree.js';
import {
  createSharedUpdateTerminal,
  launchAgent,
  openExtensionSettings,
  runAgentUpdate,
  updateAgent,
  type UpdateOutcome,
} from './terminal.js';

const SETTINGS_NAMESPACE = 'superCli';

// How long after activation a newly opened terminal is still treated as a possible reload survivor.
// Long enough for VS Code to finish reconnecting terminals, short enough that terminals the user
// opens themselves a moment later are never mistaken for agents.
const TERMINAL_ADOPTION_GRACE_MS = 10_000;

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

/** Returns the ids of the user's favorite agents. */
function getFavoriteIds(): string[] {
  return vscode.workspace.getConfiguration(SETTINGS_NAMESPACE).get<string[]>('favoriteAgents', []);
}

/** Mirrors the environment VS Code gives the agent terminal, including configured overrides. */
function getAgentEnvironment(agent: Agent): NodeJS.ProcessEnv {
  return agent.env ? { ...process.env, ...agent.env } : process.env;
}

/** Persists the full favorites list at the user (global) level. */
async function updateFavorites(ids: string[]): Promise<void> {
  await vscode.workspace
    .getConfiguration(SETTINGS_NAMESPACE)
    .update('favoriteAgents', ids, vscode.ConfigurationTarget.Global);
}

async function addFavorite(id: string): Promise<void> {
  const current = getFavoriteIds();
  if (!current.includes(id)) {
    await updateFavorites([...current, id]);
  }
}

async function removeFavorite(id: string): Promise<void> {
  await updateFavorites(getFavoriteIds().filter((existing) => existing !== id));
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

  const sessions = new AgentSessionRegistry();

  const treeProvider = new AgentTreeDataProvider(
    getEffectiveAgents,
    getFavoriteIds,
    (id) => installStatus.get(id),
    (id) => doctorResults.get(id),
    () => sessions.list(),
    context.extensionUri,
  );
  const treeView = vscode.window.createTreeView('superCli.agents', { treeDataProvider: treeProvider });
  const sessionsChangeListener = sessions.onDidChange(() => treeProvider.refresh());

  // Recovers sessions after a window reload. VS Code reconnects terminal processes across a reload
  // (terminal.integrated.enablePersistentSessions), but the extension host restarts with an empty
  // registry, so agents that are still running would silently vanish from the Running group. The only
  // surviving link is the terminal's name, which buildTerminalName derived from the agent's label.
  //
  // A terminal the user happens to have named exactly like an agent would be adopted too. That is
  // accepted: the visible consequence is one extra row whose Stop button closes a terminal the user
  // named after an agent, which is a far smaller problem than losing track of real running agents.
  const adoptTerminal = (terminal: vscode.Terminal): void => {
    const agent = findAgentByTerminalName(terminal.name, getEffectiveAgents());
    if (!agent) {
      return;
    }

    // creationOptions is not typed for reconnected terminals, so the cwd is only reused when it
    // really is a Uri; otherwise a restart resolves the folder afresh instead of trusting a string.
    const options = terminal.creationOptions as { cwd?: unknown };
    const cwd = options.cwd instanceof vscode.Uri ? options.cwd : undefined;
    sessions.adopt(agent, terminal, cwd);
  };

  const adoptExistingTerminals = (): void => {
    for (const terminal of vscode.window.terminals) {
      adoptTerminal(terminal);
    }
  };

  // One-time migration from the legacy single-favorite setting. The legacy setting is deliberately
  // left in place (never cleared) rather than being wiped after copying it over: clearing it would
  // propagate through Settings Sync and could erase the favorite on another machine still running
  // an older version that only reads the legacy key.
  const migrateLegacyFavorite = async (): Promise<void> => {
    const configuration = vscode.workspace.getConfiguration(SETTINGS_NAMESPACE);
    const legacyFavoriteId = configuration.inspect<string>('favoriteAgent')?.globalValue;
    const currentFavoriteIds = configuration.inspect<string[]>('favoriteAgents')?.globalValue;
    const migrated = resolveMigratedFavorites(legacyFavoriteId, currentFavoriteIds);

    if (migrated) {
      await updateFavorites(migrated);
      treeProvider.refresh();
    }
  };

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
            executableExistsOnPath(agent.command, getAgentEnvironment(agent), process.platform, isExecutableFile),
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

    const favoriteIds = getFavoriteIds();
    // A hidden built-in may still resolve through a user override with the same id. Keep that
    // favorite because the effective agent remains launchable; only remove ids that disappeared.
    const availableFavoriteIds = retainAvailableFavoriteIds(
      favoriteIds,
      getEffectiveAgents().map((agent) => agent.id),
    );
    const removedFavorites = favoriteIds.filter((id) => !availableFavoriteIds.includes(id));
    if (removedFavorites.length > 0) {
      await updateFavorites(availableFavoriteIds);
      void vscode.window.showInformationMessage(
        removedFavorites.length === 1
          ? 'The hidden agent was removed from your favorites.'
          : `${removedFavorites.length} hidden agents were removed from your favorites.`,
      );
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
          executableExistsOnPath(agent.command, getAgentEnvironment(agent), process.platform, isExecutableFile),
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
    const documentationUrl = normalizeInstallationDocumentationUrl(agent.installationDocumentationUrl);
    if (documentationUrl) {
      await vscode.env.openExternal(vscode.Uri.parse(documentationUrl));
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
    const launched = await launchAgent(agent, context, terminalSequence++, sessions);
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
    const favoriteIds = getFavoriteIds();
    // Same grouping the sidebar tree renders, shown here as quick-pick separators.
    const groups = buildAgentGroups(agents, favoriteIds, (id) => installStatus.get(id));
    const items: AgentQuickPickItem[] = [];

    for (const group of groups) {
      items.push({ label: group.label, kind: vscode.QuickPickItemKind.Separator });
      for (const agent of group.agents) {
        const status = installStatus.get(agent.id);
        const isFavorite = favoriteIds.includes(agent.id);
        items.push({
          label: agent.label,
          description: agent.command,
          detail: status === false ? 'Setup required' : status === true ? 'Ready to launch' : 'Installation status unknown',
          iconPath: resolveAgentIcon(agent, context.extensionUri),
          buttons: [{
            iconPath: new vscode.ThemeIcon(isFavorite ? 'star-full' : 'star-empty'),
            tooltip: isFavorite ? 'Remove favorite' : 'Set as favorite',
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

        if (getFavoriteIds().includes(agent.id)) {
          await removeFavorite(agent.id);
        } else {
          await addFavorite(agent.id);
        }

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

    if (shouldOfferFavoriteAfterLaunch(offerFavorite, launched, picked.id, getFavoriteIds())) {
      const choice = await vscode.window.showInformationMessage(
        `Set "${picked.label}" as your favorite agent? You can then launch it with Ctrl+Alt+A.`,
        'Set Favorite',
      );

      if (choice === 'Set Favorite') {
        await addFavorite(picked.id);
      }
    }
  };

  const launchCommand = vscode.commands.registerCommand('superCli.launch', () => runLaunchQuickPick(false));

  const launchFavoriteCommand = vscode.commands.registerCommand('superCli.launchFavorite', async () => {
    const favoriteIds = getFavoriteIds();
    const favorites = getEffectiveAgents().filter((agent) => favoriteIds.includes(agent.id));

    if (favorites.length === 1) {
      await launchWithStatusGuard(favorites[0]);
      return;
    }

    if (favorites.length > 1) {
      const sorted = [...favorites].sort(compareAgentsByLabel);
      const picked = await vscode.window.showQuickPick<AgentQuickPickItem>(
        sorted.map((agent) => {
          const status = installStatus.get(agent.id);
          return {
            label: agent.label,
            description: agent.command,
            detail: status === false ? 'Setup required' : status === true ? 'Ready to launch' : 'Installation status unknown',
            iconPath: resolveAgentIcon(agent, context.extensionUri),
            agent,
          };
        }),
        { placeHolder: 'Select a favorite agent to launch' },
      );

      if (picked?.agent) {
        await launchWithStatusGuard(picked.agent);
      }

      return;
    }

    // No favorites set: let the user pick one from the full list and offer to remember it.
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

    await addFavorite(agent.id);
    void vscode.window.setStatusBarMessage(`${agent.label} added to favorites`, 2500);
  });

  const unsetFavoriteCommand = vscode.commands.registerCommand('superCli.unsetFavorite', async (argument?: unknown) => {
    const agent = resolveCommandAgentArgument(argument);
    if (!agent) {
      return;
    }

    await removeFavorite(agent.id);
    void vscode.window.setStatusBarMessage(`${agent.label} removed from favorites`, 2500);
  });

  const updateAgentCommand = vscode.commands.registerCommand('superCli.updateAgent', async (argument?: unknown) => {
    const agent = resolveCommandAgentArgument(argument);
    if (!agent) {
      return;
    }

    await updateAgent(agent, context);
  });

  const revealSessionCommand = vscode.commands.registerCommand('superCli.revealSession', (argument?: unknown) => {
    const session = resolveCommandSessionArgument(argument);
    session?.terminal.show();
  });

  // Disposing the terminal triggers AgentSessionRegistry's own onDidCloseTerminal listener, so the
  // session clears itself the same way it would if the user had closed the terminal directly.
  const stopSessionCommand = vscode.commands.registerCommand('superCli.stopSession', (argument?: unknown) => {
    const session = resolveCommandSessionArgument(argument);
    session?.terminal.dispose();
  });

  // Reuses the session's original cwd as-is (bypassing launchAgent's own resolution and its
  // workspace-folder picker) so a restart lands in exactly the same place, without asking again.
  // Launches the replacement BEFORE disposing the original: launchAgent returns false without
  // creating a terminal for an untrusted workspace or an agent with no command configured, and the
  // original session must survive that — a restart that fails should never be a silent stop.
  const restartSessionCommand = vscode.commands.registerCommand('superCli.restartSession', async (argument?: unknown) => {
    const session = resolveCommandSessionArgument(argument);
    if (!session) {
      return;
    }

    const launched = await launchAgent(session.agent, context, terminalSequence++, sessions, session.cwd);
    if (launched) {
      session.terminal.dispose();
    }
  });

  // Each dispose() triggers AgentSessionRegistry's own onDidCloseTerminal listener individually, same
  // as stopping one session at a time — there is no separate bulk code path in the registry itself.
  const stopAllSessionsCommand = vscode.commands.registerCommand('superCli.stopAllSessions', () => {
    for (const session of sessions.list()) {
      session.terminal.dispose();
    }
  });

  // Runs updates one at a time in a single shared terminal, rather than firing them all concurrently
  // (which would run a dozen network-fetching package managers at once) or opening one terminal per
  // agent (which would leave a dozen terminals behind). Agents confirmed missing from PATH are
  // skipped, same as launchWithStatusGuard's default guard — asking "Launch Anyway?" once per missing
  // agent would be as much friction as the picker launchAgent avoids.
  //
  // Every await here must be escapable, or one update that never finishes (an interactive prompt, a
  // hung network call) would strand the whole run behind a progress notification: runAgentUpdate
  // settles when its terminal closes, the loop stops outright if the shared terminal goes away, and
  // the progress is cancellable so the user can abandon a stuck update. Cancelling stops Super CLI
  // from issuing further commands; it can't kill a command already running in the terminal, which is
  // why the terminal is left open for the user to see and deal with.
  const updateAllAgentsCommand = vscode.commands.registerCommand('superCli.updateAllAgents', async () => {
    // Paired with its resolved command so the loop below never has to assert it is still defined.
    const withUpdateCommand = getEffectiveAgents()
      .flatMap((agent) => agent.updateCommand ? [{ agent, updateCommand: agent.updateCommand }] : []);
    const updatable = withUpdateCommand.filter(({ agent }) => installStatus.get(agent.id) !== false);
    const notInstalled = withUpdateCommand.length - updatable.length;

    if (updatable.length === 0) {
      void vscode.window.showInformationMessage(
        notInstalled > 0
          ? 'No installed agents have an update command configured.'
          : 'No agents have an update command configured.',
      );
      return;
    }

    let succeeded = 0;
    let failed = 0;
    let stoppedEarly = false;
    let sharedTerminal: vscode.Terminal | undefined;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Super CLI: updating agents',
        cancellable: true,
      },
      async (progress, token) => {
        const cancelled = new Promise<'cancelled'>((resolve) => {
          token.onCancellationRequested(() => resolve('cancelled'));
        });

        for (const [index, { agent, updateCommand }] of updatable.entries()) {
          if (token.isCancellationRequested) {
            stoppedEarly = true;
            return;
          }

          progress.report({ message: `${agent.label} (${index + 1}/${updatable.length})` });

          // An agent carrying its own env can't share a terminal that was created without it, so it
          // gets a dedicated one (updateAgent's own path) to keep its update running as configured.
          let outcome: UpdateOutcome | 'cancelled';
          if (agent.env && Object.keys(agent.env).length > 0) {
            outcome = await Promise.race([updateAgent(agent, context), cancelled]);
          } else {
            sharedTerminal ??= createSharedUpdateTerminal();
            outcome = await Promise.race([
              runAgentUpdate(agent, updateCommand, sharedTerminal, context, { notify: false }),
              cancelled,
            ]);
          }

          progress.report({ increment: 100 / updatable.length });

          if (outcome === 'succeeded') {
            succeeded++;
          } else if (outcome === 'failed') {
            failed++;
          }

          // The shared terminal is gone (or the user cancelled): stop instead of firing the remaining
          // commands into a dead terminal, or behind an update the user just walked away from.
          if (outcome === 'cancelled' || outcome === 'terminal-closed') {
            stoppedEarly = true;
            return;
          }
        }
      },
    );

    const summary = `Updated ${succeeded}/${updatable.length} agents`
      + (failed > 0 ? `, ${failed} failed` : '')
      + (stoppedEarly ? ', stopped early' : '')
      + (notInstalled > 0 ? ` (${notInstalled} not installed, skipped)` : '');
    void vscode.window.setStatusBarMessage(summary, 4000);
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
      || event.affectsConfiguration('superCli.favoriteAgents')) {
      treeProvider.refresh();
    }
  });

  const themeWatcher = vscode.window.onDidChangeActiveColorTheme(() => {
    treeProvider.refresh();
  });

  refreshInstallStatus();
  void migrateLegacyFavorite();

  // Terminals reconnected by a reload can surface a little after activation, so the sweep runs once
  // now and then again for anything opened during a short grace period. Once that closes, a new
  // terminal is either one of our own launches (already registered, and start() would supersede an
  // adoption anyway) or genuinely the user's, and is left alone.
  adoptExistingTerminals();
  const adoptionDeadline = Date.now() + TERMINAL_ADOPTION_GRACE_MS;
  const adoptionListener = vscode.window.onDidOpenTerminal((terminal) => {
    if (Date.now() > adoptionDeadline) {
      adoptionListener.dispose();
      return;
    }

    adoptTerminal(terminal);
  });

  context.subscriptions.push(
    sessions,
    sessionsChangeListener,
    adoptionListener,
    treeView,
    launchCommand,
    launchFavoriteCommand,
    launchAgentCommand,
    setFavoriteCommand,
    unsetFavoriteCommand,
    updateAgentCommand,
    openAgentDocumentationCommand,
    revealSessionCommand,
    stopSessionCommand,
    restartSessionCommand,
    stopAllSessionsCommand,
    updateAllAgentsCommand,
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
