const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BUILTIN_AGENTS,
  filterHiddenBuiltins,
  getMissingAgentGuidance,
  resolveCommandAgentArgument,
  resolveAgentCommands,
  resolveAgents,
  resolveCommandPlatform,
} = require('../out/agents.js');

const SUPPORTED_PLATFORMS = ['windows', 'macos', 'linux'];

function resolveBuiltin(id, platform = 'linux') {
  const definition = BUILTIN_AGENTS.find((agent) => agent.id === id);
  assert.ok(definition, `expected built-in ${id}`);
  return resolveAgentCommands(definition, platform);
}

test('resolveCommandAgentArgument accepts direct agents and tree item nodes', () => {
  const agent = { id: 'example', label: 'Example CLI', command: 'example' };

  assert.equal(resolveCommandAgentArgument(agent), agent);
  assert.equal(resolveCommandAgentArgument({ kind: 'agent', agent }), agent);
  assert.equal(resolveCommandAgentArgument({ kind: 'group', agents: [agent] }), undefined);
  assert.equal(resolveCommandAgentArgument({ kind: 'agent', agent: { id: 'broken' } }), undefined);
  assert.equal(resolveCommandAgentArgument(undefined), undefined);
});

test('resolveAgents returns the built-ins when no user agents are configured', () => {
  const agents = resolveAgents(BUILTIN_AGENTS, undefined, true);
  assert.equal(agents.length, BUILTIN_AGENTS.length);
  assert.ok(agents.some((agent) => agent.id === 'claude'));
});

test('resolveAgents omits the built-ins when disabled', () => {
  const agents = resolveAgents(BUILTIN_AGENTS, [], false);
  assert.deepEqual(agents, []);
});

test('filterHiddenBuiltins hides only selected built-in identities', () => {
  const visibleBuiltins = filterHiddenBuiltins(BUILTIN_AGENTS, ['kiro', 'openclaw', 'mine']);
  const visible = resolveAgents(visibleBuiltins, [{ id: 'mine', label: 'Mine', command: 'mine' }], true);

  assert.equal(visible.some((agent) => agent.id === 'kiro'), false);
  assert.equal(visible.some((agent) => agent.id === 'openclaw'), false);
  assert.equal(visible.some((agent) => agent.id === 'mine'), true);
});

test('hidden built-ins do not hide user overrides with the same id', () => {
  const visibleBuiltins = filterHiddenBuiltins(BUILTIN_AGENTS, ['codex']);
  const agents = resolveAgents(
    visibleBuiltins,
    [{ id: 'codex', label: 'Private Codex Wrapper', command: 'private-codex' }],
    true,
  );

  assert.equal(agents.find((agent) => agent.id === 'codex').command, 'private-codex');
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

test('resolveAgents accepts complete platform-specific user commands', () => {
  const command = { windows: 'agent.exe', macos: 'agent-macos', linux: 'agent-linux' };
  const agents = resolveAgents([], [{ id: 'adaptive', label: 'Adaptive', command }], false);

  assert.deepEqual(agents, [{ id: 'adaptive', label: 'Adaptive', command }]);
});

test('resolveAgents rejects incomplete platform-specific user commands', () => {
  const agents = resolveAgents([], [{
    id: 'incomplete',
    label: 'Incomplete',
    command: { windows: 'agent.exe', linux: 'agent-linux' },
  }], false);

  assert.deepEqual(agents, []);
});

test('resolveAgents ignores legacy non-string documentation and command values', () => {
  const agents = resolveAgents([], [{
    id: 'legacy',
    label: 'Legacy',
    command: 'legacy',
    installationDocumentationUrl: { unix: 'not-a-url' },
    updateCommand: { unix: 'legacy update' },
    versionCommand: { unix: 'legacy version' },
  }], false);

  assert.equal(agents[0].installationDocumentationUrl, undefined);
  assert.equal(agents[0].updateCommand, undefined);
  assert.equal(agents[0].versionCommand, undefined);
});

test('resolveAgents sanitizes malformed optional user fields without throwing', () => {
  const agents = resolveAgents([], [{
    id: 'malformed',
    label: 42,
    command: 'malformed',
    icon: 42,
    iconPath: { light: 'light.svg' },
    env: { VALID: 'yes', INVALID: 42 },
  }], false);

  assert.deepEqual(agents, [{
    id: 'malformed',
    label: 'malformed',
    command: 'malformed',
    env: { VALID: 'yes' },
  }]);
});

test('OpenCode ships as a built-in preset', () => {
  const opencode = resolveBuiltin('opencode');
  assert.equal(opencode.command, 'opencode');
  assert.equal(opencode.installationDocumentationUrl, 'https://opencode.ai/docs/');
});

test('runtime platforms map Windows, macOS, Linux, and WSL to the correct command variant', () => {
  assert.equal(resolveCommandPlatform('win32', false), 'windows');
  assert.equal(resolveCommandPlatform('win32', true), 'linux');
  assert.equal(resolveCommandPlatform('darwin', false), 'macos');
  assert.equal(resolveCommandPlatform('linux', false), 'linux');
});

test('all built-ins resolve non-empty launch commands on Windows, macOS, and Linux', () => {
  for (const definition of BUILTIN_AGENTS) {
    for (const platform of SUPPORTED_PLATFORMS) {
      const agent = resolveAgentCommands(definition, platform);
      assert.equal(typeof agent.command, 'string', `${definition.id}:${platform}`);
      assert.notEqual(agent.command.trim(), '', `${definition.id}:${platform}`);
    }
  }
});

test('agents with a known update command carry their official one', () => {
  const expected = {
    claude: 'claude update',
    codex: 'codex update',
    copilot: 'copilot update',
    kilo: 'kilo upgrade',
    openclaw: 'openclaw update',
    hermes: 'hermes update',
    opencode: 'opencode upgrade',
    cursor: 'cursor-agent update',
    droid: 'droid update',
    pi: 'pi update',
    kimi: 'kimi upgrade',
    qoder: 'qodercli update',
  };
  for (const [id, cmd] of Object.entries(expected)) {
    for (const platform of SUPPORTED_PLATFORMS) {
      const agent = resolveBuiltin(id, platform);
      assert.equal(agent.updateCommand, cmd, `${id}:${platform}`);
    }
  }
});

test('self-updating CLIs have no manual update command', () => {
  for (const id of ['kiro', 'mimo', 'command-code']) {
    const agent = BUILTIN_AGENTS.find((a) => a.id === id);
    assert.equal(agent.updateCommand, undefined, id);
  }
});

test('Claude Code skips its IDE extension auto-install via env', () => {
  const claude = BUILTIN_AGENTS.find((a) => a.id === 'claude');
  assert.equal(claude.env.CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL, '1');
});

test('Command Code launches without modifying its configuration', () => {
  const cc = resolveBuiltin('command-code', 'windows');
  assert.equal(cc.command, 'command-code');
  assert.equal(Object.hasOwn(cc, 'ensureConfig'), false);
});

test('built-ins expose only verified official installation documentation', () => {
  const documentationUrls = {
    claude: 'https://code.claude.com/docs/en/setup',
    codex: 'https://developers.openai.com/codex/cli/',
    copilot: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/install-copilot-cli',
    kilo: 'https://kilo.ai/docs/cli',
    kiro: 'https://kiro.dev/docs/cli/',
    openclaw: 'https://docs.openclaw.ai/install',
    opencode: 'https://opencode.ai/docs/',
    cursor: 'https://cursor.com/docs/cli/overview',
    droid: 'https://docs.factory.ai/cli/getting-started',
    crush: 'https://github.com/charmbracelet/crush',
    hermes: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
    pi: 'https://pi.dev/docs/latest',
    kimi: 'https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html',
    qoder: 'https://docs.qoder.com/en/cli/',
    grok: 'https://docs.x.ai/build/overview',
    antigravity: 'https://antigravity.google/docs/cli/install',
    'command-code': 'https://commandcode.ai/docs',
    mimo: 'https://mimo.xiaomi.com/mimocode/install',
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

test('Antigravity ships a dedicated icon without an automatic installer', () => {
  const agy = BUILTIN_AGENTS.find((a) => a.id === 'antigravity');
  assert.ok(agy);
  assert.equal(agy.icon, 'star-full');
  assert.equal(agy.installationDocumentationUrl, 'https://antigravity.google/docs/cli/install');
});

test('Grok links to its official installation documentation', () => {
  const grok = BUILTIN_AGENTS.find((a) => a.id === 'grok');
  assert.equal(grok.installationDocumentationUrl, 'https://docs.x.ai/build/overview');
});

test('Cursor, Droid, Crush, Hermes, and MiMo Code ship as built-in presets', () => {
  const byId = Object.fromEntries(BUILTIN_AGENTS.map((definition) => {
    const agent = resolveAgentCommands(definition, 'linux');
    return [agent.id, agent];
  }));
  assert.equal(byId.cursor.command, 'cursor-agent');
  assert.equal(byId.droid.command, 'droid');
  assert.equal(byId.mimo.installationDocumentationUrl, 'https://mimo.xiaomi.com/mimocode/install');
  assert.equal(byId['command-code'].installationDocumentationUrl, 'https://commandcode.ai/docs');
  assert.equal(byId.cursor.installationDocumentationUrl, 'https://cursor.com/docs/cli/overview');
  assert.equal(byId.hermes.installationDocumentationUrl, 'https://hermes-agent.nousresearch.com/docs/getting-started/installation');
});

test('Pi ships as a built-in preset', () => {
  const pi = resolveBuiltin('pi');
  assert.equal(pi.command, 'pi');
  assert.equal(pi.installationDocumentationUrl, 'https://pi.dev/docs/latest');
});

test('Kimi Code CLI ships as a built-in preset', () => {
  const kimi = resolveBuiltin('kimi');
  assert.equal(kimi.label, 'Kimi Code CLI');
  assert.equal(kimi.command, 'kimi');
  assert.equal(kimi.icon, 'comment-discussion');
  assert.equal(
    kimi.installationDocumentationUrl,
    'https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html',
  );
  assert.equal(kimi.updateCommand, 'kimi upgrade');
});

test('Qoder CLI ships as a built-in preset', () => {
  for (const platform of SUPPORTED_PLATFORMS) {
    const qoder = resolveBuiltin('qoder', platform);
    assert.equal(qoder.label, 'Qoder CLI', `${platform}:label`);
    assert.equal(qoder.command, 'qodercli', `${platform}:command`);
    assert.equal(qoder.icon, 'lightbulb', `${platform}:icon`);
    assert.equal(qoder.updateCommand, 'qodercli update', `${platform}:updateCommand`);
    assert.equal(qoder.versionCommand, 'qodercli --version', `${platform}:versionCommand`);
    assert.equal(
      qoder.installationDocumentationUrl,
      'https://docs.qoder.com/en/cli/',
      `${platform}:installationDocumentationUrl`,
    );
  }

  const qoder = BUILTIN_AGENTS.find((a) => a.id === 'qoder');
  assert.equal(typeof qoder.iconPath, 'object');
  assert.equal(qoder.iconPath.light, 'media/agents/qoder-light.svg');
  assert.equal(qoder.iconPath.dark, 'media/agents/qoder-dark.svg');
});

test('Kiro and OpenClaw ship as adaptive built-in presets', () => {
  for (const platform of SUPPORTED_PLATFORMS) {
    const kiro = resolveBuiltin('kiro', platform);
    assert.equal(kiro.command, 'kiro-cli');
    assert.equal(kiro.versionCommand, 'kiro-cli --version');

    const openclaw = resolveBuiltin('openclaw', platform);
    assert.equal(openclaw.command, 'openclaw chat');
    assert.equal(openclaw.versionCommand, 'openclaw --version');
    assert.equal(openclaw.updateCommand, 'openclaw update');
  }
});
