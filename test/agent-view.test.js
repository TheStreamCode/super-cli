const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAgentGroups,
  buildAgentSections,
  formatSessionElapsed,
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

test('buildAgentGroups excludes a single pinned favorite without duplicating it', () => {
  const groups = buildAgentGroups(agents, ['charlie'], () => true);

  assert.deepEqual(groups.flatMap((group) => group.agents.map((agent) => agent.id)), ['alpha', 'bravo']);
});

test('buildAgentGroups excludes multiple pinned favorites without duplicating them', () => {
  const groups = buildAgentGroups(agents, ['charlie', 'alpha'], () => true);

  assert.deepEqual(groups.flatMap((group) => group.agents.map((agent) => agent.id)), ['bravo']);
});

test('buildAgentSections promotes a single favorite and alphabetizes the remaining agents without duplicates', () => {
  const sections = buildAgentSections(agents, ['bravo'], () => true);
  const flattened = sections.flatMap((section) => section.agents.map((agent) => agent.id));

  assert.equal(sections[0].id, 'favorite');
  assert.deepEqual(sections[0].agents.map((agent) => agent.id), ['bravo']);
  assert.deepEqual(sections[1].agents.map((agent) => agent.id), ['alpha', 'charlie']);
  assert.deepEqual(flattened.sort(), ['alpha', 'bravo', 'charlie']);
});

test('buildAgentSections promotes multiple favorites, alphabetized, without duplicates', () => {
  const sections = buildAgentSections(agents, ['charlie', 'alpha'], () => true);

  assert.equal(sections[0].id, 'favorite');
  assert.deepEqual(sections[0].agents.map((agent) => agent.id), ['alpha', 'charlie']);
  assert.deepEqual(sections[1].agents.map((agent) => agent.id), ['bravo']);
});

test('buildAgentSections omits the favorite section when there are no favorites', () => {
  const sections = buildAgentSections(agents, [], () => true);

  assert.equal(sections.some((section) => section.id === 'favorite'), false);
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
