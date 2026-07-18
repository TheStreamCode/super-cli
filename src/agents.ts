/** Operating systems supported by platform-specific agent commands. */
export type CommandPlatform = 'windows' | 'macos' | 'linux';

/** A command shared by every OS or explicitly defined for each supported OS. */
export type PlatformCommand = string | Record<CommandPlatform, string>;

/** A packaged icon shared across themes or a dedicated light/dark pair. */
export type AgentIconPath = string | { light: string; dark: string };

/** A configured coding agent before its platform-specific commands are resolved. */
export interface AgentDefinition {
  id: string;
  label: string;
  command: PlatformCommand;
  icon?: string;
  iconPath?: AgentIconPath;
  installationDocumentationUrl?: string;
  env?: Record<string, string>;
  updateCommand?: PlatformCommand;
  versionCommand?: PlatformCommand;
}

/** A coding agent with commands resolved for the terminal environment. */
export interface Agent extends Omit<AgentDefinition, 'command' | 'updateCommand' | 'versionCommand'> {
  command: string;
  updateCommand?: string;
  versionCommand?: string;
}

function isAgent(value: unknown): value is Agent {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Agent>;
  return typeof candidate.id === 'string'
    && typeof candidate.label === 'string'
    && typeof candidate.command === 'string';
}

/** Accepts both direct command arguments and agent nodes supplied by VS Code tree item menus. */
export function resolveCommandAgentArgument(argument: unknown): Agent | undefined {
  if (isAgent(argument)) {
    return argument;
  }

  if (!argument || typeof argument !== 'object') {
    return undefined;
  }

  const node = argument as { kind?: unknown; agent?: unknown };
  return node.kind === 'agent' && isAgent(node.agent) ? node.agent : undefined;
}

function onAllPlatforms(command: string): Record<CommandPlatform, string> {
  return { windows: command, macos: command, linux: command };
}

/** Built-in agent presets shipped with the extension. Users override them by reusing an id. */
export const BUILTIN_AGENTS: readonly AgentDefinition[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    command: onAllPlatforms('claude'),
    icon: 'sparkle',
    iconPath: 'media/agents/claude.svg',
    installationDocumentationUrl: 'https://code.claude.com/docs/en/setup',
    updateCommand: onAllPlatforms('claude update'),
    versionCommand: onAllPlatforms('claude --version'),
    // Super CLI is one extension for every CLI, so skip Claude Code's IDE extension
    // auto-install using its own official environment variable.
    env: { CLAUDE_CODE_IDE_SKIP_AUTO_INSTALL: '1' },
  },
  {
    id: 'codex',
    label: 'Codex CLI',
    command: onAllPlatforms('codex'),
    icon: 'rocket',
    iconPath: 'media/agents/codex.svg',
    installationDocumentationUrl: 'https://developers.openai.com/codex/cli/',
    updateCommand: onAllPlatforms('codex update'),
    versionCommand: onAllPlatforms('codex --version'),
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot CLI',
    command: onAllPlatforms('copilot'),
    icon: 'github',
    iconPath: {
      light: 'media/agents/copilot-light.svg',
      dark: 'media/agents/copilot-dark.svg',
    },
    installationDocumentationUrl: 'https://docs.github.com/en/copilot/how-tos/copilot-cli/install-copilot-cli',
    updateCommand: onAllPlatforms('copilot update'),
    versionCommand: onAllPlatforms('copilot --version'),
  },
  {
    id: 'grok',
    label: 'Grok CLI',
    command: onAllPlatforms('grok'),
    icon: 'zap',
    iconPath: {
      light: 'media/agents/grok-light.svg',
      dark: 'media/agents/grok-dark.svg',
    },
  },
  {
    id: 'kilo',
    label: 'Kilo CLI',
    command: onAllPlatforms('kilo'),
    icon: 'terminal',
    iconPath: {
      light: 'media/agents/kilo-light.svg',
      dark: 'media/agents/kilo-dark.svg',
    },
    installationDocumentationUrl: 'https://kilo.ai/docs/cli',
    updateCommand: onAllPlatforms('kilo upgrade'),
    versionCommand: onAllPlatforms('kilo --version'),
  },
  {
    id: 'kiro',
    label: 'Kiro CLI',
    command: onAllPlatforms('kiro-cli'),
    icon: 'sparkle-filled',
    iconPath: 'media/agents/kiro.svg',
    installationDocumentationUrl: 'https://kiro.dev/docs/cli/',
    // Kiro downloads updates in the background and installs them when the CLI exits.
    versionCommand: onAllPlatforms('kiro-cli --version'),
  },
  {
    id: 'openclaw',
    label: 'OpenClaw CLI',
    command: onAllPlatforms('openclaw chat'),
    icon: 'comment-discussion',
    iconPath: 'media/agents/openclaw.svg',
    installationDocumentationUrl: 'https://docs.openclaw.ai/install',
    updateCommand: onAllPlatforms('openclaw update'),
    versionCommand: onAllPlatforms('openclaw --version'),
  },
  {
    id: 'antigravity',
    label: 'Antigravity CLI',
    command: onAllPlatforms('agy'),
    icon: 'star-full',
    iconPath: 'media/agents/antigravity.svg',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: onAllPlatforms('opencode'),
    icon: 'code',
    iconPath: {
      light: 'media/agents/opencode-light.svg',
      dark: 'media/agents/opencode-dark.svg',
    },
    installationDocumentationUrl: 'https://opencode.ai/docs/',
    updateCommand: onAllPlatforms('opencode upgrade'),
    versionCommand: onAllPlatforms('opencode --version'),
  },
  {
    id: 'command-code',
    label: 'Command Code',
    // Use the `command-code` alias, not `cmd`: on Windows `cmd` is intercepted as the Command Prompt.
    // `command-code` works on Windows, macOS, Linux, and WSL without that conflict.
    command: onAllPlatforms('command-code'),
    icon: 'terminal',
    iconPath: 'media/agents/command-code.svg',
  },
  {
    id: 'cursor',
    label: 'Cursor CLI',
    command: onAllPlatforms('cursor-agent'),
    icon: 'edit',
    iconPath: 'media/agents/cursor.svg',
    installationDocumentationUrl: 'https://cursor.com/docs/cli/overview',
    updateCommand: onAllPlatforms('cursor-agent update'),
    versionCommand: onAllPlatforms('cursor-agent --version'),
  },
  {
    id: 'droid',
    label: 'Droid CLI',
    command: onAllPlatforms('droid'),
    icon: 'circuit-board',
    iconPath: 'media/agents/droid.svg',
    installationDocumentationUrl: 'https://docs.factory.ai/cli/getting-started',
    updateCommand: onAllPlatforms('droid update'),
  },
  {
    id: 'crush',
    label: 'Crush',
    command: onAllPlatforms('crush'),
    icon: 'flame',
    iconPath: 'media/agents/crush.svg',
    installationDocumentationUrl: 'https://github.com/charmbracelet/crush',
  },
  {
    id: 'hermes',
    label: 'Hermes',
    command: onAllPlatforms('hermes'),
    icon: 'send',
    iconPath: {
      light: 'media/agents/hermes-light.svg',
      dark: 'media/agents/hermes-dark.svg',
    },
    installationDocumentationUrl: 'https://hermes-agent.nousresearch.com/docs/getting-started/installation',
    updateCommand: onAllPlatforms('hermes update'),
  },
  {
    id: 'mimo',
    label: 'MiMo Code',
    command: onAllPlatforms('mimo'),
    icon: 'beaker',
    iconPath: 'media/agents/mimo.svg',
  },
  {
    id: 'pi',
    label: 'Pi',
    command: onAllPlatforms('pi'),
    icon: 'pulse',
    iconPath: {
      light: 'media/agents/pi-light.svg',
      dark: 'media/agents/pi-dark.svg',
    },
    installationDocumentationUrl: 'https://pi.dev/docs/latest',
    // Pi exposes an official self-update command (`pi update` updates pi only).
    updateCommand: onAllPlatforms('pi update'),
  },
  {
    id: 'kimi',
    label: 'Kimi Code CLI',
    command: onAllPlatforms('kimi'),
    icon: 'comment-discussion',
    iconPath: 'media/agents/kimi.svg',
    installationDocumentationUrl: 'https://www.kimi.com/code/docs/en/kimi-code-cli/guides/getting-started.html',
    updateCommand: onAllPlatforms('kimi upgrade'),
    versionCommand: onAllPlatforms('kimi --version'),
  },
];

function isValidPlatformCommand(value: unknown): value is PlatformCommand {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<CommandPlatform, unknown>>;
  return (['windows', 'macos', 'linux'] as const).every(
    (platform) => typeof candidate[platform] === 'string' && candidate[platform].trim().length > 0,
  );
}

function isValidAgentIconPath(value: unknown): value is AgentIconPath {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Record<'light' | 'dark', unknown>>;
  return typeof candidate.light === 'string'
    && candidate.light.trim().length > 0
    && typeof candidate.dark === 'string'
    && candidate.dark.trim().length > 0;
}

function normalizeAgentEnvironment(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    ([name, environmentValue]) => name.length > 0 && typeof environmentValue === 'string',
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/** Maps Node's host platform and the WSL setting to the command variant that will actually run. */
export function resolveCommandPlatform(nodePlatform: NodeJS.Platform, useWsl: boolean): CommandPlatform {
  if (nodePlatform === 'win32') {
    return useWsl ? 'linux' : 'windows';
  }

  return nodePlatform === 'darwin' ? 'macos' : 'linux';
}

/** Resolves one shared or platform-specific command for the selected terminal environment. */
export function resolvePlatformCommand(command: PlatformCommand, platform: CommandPlatform): string {
  return (typeof command === 'string' ? command : command[platform]).trim();
}

/** Resolves an agent definition into commands safe to pass to the active terminal. */
export function resolveAgentCommands(agent: AgentDefinition, platform: CommandPlatform): Agent {
  const { command, updateCommand, versionCommand, ...metadata } = agent;
  const resolved: Agent = {
    ...metadata,
    command: resolvePlatformCommand(command, platform),
  };

  if (updateCommand) {
    resolved.updateCommand = resolvePlatformCommand(updateCommand, platform);
  }
  if (versionCommand) {
    resolved.versionCommand = resolvePlatformCommand(versionCommand, platform);
  }

  return resolved;
}

/** Returns true when a value is a usable agent definition (non-empty id and commands). */
function isValidAgent(value: unknown): value is AgentDefinition {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AgentDefinition>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    isValidPlatformCommand(candidate.command)
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
  builtins: readonly AgentDefinition[],
  userAgents: readonly AgentDefinition[] | undefined,
  useBuiltins: boolean,
): AgentDefinition[] {
  const byId = new Map<string, AgentDefinition>();

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
      const merged: AgentDefinition = { ...existing, ...candidate };
      const label = typeof candidate.label === 'string' ? candidate.label.trim() : existing?.label.trim();
      merged.label = label || merged.id;
      if (typeof merged.icon !== 'string' || merged.icon.trim().length === 0) {
        delete merged.icon;
      }
      if (merged.iconPath !== undefined && !isValidAgentIconPath(merged.iconPath)) {
        delete merged.iconPath;
      }
      if (typeof merged.installationDocumentationUrl !== 'string'
        || merged.installationDocumentationUrl.trim().length === 0) {
        delete merged.installationDocumentationUrl;
      }
      const environment = normalizeAgentEnvironment(merged.env);
      if (environment) {
        merged.env = environment;
      } else {
        delete merged.env;
      }
      if (merged.updateCommand !== undefined && !isValidPlatformCommand(merged.updateCommand)) {
        delete merged.updateCommand;
      }
      if (merged.versionCommand !== undefined && !isValidPlatformCommand(merged.versionCommand)) {
        delete merged.versionCommand;
      }
      byId.set(candidate.id, merged);
    }
  }

  return [...byId.values()];
}

/** Hides selected built-in definitions before user overrides are merged. */
export function filterHiddenBuiltins(
  builtins: readonly AgentDefinition[],
  hiddenIds: readonly string[],
): AgentDefinition[] {
  const hidden = new Set(hiddenIds);

  return builtins.filter((agent) => !hidden.has(agent.id));
}
