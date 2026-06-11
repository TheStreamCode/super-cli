/** A command used to install a CLI: a cross-platform string, or per-OS variants. */
export type InstallCommand = string | { unix?: string; windows?: string };

/** Ensures a JSON config file contains certain keys before the agent launches. */
export interface EnsureConfig {
  file: string;
  defaults: Record<string, unknown>;
}

/** A coding agent CLI that the launcher can start. */
export interface Agent {
  id: string;
  label: string;
  command: string;
  icon?: string;
  installCommand?: InstallCommand;
  autoInstall?: boolean;
  ensureConfig?: EnsureConfig;
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
    id: 'grok',
    label: 'Grok CLI',
    command: 'grok',
    icon: 'zap',
    // xAI ships a standalone binary via an official shell installer (no npm package).
    installCommand: { unix: 'curl -fsSL https://x.ai/cli/install.sh | bash' },
    autoInstall: true,
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
    // Inherits the icon of the retired Gemini CLI, which Antigravity replaces.
    icon: 'star-full',
    // Google ships a standalone Go binary via official OS-specific installers (no npm package).
    installCommand: {
      unix: 'curl -fsSL https://antigravity.google/cli/install.sh | bash',
      windows: 'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://antigravity.google/cli/install.ps1 | iex"',
    },
    autoInstall: true,
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    icon: 'code',
    installCommand: 'npm install -g opencode-ai',
    autoInstall: true,
  },
  {
    id: 'command-code',
    label: 'Command Code',
    // Use the `command-code` alias, not `cmd`: on Windows `cmd` is intercepted as the Command Prompt.
    // `command-code` works on Windows, macOS, Linux, and WSL without that conflict.
    command: 'command-code',
    icon: 'terminal',
    installCommand: 'npm install -g command-code',
    autoInstall: true,
    // Super CLI is one extension for every CLI, so opt out of Command Code's companion
    // editor-extension auto-install using its own official config switch.
    ensureConfig: {
      file: '~/.commandcode/config.json',
      defaults: { autoInstallExtension: false },
    },
  },
  {
    id: 'cursor',
    label: 'Cursor CLI',
    command: 'cursor-agent',
    icon: 'edit',
    // Official shell installer (no npm package). On Windows it runs under WSL.
    installCommand: { unix: 'curl https://cursor.com/install -fsS | bash' },
    autoInstall: true,
  },
  {
    id: 'droid',
    label: 'Droid CLI',
    command: 'droid',
    icon: 'circuit-board',
    installCommand: 'npm install -g droid',
    autoInstall: true,
  },
  {
    id: 'crush',
    label: 'Crush',
    command: 'crush',
    icon: 'flame',
    installCommand: 'npm install -g @charmland/crush',
    autoInstall: true,
  },
  {
    id: 'hermes',
    label: 'Hermes',
    command: 'hermes',
    icon: 'send',
    // Official shell installer (no npm package).
    installCommand: { unix: 'curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash' },
    autoInstall: true,
  },
  {
    id: 'mimo',
    label: 'MiMo Code',
    command: 'mimo',
    icon: 'beaker',
    installCommand: 'npm install -g @mimo-ai/cli',
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

/** Resolves the install command for a platform: strings are cross-platform, objects select unix/windows. */
export function resolveInstallCommand(
  installCommand: InstallCommand | undefined,
  platform: string,
): string | undefined {
  if (!installCommand) {
    return undefined;
  }

  if (typeof installCommand === 'string') {
    return installCommand;
  }

  return platform === 'win32' ? installCommand.windows : installCommand.unix;
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
