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
  const treeNode = { kind: 'agent', agent: testAgent };
  const configuration = vscode.workspace.getConfiguration('superCli');
  const originalFavorite = configuration.inspect('favoriteAgent')?.globalValue;

  try {
    await configuration.update('favoriteAgent', undefined, vscode.ConfigurationTarget.Global);
    await vscode.commands.executeCommand('superCli.setFavorite', treeNode);
    assert.equal(configuration.inspect('favoriteAgent')?.globalValue, testAgent.id);

    await vscode.commands.executeCommand('superCli.unsetFavorite', treeNode);
    assert.equal(configuration.inspect('favoriteAgent')?.globalValue, undefined);

    const beforeCount = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.launchAgent', treeNode);

    const terminal = await waitForNewTerminal(beforeCount);
    assert.match(terminal.name, /^Super CLI Test/);

    const distraction = vscode.window.createTerminal({ name: 'Distraction' });
    const fakeSession = { sessionId: 'integration-test-session', agent: testAgent, terminal, startedAt: Date.now() };

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

    const beforeUpdateCount = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.updateAgent', treeNode);

    const updateTerminal = await waitForNewTerminal(beforeUpdateCount);
    assert.match(updateTerminal.name, /^Update Super CLI Test/);
    updateTerminal.dispose();
  } finally {
    await configuration.update('favoriteAgent', originalFavorite, vscode.ConfigurationTarget.Global);
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
        () => '',
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
