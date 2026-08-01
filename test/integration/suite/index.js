const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

/** Waits for a matching terminal that was not present before the action under test. */
async function waitForNewTerminal(beforeTerminals, predicate, timeoutMs = 3000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const created = vscode.window.terminals.find(
      (terminal) => !beforeTerminals.has(terminal) && predicate(terminal),
    );
    if (created) {
      return created;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(
    `Expected the launcher to create a matching terminal. Open terminals: ${JSON.stringify(
      vscode.window.terminals.map((terminal) => terminal.name),
    )}`,
  );
}

/**
 * Polls a predicate until it is true or the timeout elapses. `message` may be a function, so a
 * caller can report the state that actually caused the failure without paying for it on every poll.
 */
async function waitForCondition(predicate, message, timeoutMs = 3000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(typeof message === 'function' ? message() : message);
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
    const beforeFavoriteLaunch = new Set(vscode.window.terminals);
    await vscode.commands.executeCommand('superCli.launchFavorite');
    const favoriteTerminal = await waitForNewTerminal(
      beforeFavoriteLaunch,
      (candidate) => /^Super CLI Test/.test(candidate.name),
    );
    assert.match(favoriteTerminal.name, /^Super CLI Test/);
    await disposeAndWaitClosed(favoriteTerminal);

    await vscode.commands.executeCommand('superCli.unsetFavorite', treeNode);
    assert.deepEqual(configuration.inspect('favoriteAgents')?.globalValue, []);

    const beforeLaunch = new Set(vscode.window.terminals);
    await vscode.commands.executeCommand('superCli.launchAgent', treeNode);

    const terminal = await waitForNewTerminal(
      beforeLaunch,
      (candidate) => /^Super CLI Test/.test(candidate.name),
    );
    assert.match(terminal.name, /^Super CLI Test/);

    const fakeSession = {
      sessionId: 'integration-test-session',
      agent: testAgent,
      terminal,
      startedAt: Date.now(),
      cwd: undefined,
    };

    // revealSession is "resolve the argument, then call show() on that session's terminal". What is
    // worth asserting is the resolution: it must accept both the raw session (what tree rows pass
    // through item.command — see tree.ts's getTreeItem) and the wrapped node (what context-menu
    // invocations pass). Whether show() then moves the OS focus is VS Code's behaviour, not this
    // extension's, and asserting it via vscode.window.activeTerminal made the macOS leg permanently
    // red -- a headless runner will not move focus between the editor area, where launches land, and
    // the panel. A stand-in terminal records the call directly instead: deterministic everywhere, and
    // it pins the part that is actually ours. resolveCommandSessionArgument only requires the session
    // to carry a sessionId, an agent and a terminal, so a plain object is a valid one.
    let revealedCount = 0;
    const spySession = {
      sessionId: 'integration-test-reveal-spy',
      agent: testAgent,
      terminal: { show: () => { revealedCount++; } },
      startedAt: Date.now(),
      cwd: undefined,
    };

    await vscode.commands.executeCommand('superCli.revealSession', spySession);
    assert.equal(revealedCount, 1, 'Expected a raw session argument to reveal its terminal.');

    await vscode.commands.executeCommand('superCli.revealSession', { kind: 'session', session: spySession });
    assert.equal(revealedCount, 2, 'Expected a wrapped tree node to reveal its terminal too.');

    // A malformed argument must be ignored rather than throwing out of the command handler.
    await vscode.commands.executeCommand('superCli.revealSession', { kind: 'agent', agent: testAgent });
    await vscode.commands.executeCommand('superCli.revealSession', undefined);
    assert.equal(revealedCount, 2, 'Expected unrecognized arguments to reveal nothing.');

    // superCli.stopSession disposes the terminal — real argument resolution, not a direct dispose().
    const beforeStop = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.stopSession', fakeSession);
    await waitForCondition(
      () => vscode.window.terminals.length < beforeStop && !vscode.window.terminals.includes(terminal),
      'Expected superCli.stopSession to dispose the terminal.',
    );

    // superCli.restartSession disposes the old terminal and relaunches the same agent, reusing its
    // exact cwd (here captured from the first launch) rather than re-resolving or prompting for one.
    const beforeRestartLaunch = new Set(vscode.window.terminals);
    await vscode.commands.executeCommand('superCli.launchAgent', treeNode);
    const restartTerminal = await waitForNewTerminal(
      beforeRestartLaunch,
      (candidate) => /^Super CLI Test/.test(candidate.name),
    );
    const originalCwd = restartTerminal.creationOptions?.cwd;
    const restartSession = {
      sessionId: 'integration-test-restart-session',
      agent: testAgent,
      terminal: restartTerminal,
      startedAt: Date.now(),
      cwd: originalCwd,
    };

    // Identified by name and identity rather than by array position: vscode.window.terminals is not
    // ordered in a way this test may rely on, and restartSession deliberately overlaps the two
    // terminals (it launches the replacement before disposing the original), so "the last one" is not
    // dependably the replacement.
    const beforeRestart = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.restartSession', restartSession);
    const findRelaunched = () => vscode.window.terminals.find(
      (candidate) => candidate !== restartTerminal && /^Super CLI Test/.test(candidate.name),
    );
    await waitForCondition(
      () => !vscode.window.terminals.includes(restartTerminal)
        && vscode.window.terminals.length === beforeRestart
        && findRelaunched() !== undefined,
      () => 'Expected superCli.restartSession to dispose the original terminal and relaunch a replacement. '
        + `Open terminals: ${JSON.stringify(vscode.window.terminals.map((candidate) => candidate.name))}`,
    );

    const relaunchedTerminal = findRelaunched();
    assert.deepEqual(relaunchedTerminal.creationOptions?.cwd, originalCwd);
    await disposeAndWaitClosed(relaunchedTerminal);

    const beforeUpdate = new Set(vscode.window.terminals);
    await vscode.commands.executeCommand('superCli.updateAgent', treeNode);

    const updateTerminal = await waitForNewTerminal(
      beforeUpdate,
      (candidate) => /^Update Super CLI Test/.test(candidate.name),
    );
    assert.match(updateTerminal.name, /^Update Super CLI Test/);
    await disposeAndWaitClosed(updateTerminal);

    // superCli.updateAllAgents runs every updatable agent's update command in sequence, in ONE shared
    // "Super CLI: updates" terminal rather than one terminal per agent. With builtins disabled above,
    // only testAgent has an updateCommand ("node --version"); testAgent2 must be skipped entirely.
    const beforeUpdateAll = new Set(vscode.window.terminals);
    const beforeUpdateAllCount = beforeUpdateAll.size;
    await vscode.commands.executeCommand('superCli.updateAllAgents');
    const updateAllTerminal = await waitForNewTerminal(
      beforeUpdateAll,
      (candidate) => candidate.name === 'Super CLI: updates',
    );
    assert.equal(updateAllTerminal.name, 'Super CLI: updates');
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
    const beforeBulkLaunch = new Set(vscode.window.terminals);
    await vscode.commands.executeCommand('superCli.launchAgent', { kind: 'agent', agent: longRunningAgent });
    const bulkTerminal1 = await waitForNewTerminal(
      beforeBulkLaunch,
      (candidate) => candidate.name === longRunningAgent.label
        || candidate.name.startsWith(`${longRunningAgent.label} `),
    );
    const beforeSecondBulkLaunch = new Set(vscode.window.terminals);
    await vscode.commands.executeCommand('superCli.launchAgent', { kind: 'agent', agent: longRunningAgent2 });
    const bulkTerminal2 = await waitForNewTerminal(
      beforeSecondBulkLaunch,
      (candidate) => candidate.name === longRunningAgent2.label
        || candidate.name.startsWith(`${longRunningAgent2.label} `),
    );

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

    // Adoption: this is how sessions survive a window reload. A terminal that already exists is taken
    // over, flagged as adopted (its true start time died with the previous extension host), and taking
    // it over twice must not produce a second row -- the sweep can run more than once.
    const adoptionTerminal = vscode.window.createTerminal({ name: 'Adoption probe' });
    try {
      const adoptedSession = registry.adopt(testAgent, adoptionTerminal, undefined);
      assert.ok(adoptedSession, 'Expected an untracked terminal to be adopted.');
      assert.equal(adoptedSession.adopted, true);
      assert.equal(registry.adopt(testAgent, adoptionTerminal, undefined), undefined, 'Adoption must be idempotent.');
      assert.equal(registry.list().filter((session) => session.terminal === adoptionTerminal).length, 1);

      // A real launch on the same terminal supersedes the adoption rather than adding to it: whichever
      // order onDidOpenTerminal and launchAgent land in, the terminal ends up with exactly one row and
      // the launch's own metadata wins.
      const launchedOverAdoption = registry.start(testAgent, adoptionTerminal, undefined);
      assert.equal(launchedOverAdoption.adopted, false);
      assert.equal(registry.list().filter((session) => session.terminal === adoptionTerminal).length, 1);

      // An adopted row reports that it reconnected instead of inventing a runtime it cannot know.
      const adoptedOnly = new AgentSessionRegistry();
      try {
        adoptedOnly.adopt(testAgent, adoptionTerminal, undefined);
        const adoptedProvider = new AgentTreeDataProvider(
          () => [],
          () => [],
          () => undefined,
          () => undefined,
          () => adoptedOnly.list(),
          extension.extensionUri,
        );
        const adoptedRoots = adoptedProvider.getChildren();
        const adoptedRow = adoptedProvider.getTreeItem(adoptedProvider.getChildren(adoptedRoots[0])[0]);
        assert.match(adoptedRow.description, /^reconnected/);
        assert.match(adoptedRow.tooltip, /reconnected after a window reload/);
      } finally {
        adoptedOnly.dispose();
      }
    } finally {
      // Also the documented end of an adopted session: it has no shell-integration listener, so
      // closing the terminal is the only thing that can clear it.
      adoptionTerminal.dispose();
      await waitForCondition(
        () => !registry.list().some((session) => session.terminal === adoptionTerminal),
        'Expected the adopted session to clear once its terminal closed.',
      );
    }

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
    const beforeShortLived = new Set(vscode.window.terminals);
    await launchAgent(shortLivedAgent, fakeContext, 1, registry);

    const shortLivedTerminal = await waitForNewTerminal(
      beforeShortLived,
      (candidate) => candidate.name === shortLivedAgent.label,
    );
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

  // Regression: runAgentUpdate must ALWAYS settle. An update command that never exits on its own (an
  // interactive prompt, a hung download) used to leave the promise pending forever, stranding
  // superCli.updateAllAgents behind a non-cancellable progress notification with no way out but
  // reloading the window. Closing the terminal is now a real escape hatch, and this asserts it.
  const { runAgentUpdate, createSharedUpdateTerminal } = require(path.join(extension.extensionPath, 'out', 'terminal.js'));
  const hangingUpdateCommand = 'node -e "setInterval(() => {}, 1000)"';
  const hangingAgent = {
    id: 'integration-test-hang',
    label: 'Super CLI Hang',
    command: 'node --version',
    updateCommand: hangingUpdateCommand,
  };
  const hangTerminal = createSharedUpdateTerminal();
  assert.equal(hangTerminal.name, 'Super CLI: updates');

  const hangOutcome = runAgentUpdate(
    hangingAgent,
    hangingUpdateCommand,
    hangTerminal,
    { extensionUri: extension.extensionUri, subscriptions: [] },
    { notify: false },
  );

  // Closed well inside the 3s shell-integration fallback window, so the terminal-close path under
  // test is the only thing that can settle this promise.
  await new Promise((resolve) => setTimeout(resolve, 500));
  hangTerminal.dispose();

  const hangSettled = await Promise.race([
    hangOutcome,
    new Promise((resolve) => setTimeout(() => resolve('still-pending'), 5000)),
  ]);
  assert.equal(hangSettled, 'terminal-closed', 'Expected runAgentUpdate to settle once its terminal closed.');

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
