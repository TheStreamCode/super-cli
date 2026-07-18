import * as vscode from 'vscode';
import type { Agent } from './agents.js';
import { buildAgentGroups, type AgentGroup } from './agent-view.js';
import type { DoctorResult } from './doctor.js';
import { resolveAgentIcon } from './icons.js';

export interface AgentGroupNode extends AgentGroup {
  kind: 'group';
}

export interface AgentItemNode {
  kind: 'agent';
  agent: Agent;
}

export type AgentTreeNode = AgentGroupNode | AgentItemNode;

/** Lists the configured coding agents in the Super CLI sidebar. */
export class AgentTreeDataProvider implements vscode.TreeDataProvider<AgentTreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(
    private readonly getAgents: () => Agent[],
    private readonly getFavoriteId: () => string,
    private readonly getInstallStatus: (id: string) => boolean | undefined,
    private readonly getDoctorResult: (id: string) => DoctorResult | undefined,
    private readonly extensionUri: vscode.Uri,
  ) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  getTreeItem(node: AgentTreeNode): vscode.TreeItem {
    if (node.kind === 'group') {
      const collapsibleState = node.id === 'setup'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.Expanded;
      const item = new vscode.TreeItem(node.label, collapsibleState);
      item.id = `group:${node.id}`;
      item.description = String(node.agents.length);
      item.contextValue = 'agent-group';
      item.iconPath = new vscode.ThemeIcon(
        node.id === 'ready' ? 'pass-filled' : node.id === 'setup' ? 'tools' : 'list-unordered',
      );
      item.accessibilityInformation = {
        label: `${node.label}, ${node.agents.length} ${node.agents.length === 1 ? 'agent' : 'agents'}`,
      };
      return item;
    }

    const agent = node.agent;
    const isFavorite = agent.id === this.getFavoriteId();
    const installStatus = this.getInstallStatus(agent.id);
    const doctorResult = this.getDoctorResult(agent.id);
    const isMissing = installStatus === false;
    const doctorDescription = doctorResult?.version
      ?? (doctorResult?.status === 'timed-out' ? 'check timed out'
        : doctorResult?.status === 'check-failed' ? 'check failed'
          : doctorResult?.status === 'version-unavailable' ? 'version unavailable'
            : undefined);

    const item = new vscode.TreeItem(agent.label, vscode.TreeItemCollapsibleState.None);
    item.id = agent.id;
    item.description = isMissing
      ? `setup required · ${agent.command}`
      : doctorDescription ? `${doctorDescription} · ${agent.command}` : agent.command;
    item.tooltip = `Launch ${agent.label} (${agent.command})`
      + (isFavorite ? ' · Favorite (Ctrl+Alt+A)' : '')
      + (installStatus === true ? ' · ready' : isMissing ? ' · not found on PATH' : ' · status unknown')
      + (doctorResult?.version ? ` · ${doctorResult.version}` : '')
      + (doctorResult?.detail ? ` · ${doctorResult.detail}` : '');
    item.contextValue = `agent-${isMissing ? 'missing' : 'ready'}`
      + (agent.updateCommand ? '-updatable' : '')
      + (isFavorite ? '-favorite' : '')
      + (agent.installationDocumentationUrl ? '-documented' : '');
    item.iconPath = resolveAgentIcon(agent, this.extensionUri);
    item.accessibilityInformation = {
      label: `${agent.label}, ${isFavorite ? 'favorite, ' : ''}`
        + `${installStatus === true ? 'ready' : isMissing ? 'setup required' : 'installation status unknown'}, `
        + `${doctorResult?.version ? `version ${doctorResult.version}, ` : ''}`
        + `command ${agent.command}`,
    };
    item.command = {
      command: 'superCli.launchAgent',
      title: 'Launch',
      arguments: [agent],
    };

    return item;
  }

  getChildren(node?: AgentTreeNode): AgentTreeNode[] {
    if (node?.kind === 'group') {
      return node.agents.map((agent) => ({ kind: 'agent', agent }));
    }

    if (node?.kind === 'agent') {
      return [];
    }

    return buildAgentGroups(this.getAgents(), this.getFavoriteId(), this.getInstallStatus)
      .map((group) => ({ ...group, kind: 'group' }));
  }
}
