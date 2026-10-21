const test = require('node:test');
const assert = require('node:assert/strict');

const { confirmWorkspaceTrust } = require('../out/command-utils.js');

/** Builds a prompt double that records the UI calls the gate makes. */
function createPrompt({ isTrusted, selection }) {
  const calls = { warnings: [], commands: [], settings: 0 };

  return {
    calls,
    prompt: {
      isTrusted: () => isTrusted,
      showWarningMessage: async (message, ...actions) => {
        calls.warnings.push({ message, actions });
        return selection;
      },
      executeCommand: async (command) => {
        calls.commands.push(command);
      },
      openSettings: async () => {
        calls.settings += 1;
      },
    },
  };
}

test('trust gate allows commands in a trusted workspace without prompting', async () => {
  const { prompt, calls } = createPrompt({ isTrusted: true });

  assert.equal(await confirmWorkspaceTrust(prompt, 'updating agents'), true);
  assert.deepEqual(calls.warnings, []);
  assert.deepEqual(calls.commands, []);
  assert.equal(calls.settings, 0);
});

test('trust gate refuses to start commands in an untrusted workspace', async () => {
  const { prompt, calls } = createPrompt({ isTrusted: false, selection: undefined });

  assert.equal(await confirmWorkspaceTrust(prompt, 'updating agents'), false);
  assert.equal(calls.warnings.length, 1);
  assert.match(
    calls.warnings[0].message,
    /Trust this workspace before updating agents\./,
  );
  assert.deepEqual(calls.warnings[0].actions, ['Manage Workspace Trust', 'Open Settings']);
});

test('trust gate opens workspace trust management when asked', async () => {
  const { prompt, calls } = createPrompt({ isTrusted: false, selection: 'Manage Workspace Trust' });

  assert.equal(await confirmWorkspaceTrust(prompt, 'launching Claude Code'), false);
  assert.deepEqual(calls.commands, ['workbench.trust.manage']);
  assert.equal(calls.settings, 0);
});

test('trust gate opens extension settings when asked', async () => {
  const { prompt, calls } = createPrompt({ isTrusted: false, selection: 'Open Settings' });

  assert.equal(await confirmWorkspaceTrust(prompt, 'updating agents'), false);
  assert.deepEqual(calls.commands, []);
  assert.equal(calls.settings, 1);
});
