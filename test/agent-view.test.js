const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAgentGroups,
  formatSessionElapsed,
  retainAvailableFavoriteIds,
  resolveMigratedFavorites,
  shouldOfferFavoriteAfterLaunch,
  shouldOfferRatingAfterLaunch,
  RATING_PROMPT_LAUNCH_THRESHOLD,
} = require('../out/agent-view.js');

const agents = [
  { id: 'charlie', label: 'Charlie', command: 'charlie' },
  { id: 'alpha', label: 'Alpha', command: 'alpha' },
  { id: 'bravo', label: 'Bravo', command: 'bravo' },
];
const statuses = new Map([
  ['alpha', true],
  ['bravo', false],
]);
const getStatus = (id) => statuses.get(id);

test('buildAgentGroups separates ready, unknown, and setup-required agents', () => {
  const groups = buildAgentGroups(agents, [], getStatus);

  assert.deepEqual(groups.map((group) => group.id), ['ready', 'unknown', 'setup']);
  assert.deepEqual(groups.map((group) => group.agents[0].id), ['alpha', 'charlie', 'bravo']);
});

test('buildAgentGroups sorts agents alphabetically within each status group', () => {
  const groups = buildAgentGroups(agents, [], (id) => id === 'bravo' ? false : true);

  assert.deepEqual(groups.find((group) => group.id === 'ready').agents.map((agent) => agent.id), ['alpha', 'charlie']);
});

test('buildAgentGroups promotes a single favorite into its own leading group without duplicating it', () => {
  const groups = buildAgentGroups(agents, ['charlie'], () => true);

  assert.equal(groups[0].id, 'favorite');
  assert.deepEqual(groups[0].agents.map((agent) => agent.id), ['charlie']);
  assert.deepEqual(groups.flatMap((group) => group.agents.map((agent) => agent.id)), ['charlie', 'alpha', 'bravo']);
});

test('buildAgentGroups promotes multiple favorites, alphabetized, without duplicating them', () => {
  const groups = buildAgentGroups(agents, ['charlie', 'alpha'], () => true);

  assert.equal(groups[0].id, 'favorite');
  assert.deepEqual(groups[0].agents.map((agent) => agent.id), ['alpha', 'charlie']);
  assert.deepEqual(
    groups.flatMap((group) => group.agents.map((agent) => agent.id)).sort(),
    ['alpha', 'bravo', 'charlie'],
  );
});

test('buildAgentGroups omits the favorite group entirely when there are no favorites', () => {
  const groups = buildAgentGroups(agents, [], () => true);

  assert.equal(groups.some((group) => group.id === 'favorite'), false);
});

// The quick pick renders these same groups as separators (see buildQuickPickItems in extension.ts),
// so every agent must appear exactly once across the whole result — a duplicate would show up twice
// in the picker, and a dropped agent would be unlaunchable from it.
test('buildAgentGroups partitions agents exactly once each, favorites first', () => {
  const groups = buildAgentGroups(agents, ['bravo'], () => true);
  const flattened = groups.flatMap((group) => group.agents.map((agent) => agent.id));

  assert.equal(groups[0].id, 'favorite');
  assert.deepEqual(groups[0].agents.map((agent) => agent.id), ['bravo']);
  assert.deepEqual(groups[1].agents.map((agent) => agent.id), ['alpha', 'charlie']);
  assert.deepEqual([...flattened].sort(), ['alpha', 'bravo', 'charlie']);
  assert.equal(new Set(flattened).size, flattened.length);
});

test('buildAgentGroups labels each group for both the tree and the quick pick', () => {
  const groups = buildAgentGroups(agents, ['alpha'], getStatus);

  assert.deepEqual(
    groups.map((group) => [group.id, group.label]),
    [['favorite', 'Favorites'], ['unknown', 'Agents'], ['setup', 'Setup required']],
  );
});

test('favorite prompt is offered only after a successful launch, for an agent not already favorited', () => {
  assert.equal(shouldOfferFavoriteAfterLaunch(true, true, 'codex', []), true);
  assert.equal(shouldOfferFavoriteAfterLaunch(true, false, 'codex', []), false);
  assert.equal(shouldOfferFavoriteAfterLaunch(false, true, 'codex', []), false);
  assert.equal(shouldOfferFavoriteAfterLaunch(true, true, 'codex', ['codex']), false);
  assert.equal(shouldOfferFavoriteAfterLaunch(true, true, 'codex', ['claude', 'codex']), false);
  assert.equal(shouldOfferFavoriteAfterLaunch(true, true, 'codex', ['claude']), true);
});

test('resolveMigratedFavorites seeds the array from a legacy single favorite', () => {
  assert.deepEqual(resolveMigratedFavorites('claude', undefined), ['claude']);
  assert.deepEqual(resolveMigratedFavorites('claude', []), ['claude']);
});

test('resolveMigratedFavorites does nothing without a legacy value, or once favorites already exist', () => {
  assert.equal(resolveMigratedFavorites(undefined, undefined), undefined);
  assert.equal(resolveMigratedFavorites('', undefined), undefined);
  assert.equal(resolveMigratedFavorites('claude', ['codex']), undefined);
});

test('retainAvailableFavoriteIds removes only agents that no longer resolve', () => {
  assert.deepEqual(
    retainAvailableFavoriteIds(['claude', 'custom', 'codex'], ['custom', 'codex']),
    ['custom', 'codex'],
  );
  assert.deepEqual(retainAvailableFavoriteIds(['custom'], ['custom']), ['custom']);
});

test('rating prompt is offered exactly once, only once the launch threshold is reached', () => {
  assert.equal(shouldOfferRatingAfterLaunch(RATING_PROMPT_LAUNCH_THRESHOLD - 1, false), false);
  assert.equal(shouldOfferRatingAfterLaunch(RATING_PROMPT_LAUNCH_THRESHOLD, false), true);
  assert.equal(shouldOfferRatingAfterLaunch(RATING_PROMPT_LAUNCH_THRESHOLD + 100, false), true);
  assert.equal(shouldOfferRatingAfterLaunch(RATING_PROMPT_LAUNCH_THRESHOLD, true), false);
});

test('formatSessionElapsed renders a compact duration', () => {
  const startedAt = 1_000_000;

  assert.equal(formatSessionElapsed(startedAt, startedAt), '<1m');
  assert.equal(formatSessionElapsed(startedAt, startedAt + 45_000), '<1m');
  assert.equal(formatSessionElapsed(startedAt, startedAt + 59_999), '<1m');
  assert.equal(formatSessionElapsed(startedAt, startedAt + 60_000), '1m');
  assert.equal(formatSessionElapsed(startedAt, startedAt + 5 * 60_000), '5m');
  assert.equal(formatSessionElapsed(startedAt, startedAt + 60 * 60_000), '1h');
  assert.equal(formatSessionElapsed(startedAt, startedAt + 72 * 60_000), '1h 12m');
});

test('formatSessionElapsed never goes negative for clock skew', () => {
  const startedAt = 1_000_000;

  assert.equal(formatSessionElapsed(startedAt, startedAt - 5_000), '<1m');
});
