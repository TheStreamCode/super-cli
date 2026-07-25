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
  favoriteIds: readonly string[],
): boolean {
  return offerFavorite && launched && !favoriteIds.includes(selectedId);
}

/**
 * Decides the array to migrate the legacy single-favorite setting into, or undefined when no
 * migration is needed (no legacy value, or the new setting already has favorites of its own).
 * Never signals clearing the legacy setting — that's left in place so Settings Sync can't drop a
 * favorite on a machine still running an older version that only reads the legacy key.
 */
export function resolveMigratedFavorites(
  legacyFavoriteId: string | undefined,
  currentFavoriteIds: readonly string[] | undefined,
): string[] | undefined {
  if (!legacyFavoriteId) {
    return undefined;
  }

  if (currentFavoriteIds && currentFavoriteIds.length > 0) {
    return undefined;
  }

  return [legacyFavoriteId];
}

/** Successful launches before the one-time rating prompt is offered. */
export const RATING_PROMPT_LAUNCH_THRESHOLD = 20;

/** Returns whether a successful launch should trigger the one-time rating prompt. */
export function shouldOfferRatingAfterLaunch(launchCount: number, ratingPromptShown: boolean): boolean {
  return !ratingPromptShown && launchCount >= RATING_PROMPT_LAUNCH_THRESHOLD;
}

function sortAgents(agents: readonly Agent[]): Agent[] {
  return [...agents].sort(compareAgentsByLabel);
}

/** Groups non-favorite sidebar agents by installation state and sorts each group alphabetically. */
export function buildAgentGroups(
  agents: readonly Agent[],
  favoriteIds: readonly string[],
  getInstallStatus: (id: string) => AgentInstallStatus,
): AgentGroup[] {
  const sorted = sortAgents(agents.filter((agent) => !favoriteIds.includes(agent.id)));
  const groups: AgentGroup[] = [
    { id: 'ready', label: 'Ready', agents: sorted.filter((agent) => getInstallStatus(agent.id) === true) },
    { id: 'unknown', label: 'Agents', agents: sorted.filter((agent) => getInstallStatus(agent.id) === undefined) },
    { id: 'setup', label: 'Setup required', agents: sorted.filter((agent) => getInstallStatus(agent.id) === false) },
  ];

  return groups.filter((group) => group.agents.length > 0);
}

// The sidebar only ticks this display every 30s (see AgentSessionRegistry), so it reports whole
// minutes rather than seconds — exact seconds would visibly freeze between ticks instead of counting.
/** Formats how long a session has been running, in a compact form like "<1m", "5m", or "1h 12m". */
export function formatSessionElapsed(startedAtMs: number, nowMs: number): string {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));

  if (elapsedSeconds < 60) {
    return '<1m';
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }

  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/** Builds non-duplicated Quick Pick sections with favorites promoted to their own section. */
export function buildAgentSections(
  agents: readonly Agent[],
  favoriteIds: readonly string[],
  getInstallStatus: (id: string) => AgentInstallStatus,
): AgentSection[] {
  const favorites = sortAgents(agents.filter((agent) => favoriteIds.includes(agent.id)));
  const remaining = sortAgents(agents.filter((agent) => !favoriteIds.includes(agent.id)));
  const sections: AgentSection[] = [
    { id: 'favorite', label: 'Favorites', agents: favorites },
    { id: 'ready', label: 'Ready', agents: remaining.filter((agent) => getInstallStatus(agent.id) === true) },
    { id: 'unknown', label: 'Agents', agents: remaining.filter((agent) => getInstallStatus(agent.id) === undefined) },
    { id: 'setup', label: 'Setup required', agents: remaining.filter((agent) => getInstallStatus(agent.id) === false) },
  ];

  return sections.filter((section) => section.agents.length > 0);
}
