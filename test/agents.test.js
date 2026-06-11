const test = require('node:test');
const assert = require('node:assert/strict');

const { BUILTIN_AGENTS, resolveAgents, resolveInstallCommand } = require('../out/agents.js');

test('resolveAgents returns the built-ins when no user agents are configured', () => {
  const agents = resolveAgents(BUILTIN_AGENTS, undefined, true);
  assert.equal(agents.length, BUILTIN_AGENTS.length);
  assert.ok(agents.some((agent) => agent.id === 'claude'));
});

test('resolveAgents omits the built-ins when disabled', () => {
  const agents = resolveAgents(BUILTIN_AGENTS, [], false);
  assert.deepEqual(agents, []);
});

test('resolveAgents appends new user agents', () => {
  const agents = resolveAgents(BUILTIN_AGENTS, [{ id: 'mine', label: 'Mine', command: 'mine' }], true);
  assert.equal(agents.length, BUILTIN_AGENTS.length + 1);
  assert.deepEqual(agents.at(-1), { id: 'mine', label: 'Mine', command: 'mine' });
});

test('resolveAgents overrides a built-in when the id matches', () => {
  const agents = resolveAgents(BUILTIN_AGENTS, [{ id: 'claude', label: 'Claude Code', command: 'my-claude' }], true);
  const claude = agents.find((agent) => agent.id === 'claude');
  assert.equal(claude.command, 'my-claude');
  // unspecified fields fall back to the built-in
  assert.equal(claude.installCommand, 'npm install -g @anthropic-ai/claude-code');
  assert.equal(agents.length, BUILTIN_AGENTS.length);
});

test('resolveAgents falls back to the id when a new agent has no label', () => {
  const agents = resolveAgents([], [{ id: 'mine', label: '   ', command: 'mine' }], false);
  assert.equal(agents[0].label, 'mine');
});

test('resolveAgents skips entries without a usable id or command', () => {
  const agents = resolveAgents([], [
    { id: '', label: 'Empty', command: 'x' },
    { id: 'ok', label: 'Ok', command: '   ' },
    { id: 'good', label: 'Good', command: 'good' },
    null,
    'nonsense',
  ], false);

  assert.deepEqual(agents.map((agent) => agent.id), ['good']);
});

test('OpenCode ships as a built-in preset', () => {
  const opencode = BUILTIN_AGENTS.find((agent) => agent.id === 'opencode');
  assert.ok(opencode);
  assert.equal(opencode.command, 'opencode');
  assert.equal(opencode.installCommand, 'npm install -g opencode-ai');
});

test('Command Code opts out of its companion editor-extension auto-install', () => {
  const cc = BUILTIN_AGENTS.find((a) => a.id === 'command-code');
  assert.ok(cc);
  assert.equal(cc.command, 'command-code');
  assert.equal(cc.ensureConfig.file, '~/.commandcode/config.json');
  assert.equal(cc.ensureConfig.defaults.autoInstallExtension, false);
});

test('npm-installable built-ins offer a guided install with their official command', () => {
  for (const id of ['claude', 'codex', 'copilot', 'kilo', 'opencode', 'command-code', 'droid', 'crush', 'mimo']) {
    const agent = BUILTIN_AGENTS.find((a) => a.id === id);
    assert.ok(agent, `expected built-in ${id}`);
    assert.equal(typeof agent.installCommand, 'string');
    assert.match(agent.installCommand, /^npm install -g /);
    assert.equal(agent.autoInstall, true);
  }
});

test('Gemini CLI is no longer a built-in preset', () => {
  assert.equal(BUILTIN_AGENTS.find((a) => a.id === 'gemini'), undefined);
});

test("Antigravity inherits Gemini's icon and uses the official OS-specific installer", () => {
  const agy = BUILTIN_AGENTS.find((a) => a.id === 'antigravity');
  assert.ok(agy);
  assert.equal(agy.icon, 'star-full');
  assert.match(agy.installCommand.unix, /antigravity\.google\/cli\/install\.sh/);
  assert.match(agy.installCommand.windows, /install\.ps1/);
  assert.equal(agy.autoInstall, true);
});

test('Grok uses the official xAI shell installer on Unix only', () => {
  const grok = BUILTIN_AGENTS.find((a) => a.id === 'grok');
  assert.match(grok.installCommand.unix, /x\.ai\/cli\/install\.sh/);
  assert.equal(grok.installCommand.windows, undefined);
});

test('Cursor, Droid, Crush, Hermes, and MiMo Code ship as built-in presets', () => {
  const byId = Object.fromEntries(BUILTIN_AGENTS.map((a) => [a.id, a]));
  assert.equal(byId.cursor.command, 'cursor-agent');
  assert.equal(byId.droid.command, 'droid');
  assert.equal(byId.crush.installCommand, 'npm install -g @charmland/crush');
  assert.equal(byId.mimo.installCommand, 'npm install -g @mimo-ai/cli');
  // Shell installers are Unix-only objects.
  assert.equal(byId.cursor.installCommand.windows, undefined);
  assert.match(byId.cursor.installCommand.unix, /cursor\.com\/install/);
  assert.match(byId.hermes.installCommand.unix, /hermes-agent\.nousresearch\.com/);
});

test('resolveInstallCommand returns cross-platform strings unchanged', () => {
  assert.equal(resolveInstallCommand('npm install -g x', 'linux'), 'npm install -g x');
  assert.equal(resolveInstallCommand('npm install -g x', 'win32'), 'npm install -g x');
});

test('resolveInstallCommand selects the per-OS variant', () => {
  const cmd = { unix: 'curl | bash', windows: 'powershell ...' };
  assert.equal(resolveInstallCommand(cmd, 'darwin'), 'curl | bash');
  assert.equal(resolveInstallCommand(cmd, 'linux'), 'curl | bash');
  assert.equal(resolveInstallCommand(cmd, 'win32'), 'powershell ...');
});

test('resolveInstallCommand returns undefined when the platform has no variant', () => {
  assert.equal(resolveInstallCommand({ unix: 'x' }, 'win32'), undefined);
  assert.equal(resolveInstallCommand(undefined, 'linux'), undefined);
});
