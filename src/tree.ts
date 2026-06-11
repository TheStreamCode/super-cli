import * as vscode from 'vscode';
import type { Agent } from './agents.js';

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

/** Lists the configured coding agents in the Super CLI sidebar. */
export class AgentTreeDataProvider implements vscode.TreeDataProvider<Agent> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(private readonly getAgents: () => Agent[]) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(agent: Agent): vscode.TreeItem {
    const item = new vscode.TreeItem(agent.label, vscode.TreeItemCollapsibleState.None);
    item.id = agent.id;
    item.description = agent.command;
    item.tooltip = `Launch ${agent.label} (${agent.command})`;
    item.contextValue = 'agent';
    item.iconPath = new vscode.ThemeIcon(normalizeIconId(agent.icon) ?? 'terminal');
    item.command = {
      command: 'superCli.launchAgent',
      title: 'Launch',
      arguments: [agent],
    };

    return item;
  }

  getChildren(): Agent[] {
    return this.getAgents();
  }
}
