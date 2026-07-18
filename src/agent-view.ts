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

function sortAgents(agents: readonly Agent[], favoriteId: string): Agent[] {
  return [...agents].sort((left, right) => {
    const leftFavorite = left.id === favoriteId ? 1 : 0;
    const rightFavorite = right.id === favoriteId ? 1 : 0;
    return rightFavorite - leftFavorite || left.label.localeCompare(right.label);
  });
}

/** Groups sidebar agents by installation state while keeping the favorite first. */
export function buildAgentGroups(
  agents: readonly Agent[],
  favoriteId: string,
  getInstallStatus: (id: string) => AgentInstallStatus,
): AgentGroup[] {
  const sorted = sortAgents(agents, favoriteId);
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
  const remaining = sortAgents(agents.filter((agent) => agent.id !== favoriteId), '');
  const sections: AgentSection[] = [
    { id: 'favorite', label: 'Favorite', agents: favorite ? [favorite] : [] },
    { id: 'ready', label: 'Ready', agents: remaining.filter((agent) => getInstallStatus(agent.id) === true) },
    { id: 'unknown', label: 'Agents', agents: remaining.filter((agent) => getInstallStatus(agent.id) === undefined) },
    { id: 'setup', label: 'Setup required', agents: remaining.filter((agent) => getInstallStatus(agent.id) === false) },
  ];

  return sections.filter((section) => section.agents.length > 0);
}
