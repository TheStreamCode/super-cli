const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  appendBoundedText,
  buildTerminalName,
  normalizeTerminalName,
  buildExtensionSettingsQuery,
  resolveTerminalCwd,
  extractExecutable,
  shouldPromptToInstall,
  executableExistsOnPath,
  isExecutableFile,
} = require('../out/command-utils.js');

test('appendBoundedText retains output only up to the configured limit', () => {
  const first = appendBoundedText('', 'command not found', 12);
  const second = appendBoundedText(first, ' more output', 12);

  assert.equal(first, 'command not ');
  assert.equal(second, 'command not ');
});

/** Builds a fileExists predicate that returns true only for the given set of paths. */
function existsIn(paths) {
  const set = new Set(paths);
  return (filePath) => set.has(filePath);
}

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

test('shouldPromptToInstall requires command-not-found output for POSIX exit code 127', () => {
  assert.equal(shouldPromptToInstall('claude', 127, 'sh: claude: not found'), true);
  assert.equal(shouldPromptToInstall('claude', 127, ''), false);
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
  assert.equal(shouldPromptToInstall('claude', 1, 'claude: model not found'), false);
  assert.equal(shouldPromptToInstall('claude', 1, 'claude configuration not found'), false);
  assert.equal(shouldPromptToInstall('claude', 127, 'an internal helper failed'), false);
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

// executableExistsOnPath
test('executableExistsOnPath finds a command on a POSIX PATH', () => {
  const env = { PATH: '/usr/bin:/usr/local/bin' };
  const exists = existsIn(['/usr/local/bin/claude']);
  assert.equal(executableExistsOnPath('claude', env, 'linux', exists), true);
});

test('executableExistsOnPath returns false when the command is not on PATH', () => {
  const env = { PATH: '/usr/bin:/usr/local/bin' };
  assert.equal(executableExistsOnPath('claude', env, 'linux', existsIn([])), false);
});

test('executableExistsOnPath resolves a bare name via PATHEXT on Windows', () => {
  const env = { Path: 'C:\\tools', PATHEXT: '.COM;.EXE;.BAT;.CMD' };
  // npm global shims are .cmd files; the bare name must still resolve.
  const exists = existsIn(['C:\\tools\\claude.CMD']);
  assert.equal(executableExistsOnPath('claude', env, 'win32', exists), true);
});

test('executableExistsOnPath normalizes quoted Windows PATH entries', () => {
  const env = { Path: '"C:\\Program Files\\Agent"', PATHEXT: '.EXE' };
  const exists = existsIn(['C:\\Program Files\\Agent\\agent.EXE']);
  assert.equal(executableExistsOnPath('agent', env, 'win32', exists), true);
});

test('executableExistsOnPath checks a path-qualified command directly', () => {
  const exists = existsIn(['/opt/agents/my-agent']);
  assert.equal(executableExistsOnPath('/opt/agents/my-agent --flag', { PATH: '' }, 'linux', exists), true);
});

test('executableExistsOnPath uses the quoted Windows executable path', () => {
  const exists = existsIn(['C:\\Program Files\\Claude\\claude.exe']);
  const command = '"C:\\Program Files\\Claude\\claude.exe" --help';
  assert.equal(executableExistsOnPath(command, { PATHEXT: '.EXE' }, 'win32', exists), true);
});

test('executableExistsOnPath returns false for an empty command', () => {
  assert.equal(executableExistsOnPath('   ', { PATH: '/usr/bin' }, 'linux', existsIn(['/usr/bin'])), false);
});

test('isExecutableFile rejects directories', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'super-cli-'));
  try {
    assert.equal(isExecutableFile(directory, process.platform), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('isExecutableFile requires executable permission on POSIX hosts', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'super-cli-'));
  const executable = path.join(directory, process.platform === 'win32' ? 'agent.cmd' : 'agent');
  try {
    fs.writeFileSync(executable, process.platform === 'win32' ? '@echo off\r\n' : '#!/bin/sh\n');
    if (process.platform === 'win32') {
      assert.equal(isExecutableFile(executable, process.platform), true);
    } else {
      fs.chmodSync(executable, 0o644);
      assert.equal(isExecutableFile(executable, process.platform), false);
      fs.chmodSync(executable, 0o755);
      assert.equal(isExecutableFile(executable, process.platform), true);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
