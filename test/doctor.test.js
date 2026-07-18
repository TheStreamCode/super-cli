const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDoctorReport,
  inspectAgent,
  inspectAgents,
  summarizeVersionOutput,
} = require('../out/doctor.js');

const agent = {
  id: 'example',
  label: 'Example CLI',
  command: 'example chat',
  versionCommand: 'example --version',
};

test('summarizeVersionOutput returns one compact ANSI-free line', () => {
  assert.equal(summarizeVersionOutput('\u001b[32mexample 1.2.3\u001b[0m\nsecond line'), 'example 1.2.3');
  assert.equal(summarizeVersionOutput(' \r\n '), undefined);
});

test('inspectAgent reports missing and trust-limited agents without executing commands', async () => {
  let calls = 0;
  const runner = async () => {
    calls += 1;
    return { exitCode: 0, output: '1.0.0', timedOut: false };
  };

  assert.deepEqual(await inspectAgent(agent, false, true, false, runner), {
    status: 'missing',
    detail: 'Executable not found on PATH.',
  });
  assert.equal((await inspectAgent(agent, true, false, false, runner)).status, 'version-unavailable');
  assert.equal(calls, 0);
});

test('inspectAgent classifies successful, empty, timed-out, and failed version checks', async () => {
  assert.deepEqual(
    await inspectAgent(agent, true, true, false, async () => ({
      exitCode: 0,
      output: 'example 1.2.3\n',
      timedOut: false,
    })),
    { status: 'ready', version: 'example 1.2.3' },
  );
  assert.equal((await inspectAgent(agent, true, true, false, async () => ({
    exitCode: 0,
    output: '',
    timedOut: false,
  }))).status, 'version-unavailable');
  assert.equal((await inspectAgent(agent, true, true, false, async () => ({
    exitCode: undefined,
    output: '',
    timedOut: true,
  }))).status, 'timed-out');
  assert.equal((await inspectAgent(agent, true, true, false, async () => ({
    exitCode: 2,
    output: 'configuration error',
    timedOut: false,
  }))).status, 'check-failed');
});

test('inspectAgents preserves order and limits version checks to three workers', async () => {
  const agents = Array.from({ length: 7 }, (_, index) => ({
    ...agent,
    id: `agent-${index}`,
    label: `Agent ${index}`,
  }));
  let active = 0;
  let maximumActive = 0;
  const results = await inspectAgents(agents, () => true, true, false, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return { exitCode: 0, output: '1.0.0', timedOut: false };
  });

  assert.deepEqual([...results.keys()], agents.map(({ id }) => id));
  assert.ok(maximumActive <= 3);
});

test('doctor report contains useful state without commands, raw output, or environment data', () => {
  const results = new Map([['example', { status: 'ready', version: 'example 1.2.3' }]]);
  const report = buildDoctorReport([
    { ...agent, command: 'example chat --api-key DOCTOR_SECRET_SENTINEL' },
  ], results, 'Windows', false, true);

  assert.match(report, /Super CLI Agent Doctor/);
  assert.match(report, /Example CLI \| Ready \| example 1\.2\.3/);
  assert.match(report, /Update availability is not checked/);
  assert.doesNotMatch(report, /PATH=/);
  assert.doesNotMatch(report, /Launch command/);
  assert.doesNotMatch(report, /DOCTOR_SECRET_SENTINEL/);
});
