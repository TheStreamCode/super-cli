const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

/** Waits for a terminal created by the launcher to appear in the window. */
async function waitForNewTerminal(beforeCount, timeoutMs = 3000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (vscode.window.terminals.length > beforeCount) {
      return vscode.window.terminals[vscode.window.terminals.length - 1];
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error('Expected the launcher to create a terminal.');
}

/** Waits for the given terminal to become the active one. */
async function waitForActiveTerminal(expected, timeoutMs = 3000) {
  await waitForCondition(() => vscode.window.activeTerminal === expected, 'Expected the terminal to become active.', timeoutMs);
}

/** Polls a predicate until it is true or the timeout elapses. */
async function waitForCondition(predicate, message, timeoutMs = 3000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(message);
}

// Disposing and immediately creating another terminal back-to-back is unreliable in this test host --
// the new terminal can silently take well over waitForNewTerminal's default timeout to appear. Every
// dispose that is directly followed by expecting a fresh terminal waits here for the close to land first.
async function disposeAndWaitClosed(terminal, timeoutMs = 3000) {
  terminal.dispose();
  await waitForCondition(
    () => !vscode.window.terminals.includes(terminal),
    'Expected the terminal to close before continuing.',
    timeoutMs,
  );
}

/** Runs the VS Code smoke tests for the extension host. */
async function run() {
  const extension = vscode.extensions.getExtension('mikesoft.vscode-super-cli');
  assert.ok(extension, 'Expected extension to be available in the test host');

  await extension.activate();
  assert.equal(extension.isActive, true);

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('superCli.launch'));
  assert.ok(commands.includes('superCli.launchAgent'));
  assert.ok(commands.includes('superCli.setFavorite'));
  assert.ok(commands.includes('superCli.unsetFavorite'));
  assert.ok(commands.includes('superCli.updateAgent'));
  assert.ok(commands.includes('superCli.openAgentDocumentation'));
  assert.ok(commands.includes('superCli.revealSession'));
  assert.ok(commands.includes('superCli.stopSession'));
  assert.ok(commands.includes('superCli.restartSession'));
  assert.ok(commands.includes('superCli.stopAllSessions'));
  assert.ok(commands.includes('superCli.enableBuiltins'));
  assert.ok(commands.includes('superCli.manageBuiltins'));
  assert.ok(commands.includes('superCli.runDoctor'));
  assert.ok(commands.includes('superCli.openSettings'));

  const testAgent = {
    id: 'integration-test',
    label: 'Super CLI Test',
    command: 'node --version',
    updateCommand: 'node --version',
  };
  const testAgent2 = {
    id: 'integration-test-2',
    label: 'Super CLI Test 2',
    command: 'node --version',
  };
  const treeNode = { kind: 'agent', agent: testAgent };
  const configuration = vscode.workspace.getConfiguration('superCli');
  const originalAgents = configuration.inspect('agents')?.globalValue;
  const originalFavorites = configuration.inspect('favoriteAgents')?.globalValue;
  const originalUseBuiltins = configuration.inspect('useBuiltins')?.globalValue;

  try {
    // launchFavorite cross-references getEffectiveAgents(), so the test agents need to be
    // registered for real, not just passed as ad-hoc command arguments like the other commands below.
    // Built-ins are disabled so superCli.updateAllAgents (below) only ever sees testAgent's safe
    // "node --version" update command, never a real built-in's actual (network-touching) one.
    await configuration.update('agents', [testAgent, testAgent2], vscode.ConfigurationTarget.Global);
    await configuration.update('favoriteAgents', [], vscode.ConfigurationTarget.Global);
    await configuration.update('useBuiltins', false, vscode.ConfigurationTarget.Global);

    await vscode.commands.executeCommand('superCli.setFavorite', treeNode);
    assert.deepEqual(configuration.inspect('favoriteAgents')?.globalValue, [testAgent.id]);

    // Adds to the favorites list rather than replacing it -- the actual new behavior here.
    const treeNode2 = { kind: 'agent', agent: testAgent2 };
    await vscode.commands.executeCommand('superCli.setFavorite', treeNode2);
    assert.deepEqual(configuration.inspect('favoriteAgents')?.globalValue, [testAgent.id, testAgent2.id]);

    await vscode.commands.executeCommand('superCli.unsetFavorite', treeNode2);
    assert.deepEqual(configuration.inspect('favoriteAgents')?.globalValue, [testAgent.id]);

    // With exactly one favorite, launchFavorite launches it directly, same as before multi-favorite
    // support existed. The N>1 case opens an interactive QuickPick, which (matching the pre-existing
    // "no favorite set" fallback below, itself never driven through its own picker) isn't automated
    // here -- driving VS Code's real QuickPick UI isn't exposed to this test harness.
    const beforeFavoriteLaunch = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.launchFavorite');
    const favoriteTerminal = await waitForNewTerminal(beforeFavoriteLaunch);
    assert.match(favoriteTerminal.name, /^Super CLI Test/);
    favoriteTerminal.dispose();

    await vscode.commands.executeCommand('superCli.unsetFavorite', treeNode);
    assert.deepEqual(configuration.inspect('favoriteAgents')?.globalValue, []);

    const beforeCount = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.launchAgent', treeNode);

    const terminal = await waitForNewTerminal(beforeCount);
    assert.match(terminal.name, /^Super CLI Test/);

    const distraction = vscode.window.createTerminal({ name: 'Distraction' });
    const fakeSession = {
      sessionId: 'integration-test-session',
      agent: testAgent,
      terminal,
      startedAt: Date.now(),
      cwd: undefined,
    };

    // Tree rows pass the raw session as item.command's argument — see tree.ts's getTreeItem.
    distraction.show();
    await waitForActiveTerminal(distraction);
    await vscode.commands.executeCommand('superCli.revealSession', fakeSession);
    await waitForActiveTerminal(terminal);

    // A wrapped tree node (as context-menu invocations pass) must resolve the same way.
    distraction.show();
    await waitForActiveTerminal(distraction);
    await vscode.commands.executeCommand('superCli.revealSession', { kind: 'session', session: fakeSession });
    await waitForActiveTerminal(terminal);

    distraction.dispose();

    // superCli.stopSession disposes the terminal — real argument resolution, not a direct dispose().
    const beforeStop = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.stopSession', fakeSession);
    await waitForCondition(
      () => vscode.window.terminals.length < beforeStop && !vscode.window.terminals.includes(terminal),
      'Expected superCli.stopSession to dispose the terminal.',
    );

    // superCli.restartSession disposes the old terminal and relaunches the same agent, reusing its
    // exact cwd (here captured from the first launch) rather than re-resolving or prompting for one.
    const beforeRestartLaunch = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.launchAgent', treeNode);
    const restartTerminal = await waitForNewTerminal(beforeRestartLaunch);
    const originalCwd = restartTerminal.creationOptions?.cwd;
    const restartSession = {
      sessionId: 'integration-test-restart-session',
      agent: testAgent,
      terminal: restartTerminal,
      startedAt: Date.now(),
      cwd: originalCwd,
    };

    const beforeRestart = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.restartSession', restartSession);
    await waitForCondition(
      () => !vscode.window.terminals.includes(restartTerminal) && vscode.window.terminals.length === beforeRestart,
      'Expected superCli.restartSession to dispose the original terminal and relaunch a replacement.',
    );

    const relaunchedTerminal = vscode.window.terminals[vscode.window.terminals.length - 1];
    assert.match(relaunchedTerminal.name, /^Super CLI Test/);
    assert.deepEqual(relaunchedTerminal.creationOptions?.cwd, originalCwd);
    await disposeAndWaitClosed(relaunchedTerminal);

    const beforeUpdateCount = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.updateAgent', treeNode);

    const updateTerminal = await waitForNewTerminal(beforeUpdateCount);
    assert.match(updateTerminal.name, /^Update Super CLI Test/);
    await disposeAndWaitClosed(updateTerminal);

    // superCli.updateAllAgents runs every updatable agent's update command in sequence. With builtins
    // disabled above, only testAgent has an updateCommand ("node --version"), so exactly one terminal
    // opens here, not one per agent -- testAgent2 (no updateCommand) must be skipped entirely.
    const beforeUpdateAllCount = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.updateAllAgents');
    const updateAllTerminal = await waitForNewTerminal(beforeUpdateAllCount);
    assert.match(updateAllTerminal.name, /^Update Super CLI Test/);
    assert.equal(vscode.window.terminals.length, beforeUpdateAllCount + 1);
    await disposeAndWaitClosed(updateAllTerminal);

    // superCli.stopAllSessions disposes every running session's terminal in one shot. A command that
    // never exits on its own keeps each session tracked as "running" until explicitly stopped.
    const longRunningAgent = {
      id: 'integration-test-long-1',
      label: 'Super CLI Long 1',
      command: 'node -e "setInterval(() => {}, 1000)"',
    };
    const longRunningAgent2 = {
      id: 'integration-test-long-2',
      label: 'Super CLI Long 2',
      command: 'node -e "setInterval(() => {}, 1000)"',
    };
    const beforeBulkLaunch = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.launchAgent', { kind: 'agent', agent: longRunningAgent });
    const bulkTerminal1 = await waitForNewTerminal(beforeBulkLaunch);
    await vscode.commands.executeCommand('superCli.launchAgent', { kind: 'agent', agent: longRunningAgent2 });
    const bulkTerminal2 = await waitForNewTerminal(beforeBulkLaunch + 1);

    try {
      await vscode.commands.executeCommand('superCli.stopAllSessions');
      await waitForCondition(
        () => !vscode.window.terminals.includes(bulkTerminal1) && !vscode.window.terminals.includes(bulkTerminal2),
        'Expected superCli.stopAllSessions to dispose every running session terminal.',
      );
    } finally {
      if (vscode.window.terminals.includes(bulkTerminal1)) {
        bulkTerminal1.dispose();
      }
      if (vscode.window.terminals.includes(bulkTerminal2)) {
        bulkTerminal2.dispose();
      }
    }
  } finally {
    await configuration.update('agents', originalAgents, vscode.ConfigurationTarget.Global);
    await configuration.update('favoriteAgents', originalFavorites, vscode.ConfigurationTarget.Global);
    await configuration.update('useBuiltins', originalUseBuiltins, vscode.ConfigurationTarget.Global);
  }

  // Exercises AgentSessionRegistry and the sidebar's tree shaping directly against the real vscode
  // API, in an isolated registry, since activate() does not export the extension's own registry.
  const { AgentSessionRegistry } = require(path.join(extension.extensionPath, 'out', 'sessions.js'));
  const { AgentTreeDataProvider } = require(path.join(extension.extensionPath, 'out', 'tree.js'));
  const { launchAgent } = require(path.join(extension.extensionPath, 'out', 'terminal.js'));

  const registry = new AgentSessionRegistry();
  try {
    // Backstop path: closing the terminal outright clears its session.
    const closeProbeTerminal = vscode.window.createTerminal({ name: 'Close probe' });
    const closeProbeSession = registry.start(testAgent, closeProbeTerminal);
    assert.ok(registry.list().some((session) => session.sessionId === closeProbeSession.sessionId));

    closeProbeTerminal.dispose();
    await waitForCondition(
      () => !registry.list().some((session) => session.sessionId === closeProbeSession.sessionId),
      'Expected the session to clear once its terminal closed.',
    );

    // Tree shaping: a running session renders a spinning "Running" group above the static agents,
    // with one child row that reveals its terminal when clicked.
    const treeProbeTerminal = vscode.window.createTerminal({ name: 'Tree probe' });
    try {
      const treeProbeSession = registry.start(testAgent, treeProbeTerminal);
      const provider = new AgentTreeDataProvider(
        () => [],
        () => [],
        () => undefined,
        () => undefined,
        () => registry.list(),
        extension.extensionUri,
      );

      const roots = provider.getChildren();
      assert.equal(roots[0].kind, 'running-group');
      const groupItem = provider.getTreeItem(roots[0]);
      assert.equal(groupItem.label, 'Running');
      assert.equal(groupItem.iconPath.id, 'loading~spin');

      const sessionNodes = provider.getChildren(roots[0]);
      assert.equal(sessionNodes.length, 1);
      assert.equal(sessionNodes[0].session.sessionId, treeProbeSession.sessionId);

      const sessionItem = provider.getTreeItem(sessionNodes[0]);
      assert.equal(sessionItem.label, testAgent.label);
      assert.equal(sessionItem.command.command, 'superCli.revealSession');
      assert.deepEqual(sessionItem.command.arguments, [treeProbeSession]);
    } finally {
      treeProbeTerminal.dispose();
    }

    // Tree shaping: favorites get their own leading group (a distinct section, not merely pinned
    // rows), with a star icon and the ★ prefix carried onto each row; non-favorites land in their
    // usual status group and are never duplicated into Favorites.
    const favoritesProvider = new AgentTreeDataProvider(
      () => [testAgent, testAgent2],
      () => [testAgent.id],
      () => undefined,
      () => undefined,
      () => [],
      extension.extensionUri,
    );

    const favoritesRoots = favoritesProvider.getChildren();
    assert.equal(favoritesRoots[0].kind, 'group');
    assert.equal(favoritesRoots[0].id, 'favorite');
    const favoritesGroupItem = favoritesProvider.getTreeItem(favoritesRoots[0]);
    assert.equal(favoritesGroupItem.label, 'Favorites');
    assert.equal(favoritesGroupItem.iconPath.id, 'star-full');
    assert.equal(favoritesGroupItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);

    const favoriteAgentNodes = favoritesProvider.getChildren(favoritesRoots[0]);
    assert.equal(favoriteAgentNodes.length, 1);
    assert.equal(favoriteAgentNodes[0].agent.id, testAgent.id);
    assert.equal(favoritesProvider.getTreeItem(favoriteAgentNodes[0]).label, `★ ${testAgent.label}`);

    const unknownGroupNode = favoritesRoots.find((node) => node.kind === 'group' && node.id === 'unknown');
    assert.ok(unknownGroupNode, 'Expected a separate group for the non-favorite agent');
    assert.deepEqual(
      favoritesProvider.getChildren(unknownGroupNode).map((node) => node.agent.id),
      [testAgent2.id],
    );

    // Shell-execution-end path: the launched CLI command exits (here, `node --version` returns
    // immediately) but the terminal itself stays open at a bare shell prompt.
    const shortLivedAgent = { id: 'integration-test-short', label: 'Super CLI Short', command: 'node --version' };
    const fakeContext = { extensionUri: extension.extensionUri, subscriptions: [] };
    const beforeShortLived = vscode.window.terminals.length;
    await launchAgent(shortLivedAgent, fakeContext, 1, registry);

    const shortLivedTerminal = await waitForNewTerminal(beforeShortLived);
    try {
      await waitForCondition(
        () => !registry.list().some((session) => session.terminal === shortLivedTerminal),
        'Expected the session to clear once the launched CLI command exited.',
        10_000,
      );
      assert.ok(
        vscode.window.terminals.includes(shortLivedTerminal),
        'Expected the terminal to stay open after the CLI command exited.',
      );
    } finally {
      shortLivedTerminal.dispose();
    }
  } finally {
    registry.dispose();
  }

  // sendText fallback path (Windows only): VS Code docs confirm cmd.exe does not support shell
  // integration, making it a reliable, deterministic way to force executeCommandWithOptionalShellIntegration
  // past its 3s timeout into the fallback branch, rather than racing a real shell's integration hooks.
  // Exported from terminal.js solely for this — see AGENTS.md.
  if (process.platform === 'win32') {
    const { executeCommandWithOptionalShellIntegration } = require(path.join(extension.extensionPath, 'out', 'terminal.js'));
    const cmdTerminal = vscode.window.createTerminal({ name: 'Cmd fallback probe', shellPath: 'cmd.exe' });

    try {
      let shellExecutionEndFired = false;
      let fallbackFired = false;

      executeCommandWithOptionalShellIntegration(
        cmdTerminal,
        'ver',
        { subscriptions: [] },
        () => {
          shellExecutionEndFired = true;
        },
        () => {
          fallbackFired = true;
        },
      );

      await waitForCondition(
        () => fallbackFired,
        'Expected the sendText fallback to fire for a cmd.exe terminal.',
        5000,
      );

      assert.equal(cmdTerminal.shellIntegration, undefined, 'Expected cmd.exe to never report shell integration.');
      assert.equal(shellExecutionEndFired, false, 'Expected the fallback path to never invoke onShellExecutionEnd.');
      assert.ok(
        vscode.window.terminals.includes(cmdTerminal),
        'Expected the terminal to survive taking the fallback path.',
      );
    } finally {
      cmdTerminal.dispose();
    }
  }

  await vscode.commands.executeCommand('superCli.runDoctor');
  const firstDoctorDocument = vscode.workspace.textDocuments.find(
    (document) => document.uri.toString() === 'super-cli:/agent-doctor.md',
  );
  assert.ok(firstDoctorDocument, 'Expected Agent Doctor to open its virtual report');

  await vscode.commands.executeCommand('superCli.runDoctor');
  const doctorDocuments = vscode.workspace.textDocuments.filter(
    (document) => document.uri.toString() === 'super-cli:/agent-doctor.md',
  );
  assert.equal(doctorDocuments.length, 1);
  assert.equal(doctorDocuments[0], firstDoctorDocument);
  assert.equal((doctorDocuments[0].getText().match(/^# Super CLI Agent Doctor$/gm) ?? []).length, 1);
  assert.doesNotMatch(doctorDocuments[0].getText(), /Launch command/);
  assert.equal(fs.existsSync(path.join(extension.extensionPath, 'agent-doctor.md')), false);

  await vscode.commands.executeCommand('superCli.openSettings');
}

module.exports = { run };
