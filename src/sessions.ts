import * as vscode from 'vscode';
import type { Agent } from './agents.js';

/** A launched agent terminal that is currently running, tracked from launch to close. */
export interface AgentSession {
  readonly sessionId: string;
  readonly agent: Agent;
  readonly terminal: vscode.Terminal;
  readonly startedAt: number;
  /** The cwd the terminal was launched with, if any — reused as-is by a restart, skipping the picker. */
  readonly cwd: vscode.Uri | undefined;
  /**
   * True when this session was recovered from a terminal that outlived a window reload rather than
   * started by us. Its real start time is unknowable, so `startedAt` records the adoption instead and
   * the sidebar labels it as reconnected rather than reporting a duration that would be a fiction.
   */
  readonly adopted: boolean;
}

function isAgentSession(value: unknown): value is AgentSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AgentSession>;
  return typeof candidate.sessionId === 'string' && Boolean(candidate.agent) && Boolean(candidate.terminal);
}

/** Accepts both direct session arguments and session nodes supplied by VS Code tree item menus. */
export function resolveCommandSessionArgument(argument: unknown): AgentSession | undefined {
  if (isAgentSession(argument)) {
    return argument;
  }

  if (!argument || typeof argument !== 'object') {
    return undefined;
  }

  const node = argument as { kind?: unknown; session?: unknown };
  return node.kind === 'session' && isAgentSession(node.session) ? node.session : undefined;
}

/** Resolves a command argument to a session currently owned by this extension host. */
export function resolveTrackedCommandSessionArgument(
  argument: unknown,
  trackedSessions: readonly AgentSession[],
): AgentSession | undefined {
  const candidate = resolveCommandSessionArgument(argument);
  return candidate
    ? trackedSessions.find(
      (session) => session.sessionId === candidate.sessionId || session.terminal === candidate.terminal,
    )
    : undefined;
}

const TICK_INTERVAL_MS = 30_000;

/**
 * Tracks agent CLI terminals from launch to close, purely by terminal lifecycle — it never reads
 * terminal content. A session ends when its terminal closes, or earlier, when the launched CLI
 * command itself exits and control returns to a bare shell prompt in the same terminal.
 */
export class AgentSessionRegistry implements vscode.Disposable {
  private readonly sessions = new Map<string, AgentSession>();
  private nextSessionId = 1;
  private tickHandle: ReturnType<typeof setInterval> | undefined;
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly closeListener: vscode.Disposable;

  readonly onDidChange = this.changeEmitter.event;

  constructor() {
    this.closeListener = vscode.window.onDidCloseTerminal((terminal) => this.endByTerminal(terminal));
  }

  /**
   * Registers a newly launched agent terminal as a running session, superseding any adopted session
   * for the same terminal. That can happen because `onDidOpenTerminal` also fires for our own
   * launches: whichever order the adoption sweep and this call land in, the launch wins — it knows the
   * real start time and cwd — and the terminal never ends up with two rows.
   */
  start(agent: Agent, terminal: vscode.Terminal, cwd: vscode.Uri | undefined): AgentSession {
    const existing = this.findByTerminal(terminal);
    if (existing) {
      this.sessions.delete(existing.sessionId);
    }

    return this.register(agent, terminal, cwd, false);
  }

  /**
   * Takes over a terminal that already exists — one VS Code reconnected after a window reload, whose
   * session was lost when the extension host restarted. Returns undefined if that terminal is already
   * tracked, so repeated adoption sweeps can't produce duplicate rows.
   *
   * An adopted session has no shell-integration listener attached: the command was started by a
   * previous extension host and its execution can no longer be observed, so unlike a launched session
   * this one ends only when its terminal closes, not when the CLI itself exits.
   */
  adopt(agent: Agent, terminal: vscode.Terminal, cwd: vscode.Uri | undefined): AgentSession | undefined {
    if (this.findByTerminal(terminal)) {
      return undefined;
    }

    return this.register(agent, terminal, cwd, true);
  }

  private register(
    agent: Agent,
    terminal: vscode.Terminal,
    cwd: vscode.Uri | undefined,
    adopted: boolean,
  ): AgentSession {
    const session: AgentSession = {
      sessionId: `session-${this.nextSessionId++}`,
      agent,
      terminal,
      startedAt: Date.now(),
      cwd,
      adopted,
    };

    this.sessions.set(session.sessionId, session);
    this.ensureTicking();
    this.changeEmitter.fire();
    return session;
  }

  /** Ends a session by id, e.g. once its launched CLI command exits. Safe to call more than once. */
  end(sessionId: string): void {
    if (!this.sessions.delete(sessionId)) {
      return;
    }

    this.stopTickingIfIdle();
    this.changeEmitter.fire();
  }

  /** Lists all currently running sessions, oldest first. */
  list(): AgentSession[] {
    return [...this.sessions.values()];
  }

  dispose(): void {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = undefined;
    }

    this.closeListener.dispose();
    this.changeEmitter.dispose();
  }

  private findByTerminal(terminal: vscode.Terminal): AgentSession | undefined {
    return [...this.sessions.values()].find((session) => session.terminal === terminal);
  }

  private endByTerminal(terminal: vscode.Terminal): void {
    const match = this.findByTerminal(terminal);
    if (match) {
      this.end(match.sessionId);
    }
  }

  // Ticks the tree refresh while at least one session is running, so displayed elapsed times stay
  // current; stops itself once the last session ends instead of running for the extension's lifetime.
  private ensureTicking(): void {
    if (this.tickHandle) {
      return;
    }

    this.tickHandle = setInterval(() => this.changeEmitter.fire(), TICK_INTERVAL_MS);
  }

  private stopTickingIfIdle(): void {
    if (this.sessions.size === 0 && this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = undefined;
    }
  }
}
