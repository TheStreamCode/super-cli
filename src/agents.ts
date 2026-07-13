/** A coding agent CLI that the launcher can start. */
export interface Agent {
  id: string;
  label: string;
  command: string;
  icon?: string;
  installationDocumentationUrl?: string;
  env?: Record<string, string>;
  updateCommand?: string;
}

/** Built-in agent presets shipped with the extension. Users override them by reusing an id. */
export const BUILTIN_AGENTS: readonly Agent[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    command: 'claude',
    icon: 'sparkle',
    installationDocumentationUrl: 'https://code.claude.com/docs/en/setup',
    updateCommand: 'claude update',
    // Super CLI is one extension for every CLI, so skip Claude Code's IDE extension
    // auto-install using its own official environment variable.
    env: { CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL: '1' },
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    command: 'codex',
    icon: 'rocket',
    installationDocumentationUrl: 'https://developers.openai.com/codex/cli/',
    updateCommand: 'codex update',
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    command: 'copilot',
    icon: 'github',
    installationDocumentationUrl: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/install-copilot-cli',
    updateCommand: 'copilot update',
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
    installationDocumentationUrl: 'https://kilo.ai/docs/cli',
    updateCommand: 'kilo upgrade',
  },
  {
    id: 'antigravity',
    label: 'Antigravity CLI',
    command: 'agy',
    // Inherits the icon of the retired Gemini CLI, which Antigravity replaces.
    icon: 'star-full',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    icon: 'code',
    installationDocumentationUrl: 'https://opencode.ai/docs/',
    updateCommand: 'opencode upgrade',
  },
  {
    id: 'command-code',
    label: 'Command Code',
    // Use the `command-code` alias, not `cmd`: on Windows `cmd` is intercepted as the Command Prompt.
    // `command-code` works on Windows, macOS, Linux, and WSL without that conflict.
    command: 'command-code',
    icon: 'terminal',
  },
  {
    id: 'cursor',
    label: 'Cursor CLI',
    command: 'cursor-agent',
    icon: 'edit',
    installationDocumentationUrl: 'https://cursor.com/docs/cli/overview',
    updateCommand: 'cursor-agent update',
  },
  {
    id: 'droid',
    label: 'Droid CLI',
    command: 'droid',
    icon: 'circuit-board',
    installationDocumentationUrl: 'https://docs.factory.ai/cli/getting-started',
    updateCommand: 'droid update',
  },
  {
    id: 'crush',
    label: 'Crush',
    command: 'crush',
    icon: 'flame',
    installationDocumentationUrl: 'https://github.com/charmbracelet/crush',
  },
  {
    id: 'hermes',
    label: 'Hermes',
    command: 'hermes',
    icon: 'send',
    installationDocumentationUrl: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
    updateCommand: 'hermes update',
  },
  {
    id: 'mimo',
    label: 'MiMo Code',
    command: 'mimo',
    icon: 'beaker',
  },
  {
    id: 'pi',
    label: 'Pi',
    command: 'pi',
    icon: 'pulse',
    installationDocumentationUrl: 'https://pi.dev/docs/latest',
    // Pi exposes an official self-update command (`pi update` updates pi only).
    updateCommand: 'pi update',
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

/** Describes the safe missing-command prompt and its optional verified documentation link. */
export function getMissingAgentGuidance(agent: Agent): { message: string; documentationUrl?: string } {
  if (agent.installationDocumentationUrl) {
    return {
      message: `${agent.label} was not found. Open its official installation documentation?`,
      documentationUrl: agent.installationDocumentationUrl,
    };
  }

  return { message: `${agent.label} was not found. Check its command in settings.` };
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
      if (typeof merged.installationDocumentationUrl !== 'string') {
        delete merged.installationDocumentationUrl;
      }
      if (typeof merged.updateCommand !== 'string') {
        delete merged.updateCommand;
      }
      byId.set(candidate.id, merged);
    }
  }

  return [...byId.values()];
}
