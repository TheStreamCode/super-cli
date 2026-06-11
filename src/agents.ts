/** A coding agent CLI that the launcher can start. */
export interface Agent {
  id: string;
  label: string;
  command: string;
  icon?: string;
  installCommand?: string;
  autoInstall?: boolean;
}

/** Built-in agent presets shipped with the extension. Users override them by reusing an id. */
export const BUILTIN_AGENTS: readonly Agent[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    icon: 'sparkle',
    installCommand: 'npm install -g @anthropic-ai/claude-code',
    autoInstall: true,
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    command: 'codex',
    icon: 'rocket',
    installCommand: 'npm install -g @openai/codex',
    autoInstall: true,
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    command: 'copilot',
    icon: 'github',
    installCommand: 'npm install -g @github/copilot',
    autoInstall: true,
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    command: 'gemini',
    icon: 'star-full',
    installCommand: 'npm install -g @google/gemini-cli',
    autoInstall: true,
  },
  {
    id: 'grok',
    label: 'Grok CLI',
    command: 'grok',
    icon: 'zap',
  },
  {
    id: 'kilo',
    label: 'Kilo CLI',
    command: 'kilo',
    icon: 'terminal',
    installCommand: 'npm install -g @kilocode/cli',
    autoInstall: true,
  },
  {
    id: 'antigravity',
    label: 'Antigravity CLI',
    command: 'agy',
    icon: 'globe',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    icon: 'code',
    installCommand: 'npm install -g opencode-ai',
    autoInstall: true,
  },
];

/** Returns true when a value is a usable agent definition (non-empty id and command). */
function isValidAgent(value: unknown): value is Agent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Agent>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.command === 'string' &&
    candidate.command.trim().length > 0
  );
}

/**
 * Merges built-in presets with user-defined agents.
 * User entries with a matching id override the built-in; new ids are appended.
 */
export function resolveAgents(
  builtins: readonly Agent[],
  userAgents: readonly Agent[] | undefined,
  useBuiltins: boolean,
): Agent[] {
  const byId = new Map<string, Agent>();

  if (useBuiltins) {
    for (const agent of builtins) {
      byId.set(agent.id, agent);
    }
  }

  if (Array.isArray(userAgents)) {
    for (const candidate of userAgents) {
      if (!isValidAgent(candidate)) {
        continue;
      }

      const existing = byId.get(candidate.id);
      const merged: Agent = { ...existing, ...candidate };
      merged.label = (merged.label ?? '').trim() || merged.id;
      byId.set(candidate.id, merged);
    }
  }

  return [...byId.values()];
}
