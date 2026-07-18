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
    terminal.dispose();

    const beforeUpdateCount = vscode.window.terminals.length;
    await vscode.commands.executeCommand('superCli.updateAgent', treeNode);

    const updateTerminal = await waitForNewTerminal(beforeUpdateCount);
    assert.match(updateTerminal.name, /^Update Super CLI Test/);
    updateTerminal.dispose();
  } finally {
    await configuration.update('favoriteAgent', originalFavorite, vscode.ConfigurationTarget.Global);
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
