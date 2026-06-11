type WorkspaceFolderLike<T> = { uri: T };
type WorkspaceLike<T> = {
  workspaceFolders?: readonly WorkspaceFolderLike<T>[];
  getWorkspaceFolder(uri: T): WorkspaceFolderLike<T> | undefined;
};
type ActiveEditorLike<T> = { document: { uri: T } };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getExecutableBaseName(command: string): string {
  const executable = extractExecutable(command);
  const fileName = executable.split(/[\\/]/).pop() ?? executable;

  return fileName.replace(/\.(?:exe|cmd|bat|ps1)$/i, '');
}

function buildCommandNotFoundPatterns(command: string): RegExp[] {
  const executableName = getExecutableBaseName(command);

  if (!executableName) {
    return [];
  }

  const escapedName = escapeRegExp(executableName);

  return [
    new RegExp(`(?:^|\\s)${escapedName}:\\s+command not found`, 'i'),
    new RegExp(`(?:^|\\s)${escapedName}:\\s+not found`, 'i'),
    new RegExp(`command not found:\\s*${escapedName}`, 'i'),
    new RegExp(`unknown command:?\\s*${escapedName}`, 'i'),
    new RegExp(`['"]?${escapedName}['"]?.*is not recognized`, 'i'),
    new RegExp(`\\b${escapedName}\\b.*not found`, 'i'),
    new RegExp(`\\b${escapedName}\\b.*cannot find the file`, 'i'),
  ];
}

/** Returns the configured terminal base name without any numeric suffix. */
export function normalizeTerminalName(value: string | undefined, fallback: string): string {
  return (value ?? fallback).trim() || fallback;
}

/** Returns the terminal label with the numeric suffix used by the extension. */
export function buildTerminalName(value: string | undefined, sequence: number, fallback: string): string {
  const baseName = normalizeTerminalName(value, fallback);
  const suffix = sequence <= 1 ? '' : ` ${sequence}`;

  return `${baseName}${suffix}`;
}

/** Returns the settings search query for the current extension id. */
export function buildExtensionSettingsQuery(extensionId: string): string {
  return `@ext:${extensionId}`;
}

/** Extracts the executable token while preserving quoted Windows paths with spaces. */
export function extractExecutable(command: string): string {
  const normalized = command.trim();

  if (!normalized) {
    return '';
  }

  const firstCharacter = normalized[0];
  if (firstCharacter === '"' || firstCharacter === "'") {
    const closingQuoteIndex = normalized.indexOf(firstCharacter, 1);
    if (closingQuoteIndex > 0) {
      return normalized.slice(1, closingQuoteIndex);
    }
  }

  const whitespaceIndex = normalized.search(/\s/);
  return whitespaceIndex === -1 ? normalized : normalized.slice(0, whitespaceIndex);
}

/** Returns whether a terminal failure likely means the configured CLI is missing. */
export function shouldPromptToInstall(command: string, exitCode: number | undefined, output: string): boolean {
  if (exitCode === 127) {
    return true;
  }

  if (exitCode !== undefined && exitCode !== 1) {
    return false;
  }

  return buildCommandNotFoundPatterns(command).some((pattern) => pattern.test(output));
}

/** Resolves the terminal cwd from the active editor or the first workspace folder. */
export function resolveTerminalCwd<T>(
  activeEditor: ActiveEditorLike<T> | undefined,
  workspace: WorkspaceLike<T>,
): T | undefined {
  const activeWorkspaceFolder = activeEditor ? workspace.getWorkspaceFolder(activeEditor.document.uri) : undefined;
  return activeWorkspaceFolder?.uri ?? workspace.workspaceFolders?.[0]?.uri;
}

/** Expands a leading `~` (or `~/`, `~\`) in a path to the given home directory; other paths are unchanged. */
export function resolveHomePath(p: string, homedir: string): string {
  if (p === '~') {
    return homedir;
  }

  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return homedir + p.slice(1);
  }

  return p;
}

/** Prepends an optional update command so the CLI updates before it runs (no-op without one). */
export function buildLaunchCommand(command: string, updateCommand: string | undefined): string {
  return updateCommand ? `${updateCommand} ; ${command}` : command;
}

/** Adds only the keys from `defaults` that are absent in `existing`; reports whether anything changed. */
export function mergeMissingDefaults(
  existing: Record<string, unknown>,
  defaults: Record<string, unknown>,
): { merged: Record<string, unknown>; changed: boolean } {
  const merged: Record<string, unknown> = { ...existing };
  let changed = false;

  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in merged)) {
      merged[key] = value;
      changed = true;
    }
  }

  return { merged, changed };
}
