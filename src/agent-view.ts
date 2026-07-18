import type { Agent } from './agents.js';

export type AgentInstallStatus = boolean | undefined;

export interface AgentGroup {
  id: 'ready' | 'unknown' | 'setup';
  label: string;
  agents: Agent[];
}

export interface AgentSection {
  id: 'favorite' | 'ready' | 'unknown' | 'setup';
  label: string;
  agents: Agent[];
}

export function compareAgentsByLabel(
  left: Pick<Agent, 'id' | 'label'>,
  right: Pick<Agent, 'id' | 'label'>,
): number {
  return left.label.localeCompare(right.label) || left.id.localeCompare(right.id);
}

/** Returns whether a successful launch should offer to remember the selected agent. */
export function shouldOfferFavoriteAfterLaunch(
  offerFavorite: boolean,
  launched: boolean,
  selectedId: string,
  favoriteId: string,
): boolean {
  return offerFavorite && launched && selectedId !== favoriteId;
}

function sortAgents(agents: readonly Agent[]): Agent[] {
  return [...agents].sort(compareAgentsByLabel);
}

/** Groups non-favorite sidebar agents by installation state and sorts each group alphabetically. */
export function buildAgentGroups(
  agents: readonly Agent[],
  favoriteId: string,
  getInstallStatus: (id: string) => AgentInstallStatus,
): AgentGroup[] {
  const sorted = sortAgents(agents.filter((agent) => agent.id !== favoriteId));
  const groups: AgentGroup[] = [
    { id: 'ready', label: 'Ready', agents: sorted.filter((agent) => getInstallStatus(agent.id) === true) },
    { id: 'unknown', label: 'Agents', agents: sorted.filter((agent) => getInstallStatus(agent.id) === undefined) },
    { id: 'setup', label: 'Setup required', agents: sorted.filter((agent) => getInstallStatus(agent.id) === false) },
  ];

  return groups.filter((group) => group.agents.length > 0);
}

/** Builds non-duplicated Quick Pick sections with the favorite promoted to its own section. */
export function buildAgentSections(
  agents: readonly Agent[],
  favoriteId: string,
  getInstallStatus: (id: string) => AgentInstallStatus,
): AgentSection[] {
  const favorite = agents.find((agent) => agent.id === favoriteId);
  const remaining = sortAgents(agents.filter((agent) => agent.id !== favoriteId));
  const sections: AgentSection[] = [
    { id: 'favorite', label: 'Favorite', agents: favorite ? [favorite] : [] },
    { id: 'ready', label: 'Ready', agents: remaining.filter((agent) => getInstallStatus(agent.id) === true) },
    { id: 'unknown', label: 'Agents', agents: remaining.filter((agent) => getInstallStatus(agent.id) === undefined) },
    { id: 'setup', label: 'Setup required', agents: remaining.filter((agent) => getInstallStatus(agent.id) === false) },
  ];

  return sections.filter((section) => section.agents.length > 0);
}
