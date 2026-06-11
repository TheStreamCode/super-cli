const test = require('node:test');
const assert = require('node:assert/strict');

const { BUILTIN_AGENTS, resolveAgents } = require('../out/agents.js');

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

test('npm-installable built-ins offer a guided install with their official command', () => {
  for (const id of ['claude', 'codex', 'copilot', 'gemini', 'kilo', 'opencode']) {
    const agent = BUILTIN_AGENTS.find((a) => a.id === id);
    assert.ok(agent, `expected built-in ${id}`);
    assert.match(agent.installCommand, /^npm install -g /);
    assert.equal(agent.autoInstall, true);
  }
});
