type WorkspaceFolderLike<T> = { uri: T };
type WorkspaceLike<T> = {
  workspaceFolders?: readonly WorkspaceFolderLike<T>[];
  getWorkspaceFolder(uri: T): WorkspaceFolderLike<T> | undefined;
};
type ActiveEditorLike<T> = { document: { uri: T } };

/** Appends a chunk without allowing a long-running process to grow the retained output indefinitely. */
export function appendBoundedText(current: string, chunk: string, maxLength: number): string {
  if (current.length >= maxLength) {
    return current;
  }

  return current + chunk.slice(0, maxLength - current.length);
}

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

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/** Returns the executable extensions to try on Windows (the bare name plus each PATHEXT entry). */
function resolveWindowsExtensions(pathExt: string | undefined): string[] {
  const entries = (pathExt && pathExt.trim() ? pathExt : DEFAULT_PATHEXT)
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return ['', ...entries];
}

/**
 * Best-effort check that a command's executable resolves on PATH, without spawning a process.
 * On Windows the bare name is also tried with each PATHEXT extension. `fileExists` is injected so
 * the logic stays pure and testable; production passes `fs.existsSync`.
 */
export function executableExistsOnPath(
  command: string,
  env: Record<string, string | undefined>,
  platform: string,
  fileExists: (filePath: string) => boolean,
): boolean {
  const executable = extractExecutable(command);
  if (!executable) {
    return false;
  }

  const isWindows = platform === 'win32';
  const extensions = isWindows ? resolveWindowsExtensions(env.PATHEXT) : [''];
  const existsWithExt = (base: string): boolean => extensions.some((ext) => fileExists(base + ext));

  // A path-qualified command is checked directly, not searched on PATH.
  if (/[\\/]/.test(executable)) {
    return existsWithExt(executable);
  }

  const pathValue = env.PATH ?? env.Path ?? '';
  const delimiter = isWindows ? ';' : ':';
  const separator = isWindows ? '\\' : '/';

  return pathValue
    .split(delimiter)
    .filter((dir) => dir.length > 0)
    .some((dir) => existsWithExt(dir.replace(/[\\/]+$/, '') + separator + executable));
}
