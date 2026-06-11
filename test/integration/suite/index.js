const assert = require('node:assert/strict');
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
  assert.ok(commands.includes('superCli.openSettings'));

  const beforeCount = vscode.window.terminals.length;
  await vscode.commands.executeCommand('superCli.launchAgent', {
    id: 'integration-test',
    label: 'Super CLI Test',
    command: 'node --version',
  });

  const terminal = await waitForNewTerminal(beforeCount);
  assert.match(terminal.name, /^Super CLI Test/);
  terminal.dispose();

  await vscode.commands.executeCommand('superCli.openSettings');
}

module.exports = { run };
