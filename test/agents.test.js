const test = require('node:test');
const assert = require('node:assert/strict');

const { BUILTIN_AGENTS, getMissingAgentGuidance, resolveAgents } = require('../out/agents.js');

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
  assert.equal(claude.installationDocumentationUrl, 'https://code.claude.com/docs/en/setup');
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

test('resolveAgents ignores legacy non-string documentation and update values', () => {
  const agents = resolveAgents([], [{
    id: 'legacy',
    label: 'Legacy',
    command: 'legacy',
    installationDocumentationUrl: { unix: 'not-a-url' },
    updateCommand: { unix: 'legacy update' },
  }], false);

  assert.equal(agents[0].installationDocumentationUrl, undefined);
  assert.equal(agents[0].updateCommand, undefined);
});

test('OpenCode ships as a built-in preset', () => {
  const opencode = BUILTIN_AGENTS.find((agent) => agent.id === 'opencode');
  assert.ok(opencode);
  assert.equal(opencode.command, 'opencode');
  assert.equal(opencode.installationDocumentationUrl, 'https://opencode.ai/docs/');
});

test('agents with a known update command carry their official one', () => {
  const expected = {
    claude: 'claude update',
    codex: 'codex update',
    copilot: 'copilot update',
    kilo: 'kilo upgrade',
    hermes: 'hermes update',
    opencode: 'opencode upgrade',
    cursor: 'cursor-agent update',
    droid: 'droid update',
    pi: 'pi update',
  };
  for (const [id, cmd] of Object.entries(expected)) {
    const agent = BUILTIN_AGENTS.find((a) => a.id === id);
    assert.equal(agent.updateCommand, cmd, id);
  }
});

test('self-updating CLIs have no manual update command', () => {
  for (const id of ['mimo', 'command-code']) {
    const agent = BUILTIN_AGENTS.find((a) => a.id === id);
    assert.equal(agent.updateCommand, undefined, id);
  }
});

test('Claude Code skips its IDE extension auto-install via env', () => {
  const claude = BUILTIN_AGENTS.find((a) => a.id === 'claude');
  assert.equal(claude.env.CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL, '1');
});

test('Command Code launches without modifying its configuration', () => {
  const cc = BUILTIN_AGENTS.find((a) => a.id === 'command-code');
  assert.ok(cc);
  assert.equal(cc.command, 'command-code');
  assert.equal(Object.hasOwn(cc, 'ensureConfig'), false);
});

test('built-ins expose only verified official installation documentation', () => {
  const documentationUrls = {
    claude: 'https://code.claude.com/docs/en/setup',
    codex: 'https://developers.openai.com/codex/cli/',
    copilot: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/install-copilot-cli',
    kilo: 'https://kilo.ai/docs/cli',
    opencode: 'https://opencode.ai/docs/',
    cursor: 'https://cursor.com/docs/cli/overview',
    droid: 'https://docs.factory.ai/cli/getting-started',
    crush: 'https://github.com/charmbracelet/crush',
    hermes: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
    pi: 'https://pi.dev/docs/latest',
  };

  for (const [id, url] of Object.entries(documentationUrls)) {
    const agent = BUILTIN_AGENTS.find((a) => a.id === id);
    assert.ok(agent, `expected built-in ${id}`);
    assert.equal(agent.installationDocumentationUrl, url, id);
  }
});

test('built-ins never define installer commands or automatic installation', () => {
  for (const agent of BUILTIN_AGENTS) {
    assert.equal(Object.hasOwn(agent, 'installCommand'), false, agent.id);
    assert.equal(Object.hasOwn(agent, 'autoInstall'), false, agent.id);
    assert.doesNotMatch(JSON.stringify(agent), /npm\s+install|curl\b|\birm\b|\biex\b|ExecutionPolicy/i, agent.id);
  }
});

test('missing CLI guidance opens only its official documentation when available', () => {
  const guidance = getMissingAgentGuidance({
    id: 'codex',
    label: 'Codex CLI',
    command: 'codex',
    installationDocumentationUrl: 'https://developers.openai.com/codex/cli/',
  });

  assert.match(guidance.message, /not found/i);
  assert.equal(guidance.documentationUrl, 'https://developers.openai.com/codex/cli/');
});

test('missing CLI guidance offers no installation action without verified documentation', () => {
  const guidance = getMissingAgentGuidance({ id: 'custom', label: 'Custom CLI', command: 'custom' });

  assert.match(guidance.message, /not found/i);
  assert.equal(guidance.documentationUrl, undefined);
});

test('Gemini CLI is no longer a built-in preset', () => {
  assert.equal(BUILTIN_AGENTS.find((a) => a.id === 'gemini'), undefined);
});

test("Antigravity inherits Gemini's icon without an automatic installer", () => {
  const agy = BUILTIN_AGENTS.find((a) => a.id === 'antigravity');
  assert.ok(agy);
  assert.equal(agy.icon, 'star-full');
  assert.equal(agy.installationDocumentationUrl, undefined);
});

test('Grok has no unverified installation documentation link', () => {
  const grok = BUILTIN_AGENTS.find((a) => a.id === 'grok');
  assert.equal(grok.installationDocumentationUrl, undefined);
});

test('Cursor, Droid, Crush, Hermes, and MiMo Code ship as built-in presets', () => {
  const byId = Object.fromEntries(BUILTIN_AGENTS.map((a) => [a.id, a]));
  assert.equal(byId.cursor.command, 'cursor-agent');
  assert.equal(byId.droid.command, 'droid');
  assert.equal(byId.mimo.installationDocumentationUrl, undefined);
  assert.equal(byId.cursor.installationDocumentationUrl, 'https://cursor.com/docs/cli/overview');
  assert.equal(byId.hermes.installationDocumentationUrl, 'https://hermes-agent.nousresearch.com/docs/getting-started/installation');
});

test('Pi ships as a built-in preset', () => {
  const pi = BUILTIN_AGENTS.find((a) => a.id === 'pi');
  assert.ok(pi);
  assert.equal(pi.command, 'pi');
  assert.equal(pi.installationDocumentationUrl, 'https://pi.dev/docs/latest');
});
