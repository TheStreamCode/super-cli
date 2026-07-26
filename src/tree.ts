import * as vscode from 'vscode';
import type { Agent } from './agents.js';
import { buildAgentGroups, formatSessionElapsed, type AgentGroup } from './agent-view.js';
import type { DoctorResult } from './doctor.js';
import { resolveAgentIcon } from './icons.js';
import type { AgentSession } from './sessions.js';

export interface AgentGroupNode extends AgentGroup {
  kind: 'group';
}

export interface AgentItemNode {
  kind: 'agent';
  agent: Agent;
}

export interface RunningGroupNode {
  kind: 'running-group';
  sessions: AgentSession[];
}

export interface SessionItemNode {
  kind: 'session';
  session: AgentSession;
}

export type AgentTreeNode = AgentGroupNode | AgentItemNode | RunningGroupNode | SessionItemNode;

/** Lists the configured coding agents in the Super CLI sidebar. */
export class AgentTreeDataProvider implements vscode.TreeDataProvider<AgentTreeNode> {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  constructor(
    private readonly getAgents: () => Agent[],
    private readonly getFavoriteIds: () => string[],
    private readonly getInstallStatus: (id: string) => boolean | undefined,
    private readonly getDoctorResult: (id: string) => DoctorResult | undefined,
    private readonly getSessions: () => AgentSession[],
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
      item.contextValue = 'super-cli-group';
      item.iconPath = new vscode.ThemeIcon(
        node.id === 'favorite' ? 'star-full'
          : node.id === 'ready' ? 'pass-filled'
            : node.id === 'setup' ? 'tools'
              : 'list-unordered',
      );
      item.accessibilityInformation = {
        label: `${node.label}, ${node.agents.length} ${node.agents.length === 1 ? 'agent' : 'agents'}`,
      };
      return item;
    }

    if (node.kind === 'running-group') {
      const count = node.sessions.length;
      const item = new vscode.TreeItem('Running', vscode.TreeItemCollapsibleState.Expanded);
      item.id = 'group:running';
      item.description = String(count);
      item.contextValue = 'super-cli-running-group';
      item.iconPath = new vscode.ThemeIcon('loading~spin');
      item.accessibilityInformation = {
        label: `Running, ${count} ${count === 1 ? 'session' : 'sessions'}`,
      };
      return item;
    }

    if (node.kind === 'session') {
      const { session } = node;
      // An adopted session's real start time died with the previous extension host, so it reports how
      // long Super CLI has been watching it again rather than inventing a runtime for it.
      const elapsed = formatSessionElapsed(session.startedAt, Date.now());
      const description = session.adopted ? `reconnected · ${elapsed}` : elapsed;
      const runtime = session.adopted
        ? `reconnected after a window reload, tracked for ${elapsed}`
        : `running for ${elapsed}`;
      const item = new vscode.TreeItem(session.agent.label, vscode.TreeItemCollapsibleState.None);
      item.id = session.sessionId;
      item.description = description;
      item.tooltip = `${session.agent.label} · ${runtime} · click to reveal its terminal`;
      item.contextValue = 'session-running';
      item.iconPath = resolveAgentIcon(session.agent, this.extensionUri);
      item.accessibilityInformation = {
        label: `${session.agent.label}, ${runtime}`,
      };
      item.command = {
        command: 'superCli.revealSession',
        title: 'Reveal Terminal',
        arguments: [session],
      };
      return item;
    }

    const agent = node.agent;
    const favoriteIds = this.getFavoriteIds();
    const isFavorite = favoriteIds.includes(agent.id);
    const installStatus = this.getInstallStatus(agent.id);
    const doctorResult = this.getDoctorResult(agent.id);
    const isMissing = installStatus === false;
    const doctorDescription = doctorResult?.version
      ?? (doctorResult?.status === 'timed-out' ? 'check timed out'
        : doctorResult?.status === 'check-failed' ? 'check failed'
          : doctorResult?.status === 'version-unavailable' ? 'version unavailable'
            : undefined);

    const item = new vscode.TreeItem(
      isFavorite ? `★ ${agent.label}` : agent.label,
      vscode.TreeItemCollapsibleState.None,
    );
    item.id = agent.id;
    item.description = isMissing
      ? `setup required · ${agent.command}`
      : doctorDescription ? `${doctorDescription} · ${agent.command}` : agent.command;
    item.tooltip = `Launch ${agent.label} (${agent.command})`
      + (isFavorite ? (favoriteIds.length === 1 ? ' · Favorite (Ctrl+Alt+A)' : ' · Favorite') : '')
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

    if (node?.kind === 'running-group') {
      return node.sessions.map((session) => ({ kind: 'session', session }));
    }

    if (node?.kind === 'agent' || node?.kind === 'session') {
      return [];
    }

    const agents = this.getAgents();
    const favoriteIds = this.getFavoriteIds();
    const groups: AgentGroupNode[] = buildAgentGroups(agents, favoriteIds, this.getInstallStatus)
      .map((group) => ({ ...group, kind: 'group' }));
    const sessions = this.getSessions();
    const runningGroup: RunningGroupNode[] = sessions.length > 0 ? [{ kind: 'running-group', sessions }] : [];

    return [...runningGroup, ...groups];
  }
}
