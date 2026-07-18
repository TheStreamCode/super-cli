import { exec, execFile } from 'node:child_process';
import * as os from 'node:os';
import type { Agent } from './agents.js';
import { appendBoundedText, shouldPromptToInstall } from './command-utils.js';

const MAX_DOCTOR_OUTPUT = 4 * 1024;
const VERSION_TIMEOUT_MS = 5000;
const VERSION_CONCURRENCY = 3;

export type DoctorStatus = 'ready' | 'missing' | 'version-unavailable' | 'timed-out' | 'check-failed';

export interface DoctorResult {
  status: DoctorStatus;
  version?: string;
  detail?: string;
}

export interface VersionCommandResult {
  exitCode: number | undefined;
  output: string;
  timedOut: boolean;
}

export type VersionCommandRunner = (command: string, useWsl: boolean) => Promise<VersionCommandResult>;

type ExecutionError = Error & {
  code?: string | number | null;
  killed?: boolean;
};

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

/** Returns a compact first meaningful output line suitable for the sidebar and report. */
export function summarizeVersionOutput(output: string): string | undefined {
  const line = stripAnsi(output)
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find(Boolean);

  return line ? line.slice(0, 160) : undefined;
}

/** Executes a user-owned, explicit version command with bounded resources. */
export function runVersionCommand(command: string, useWsl: boolean): Promise<VersionCommandResult> {
  return new Promise((resolve) => {
    const options = {
      cwd: os.tmpdir(),
      timeout: VERSION_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: MAX_DOCTOR_OUTPUT,
      encoding: 'utf8' as const,
    };
    const callback = (error: ExecutionError | null, stdout: string, stderr: string): void => {
      let output = '';
      output = appendBoundedText(output, stdout, MAX_DOCTOR_OUTPUT);
      output = appendBoundedText(output, stderr, MAX_DOCTOR_OUTPUT);
      const timedOut = Boolean(error && (error.killed || error.code === 'ETIMEDOUT'));
      const numericCode = typeof error?.code === 'number' ? error.code : undefined;

      resolve({ exitCode: error ? numericCode : 0, output, timedOut });
    };

    if (useWsl) {
      execFile('wsl.exe', ['sh', '-lc', command], options, callback);
      return;
    }

    exec(command, options, callback);
  });
}

/** Inspects one configured agent without performing network-based update checks. */
export async function inspectAgent(
  agent: Agent,
  installed: boolean | undefined,
  workspaceTrusted: boolean,
  useWsl: boolean,
  runner: VersionCommandRunner = runVersionCommand,
): Promise<DoctorResult> {
  if (installed === false) {
    return { status: 'missing', detail: 'Executable not found on PATH.' };
  }

  if (!workspaceTrusted) {
    return {
      status: 'version-unavailable',
      detail: 'Version check skipped until the workspace is trusted.',
    };
  }

  if (!agent.versionCommand) {
    return { status: 'version-unavailable', detail: 'No verified version command is configured.' };
  }

  const result = await runner(agent.versionCommand, useWsl);
  if (result.timedOut) {
    return { status: 'timed-out', detail: 'Version command exceeded 5 seconds.' };
  }

  if (result.exitCode !== 0) {
    if (shouldPromptToInstall(agent.command, result.exitCode, result.output)) {
      return { status: 'missing', detail: 'Executable was not found by the active terminal environment.' };
    }
    return {
      status: 'check-failed',
      detail: summarizeVersionOutput(result.output) ?? 'Version command failed.',
    };
  }

  const version = summarizeVersionOutput(result.output);
  return version
    ? { status: 'ready', version }
    : { status: 'version-unavailable', detail: 'Version command returned no readable output.' };
}

/** Runs bounded-concurrency checks in the same stable order as the configured agents. */
export async function inspectAgents(
  agents: readonly Agent[],
  getInstalled: (id: string) => boolean | undefined,
  workspaceTrusted: boolean,
  useWsl: boolean,
  runner: VersionCommandRunner = runVersionCommand,
): Promise<Map<string, DoctorResult>> {
  const results = new Map<string, DoctorResult>();
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < agents.length) {
      const agent = agents[nextIndex++];
      results.set(
        agent.id,
        await inspectAgent(agent, getInstalled(agent.id), workspaceTrusted, useWsl, runner),
      );
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(VERSION_CONCURRENCY, agents.length) }, () => worker()),
  );

  return new Map(agents.flatMap((agent) => {
    const result = results.get(agent.id);
    return result ? [[agent.id, result] as const] : [];
  }));
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/** Builds a local diagnostic report without environment values, credentials, or captured logs. */
export function buildDoctorReport(
  agents: readonly Agent[],
  results: ReadonlyMap<string, DoctorResult>,
  platformLabel: string,
  useWsl: boolean,
  workspaceTrusted: boolean,
): string {
  const labels: Record<DoctorStatus, string> = {
    ready: 'Ready',
    missing: 'Missing',
    'version-unavailable': 'Version unavailable',
    'timed-out': 'Timed out',
    'check-failed': 'Check failed',
  };
  const rows = agents.map((agent) => {
    const result = results.get(agent.id) ?? { status: 'version-unavailable' as const };
    return `| ${escapeMarkdownCell(agent.label)} | ${labels[result.status]} | ${escapeMarkdownCell(result.version ?? '—')} |`;
  });

  return [
    '# Super CLI Agent Doctor',
    '',
    `- Platform: ${platformLabel}`,
    `- WSL command environment: ${useWsl ? 'yes' : 'no'}`,
    `- Workspace trusted: ${workspaceTrusted ? 'yes' : 'no'}`,
    '- Update availability is not checked over the network.',
    '',
    '| Agent | Status | Version |',
    '| --- | --- | --- |',
    ...rows,
    '',
    'This report excludes environment variables, PATH contents, launch commands, and raw diagnostic output.',
    '',
  ].join('\n');
}
