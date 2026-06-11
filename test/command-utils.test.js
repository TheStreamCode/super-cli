const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTerminalName,
  normalizeTerminalName,
  buildExtensionSettingsQuery,
  resolveTerminalCwd,
  extractExecutable,
  shouldPromptToInstall,
  resolveHomePath,
  mergeMissingDefaults,
  buildLaunchCommand,
} = require('../out/command-utils.js');

// normalizeTerminalName
test('normalizeTerminalName trims configured values', () => {
  assert.equal(normalizeTerminalName('  Claude Code  ', 'Agent'), 'Claude Code');
});

test('normalizeTerminalName falls back when value is blank', () => {
  assert.equal(normalizeTerminalName('   ', 'Agent'), 'Agent');
});

// buildTerminalName
test('buildTerminalName uses the base name for the first terminal', () => {
  assert.equal(buildTerminalName('Claude Code', 1, 'Agent'), 'Claude Code');
});

test('buildTerminalName appends the sequence after the first terminal', () => {
  assert.equal(buildTerminalName('Claude Code', 3, 'Agent'), 'Claude Code 3');
});

// buildExtensionSettingsQuery
test('buildExtensionSettingsQuery targets the current extension id', () => {
  assert.equal(buildExtensionSettingsQuery('mikesoft.vscode-super-cli'), '@ext:mikesoft.vscode-super-cli');
});

// extractExecutable
test('extractExecutable returns the first token for simple commands', () => {
  assert.equal(extractExecutable('claude'), 'claude');
});

test('extractExecutable preserves quoted Windows paths with spaces', () => {
  assert.equal(
    extractExecutable('"C:\\Program Files\\Claude\\claude.exe" --help'),
    'C:\\Program Files\\Claude\\claude.exe',
  );
});

// shouldPromptToInstall
test('shouldPromptToInstall detects PowerShell command-not-found output', () => {
  const output = "claude: The term 'claude' is not recognized as a name of a cmdlet, function, script file, or executable program.";
  assert.equal(shouldPromptToInstall('claude', 1, output), true);
});

test('shouldPromptToInstall detects POSIX command-not-found exit code', () => {
  assert.equal(shouldPromptToInstall('claude', 127, ''), true);
});

test('shouldPromptToInstall detects bash command-not-found output', () => {
  assert.equal(shouldPromptToInstall('claude', 1, 'command not found: claude'), true);
});

test('shouldPromptToInstall detects the missing executable from a custom command', () => {
  assert.equal(shouldPromptToInstall('my-agent', 1, 'my-agent: command not found'), true);
});

test('shouldPromptToInstall ignores output for a different configured executable', () => {
  assert.equal(shouldPromptToInstall('my-agent', 1, 'claude: command not found'), false);
});

test('shouldPromptToInstall ignores unrelated runtime failures', () => {
  assert.equal(shouldPromptToInstall('claude', 1, 'Error: authentication required'), false);
});

test('shouldPromptToInstall ignores non-1 exit codes that are not 127', () => {
  assert.equal(shouldPromptToInstall('claude', 2, 'claude: command not found'), false);
});

// resolveTerminalCwd
test('resolveTerminalCwd uses the active editor workspace when available', () => {
  const workspace = {
    workspaceFolders: [{ uri: 'workspace-a' }, { uri: 'workspace-b' }],
    getWorkspaceFolder(uri) {
      return uri === 'file-b' ? { uri: 'workspace-b' } : undefined;
    },
  };

  const activeEditor = { document: { uri: 'file-b' } };

  assert.equal(resolveTerminalCwd(activeEditor, workspace), 'workspace-b');
});

test('resolveTerminalCwd falls back to the first workspace when the editor is outside it', () => {
  const workspace = {
    workspaceFolders: [{ uri: 'workspace-a' }],
    getWorkspaceFolder() {
      return undefined;
    },
  };

  assert.equal(resolveTerminalCwd({ document: { uri: 'external' } }, workspace), 'workspace-a');
});

test('resolveTerminalCwd returns undefined when no workspace is open', () => {
  const workspace = {
    workspaceFolders: undefined,
    getWorkspaceFolder() {
      return undefined;
    },
  };

  assert.equal(resolveTerminalCwd(undefined, workspace), undefined);
});

// resolveHomePath
test('resolveHomePath expands a bare ~ to the home directory', () => {
  assert.equal(resolveHomePath('~', '/home/mike'), '/home/mike');
});

test('resolveHomePath expands a leading ~/ segment', () => {
  assert.equal(resolveHomePath('~/.commandcode/config.json', '/home/mike'), '/home/mike/.commandcode/config.json');
});

test('resolveHomePath leaves absolute and other paths unchanged', () => {
  assert.equal(resolveHomePath('/etc/x', '/home/mike'), '/etc/x');
  assert.equal(resolveHomePath('relative/x', '/home/mike'), 'relative/x');
});

// mergeMissingDefaults
test('mergeMissingDefaults adds missing keys and reports a change', () => {
  const { merged, changed } = mergeMissingDefaults({ provider: 'cc', installed: true }, { autoInstallExtension: false });
  assert.deepEqual(merged, { provider: 'cc', installed: true, autoInstallExtension: false });
  assert.equal(changed, true);
});

test('mergeMissingDefaults never overwrites an existing key', () => {
  const { merged, changed } = mergeMissingDefaults({ autoInstallExtension: true }, { autoInstallExtension: false });
  assert.equal(merged.autoInstallExtension, true);
  assert.equal(changed, false);
});

test('mergeMissingDefaults reports no change when all keys are already present', () => {
  const { changed } = mergeMissingDefaults({ a: 1, b: 2 }, { a: 9 });
  assert.equal(changed, false);
});

// buildLaunchCommand
test('buildLaunchCommand prepends the update command before the launch command', () => {
  assert.equal(buildLaunchCommand('claude', 'npm install -g x'), 'npm install -g x ; claude');
});

test('buildLaunchCommand returns the command unchanged without an update command', () => {
  assert.equal(buildLaunchCommand('claude', undefined), 'claude');
});
