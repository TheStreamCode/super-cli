import * as vscode from 'vscode';
import type { Agent, AgentIconPath } from './agents.js';

/** Removes a $(...) wrapper so users can write either "sparkle" or "$(sparkle)". */
function normalizeIconId(icon: string | undefined): string | undefined {
  if (!icon) {
    return undefined;
  }

  const trimmed = icon.trim();
  const wrapped = trimmed.match(/^\$\(([^)]+)\)$/);
  const id = wrapped ? wrapped[1] : trimmed;

  return id || undefined;
}

/** Resolves a packaged agent mark, falling back to a configured VS Code ThemeIcon. */
export function resolveAgentIcon(agent: Agent, extensionUri: vscode.Uri): vscode.Uri | vscode.ThemeIcon {
  if (agent.iconPath) {
    const relativePath = resolveThemeIconPath(agent.iconPath, vscode.window.activeColorTheme.kind);
    return vscode.Uri.joinPath(extensionUri, ...relativePath.split('/'));
  }

  return new vscode.ThemeIcon(normalizeIconId(agent.icon) ?? 'terminal');
}

/** Selects the vendor-provided contrast variant that matches the active VS Code theme. */
export function resolveThemeIconPath(iconPath: AgentIconPath, themeKind: vscode.ColorThemeKind): string {
  if (typeof iconPath === 'string') {
    return iconPath;
  }

  return themeKind === vscode.ColorThemeKind.Light || themeKind === vscode.ColorThemeKind.HighContrastLight
    ? iconPath.light
    : iconPath.dark;
}
