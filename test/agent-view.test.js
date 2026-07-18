const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAgentGroups, buildAgentSections } = require('../out/agent-view.js');

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
  const groups = buildAgentGroups(agents, '', getStatus);

  assert.deepEqual(groups.map((group) => group.id), ['ready', 'unknown', 'setup']);
  assert.deepEqual(groups.map((group) => group.agents[0].id), ['alpha', 'charlie', 'bravo']);
});

test('buildAgentGroups sorts agents alphabetically within each status group', () => {
  const groups = buildAgentGroups(agents, '', (id) => id === 'bravo' ? false : true);

  assert.deepEqual(groups.find((group) => group.id === 'ready').agents.map((agent) => agent.id), ['alpha', 'charlie']);
});

test('buildAgentGroups excludes the pinned favorite without duplicating it', () => {
  const groups = buildAgentGroups(agents, 'charlie', () => true);

  assert.deepEqual(groups.flatMap((group) => group.agents.map((agent) => agent.id)), ['alpha', 'bravo']);
});

test('buildAgentSections promotes the favorite and alphabetizes the remaining agents without duplicates', () => {
  const sections = buildAgentSections(agents, 'bravo', () => true);
  const flattened = sections.flatMap((section) => section.agents.map((agent) => agent.id));

  assert.equal(sections[0].id, 'favorite');
  assert.deepEqual(sections[0].agents.map((agent) => agent.id), ['bravo']);
  assert.deepEqual(sections[1].agents.map((agent) => agent.id), ['alpha', 'charlie']);
  assert.deepEqual(flattened.sort(), ['alpha', 'bravo', 'charlie']);
});
