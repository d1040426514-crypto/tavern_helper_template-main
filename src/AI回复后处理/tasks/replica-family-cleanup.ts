import { buildAttrGroupKey, parseExtractTagSpec } from './tag-extract';
import {
  getReplicaFamilyScheduleMode,
  getReplicaTasks,
  hasReplicaFamilyTasks,
  isReplicaLaunched,
  isReplicaFamilyRootTemplate,
} from './replica-family';
import { countAssistantRounds } from './schedule';
import type { PostProcessTask, ScriptSettings } from './schema';
import type { TagContainerRaw } from './tag-variables-nested';

const TAG_DATA_ROOT_KEY = 'post_process_tags';

export type ReplicaFamilyCleanupConfig = ScriptSettings['replicaFamilyCleanup'];

export type ReplicaCleanupCandidate = {
  memberId: string;
  attrValue: string;
  name: string;
  launched: boolean;
  runCount: number;
  activityScore: number;
  defaultSelected: boolean;
};

export type ReplicaCleanupCandidateGroup = {
  rootId: string;
  rootName: string;
  spec: string;
  members: ReplicaCleanupCandidate[];
};

function ensureCleanupState(settings: ScriptSettings): ReplicaFamilyCleanupConfig {
  if (!settings.replicaFamilyCleanup) {
    settings.replicaFamilyCleanup = {
      enabled: false,
      cycleRounds: 10,
      activityRatio: 0.5,
      mode: 'manual',
      roundsSinceCleanup: 0,
      cycleRunCounts: {},
      lastManualKeepByRoot: {},
      lastCleanupRound: 0,
    };
  }
  return settings.replicaFamilyCleanup;
}

export { hasReplicaFamilyTasks };

export function getReplicaFamilyCleanupConfig(settings: ScriptSettings): ReplicaFamilyCleanupConfig {
  return { ...ensureCleanupState(settings) };
}

export function updateReplicaFamilyCleanupConfig(
  settings: ScriptSettings,
  patch: Partial<ReplicaFamilyCleanupConfig>,
): ReplicaFamilyCleanupConfig {
  const state = ensureCleanupState(settings);
  Object.assign(state, patch);
  return { ...state };
}

export function incrementReplicaRunCounts(settings: ScriptSettings, executedMemberIds: string[]): void {
  if (!executedMemberIds.length) return;
  const state = ensureCleanupState(settings);
  for (const id of executedMemberIds) {
    state.cycleRunCounts[id] = (state.cycleRunCounts[id] ?? 0) + 1;
  }
}

export function tickCleanupRound(settings: ScriptSettings): void {
  const state = ensureCleanupState(settings);
  if (!state.enabled) return;
  state.roundsSinceCleanup = (state.roundsSinceCleanup ?? 0) + 1;
}

export function shouldTriggerCleanup(settings: ScriptSettings): boolean {
  const state = ensureCleanupState(settings);
  if (!state.enabled) return false;
  if (!hasReplicaFamilyTasks(settings.tasks)) return false;
  return (state.roundsSinceCleanup ?? 0) >= state.cycleRounds;
}

function computeMemberActivityScore(runCount: number, cycleRounds: number): number {
  if (cycleRounds <= 0) return 0;
  return runCount / cycleRounds;
}

function isMemberActive(
  member: PostProcessTask,
  root: PostProcessTask,
  runCount: number,
  cycleRounds: number,
  activityRatio: number,
  lastKeep: string[],
): boolean {
  const attrValue = member.replicaFamilyAttrValue ?? '';
  if (lastKeep.includes(attrValue)) return true;
  if (getReplicaFamilyScheduleMode(root) === 'manual' && isReplicaLaunched(member)) return true;
  return computeMemberActivityScore(runCount, cycleRounds) >= activityRatio;
}

export function computeAutoKeepSet(settings: ScriptSettings): Record<string, string[]> {
  const state = ensureCleanupState(settings);
  const result: Record<string, string[]> = {};
  for (const root of settings.tasks) {
    if (!isReplicaFamilyRootTemplate(root)) continue;
    const lastKeep = state.lastManualKeepByRoot[root.id] ?? [];
    const keep: string[] = [];
    for (const member of getReplicaTasks(root.id, settings.tasks)) {
      const runCount = state.cycleRunCounts[member.id] ?? 0;
      if (isMemberActive(member, root, runCount, state.cycleRounds, state.activityRatio, lastKeep)) {
        const attr = member.replicaFamilyAttrValue?.trim();
        if (attr) keep.push(attr);
      }
    }
    result[root.id] = keep;
  }
  return result;
}

export function computeDefaultSelection(settings: ScriptSettings): Record<string, string[]> {
  return computeAutoKeepSet(settings);
}

export function listReplicaFamilyCleanupCandidates(settings: ScriptSettings): ReplicaCleanupCandidateGroup[] {
  const state = ensureCleanupState(settings);
  const groups: ReplicaCleanupCandidateGroup[] = [];
  for (const root of settings.tasks) {
    if (!isReplicaFamilyRootTemplate(root)) continue;
    const spec = root.replicaFamilySpec ?? '';
    const lastKeep = state.lastManualKeepByRoot[root.id] ?? [];
    const members: ReplicaCleanupCandidate[] = getReplicaTasks(root.id, settings.tasks).map(member => {
      const runCount = state.cycleRunCounts[member.id] ?? 0;
      const activityScore = computeMemberActivityScore(runCount, state.cycleRounds);
      const defaultSelected = isMemberActive(
        member,
        root,
        runCount,
        state.cycleRounds,
        state.activityRatio,
        lastKeep,
      );
      return {
        memberId: member.id,
        attrValue: member.replicaFamilyAttrValue ?? '',
        name: member.name,
        launched: isReplicaLaunched(member),
        runCount,
        activityScore,
        defaultSelected,
      };
    });
    groups.push({
      rootId: root.id,
      rootName: root.name,
      spec,
      members,
    });
  }
  return groups;
}

function readTagContainerRaw(variables: Record<string, unknown>): TagContainerRaw {
  const raw = variables[TAG_DATA_ROOT_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...(raw as TagContainerRaw) };
}

export function pruneFloorTagKeysForReplica(
  spec: string,
  attrValuesToRemove: string[],
  messageId: number,
): void {
  if (!attrValuesToRemove.length) return;
  const parsed = parseExtractTagSpec(spec);
  if (!parsed?.attrName) return;
  const groupKey = buildAttrGroupKey(parsed.tagName, parsed.attrName);
  const removeSet = new Set(attrValuesToRemove);

  updateVariablesWith(
    variables => {
      const raw = readTagContainerRaw(variables);
      const existing = raw[groupKey];
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) return variables;
      const merged = { ...(existing as Record<string, string>) };
      for (const k of Object.keys(merged)) {
        if (removeSet.has(k)) delete merged[k];
      }
      if (Object.keys(merged).length) {
        raw[groupKey] = merged;
      } else {
        delete raw[groupKey];
      }
      variables[TAG_DATA_ROOT_KEY] = raw;
      return variables;
    },
    { type: 'message', message_id: messageId },
  );
}

export function applyReplicaFamilyCleanup(
  settings: ScriptSettings,
  keepAttrValuesByRoot: Record<string, string[]>,
  messageId: number,
): ScriptSettings {
  const state = ensureCleanupState(settings);
  let tasks = [...settings.tasks];
  const nextLastKeep: Record<string, string[]> = { ...state.lastManualKeepByRoot };

  for (const root of settings.tasks) {
    if (!isReplicaFamilyRootTemplate(root)) continue;
    const keepSet = new Set(keepAttrValuesByRoot[root.id] ?? []);
    const members = getReplicaTasks(root.id, tasks);
    const toRemove: string[] = [];
    const removeMemberIds: string[] = [];

    for (const member of members) {
      const attr = member.replicaFamilyAttrValue ?? '';
      if (!keepSet.has(attr)) {
        toRemove.push(attr);
        removeMemberIds.push(member.id);
      }
    }

    if (toRemove.length) {
      const spec = root.replicaFamilySpec ?? '';
      pruneFloorTagKeysForReplica(spec, toRemove, messageId);
      tasks = tasks.filter(t => !removeMemberIds.includes(t.id));
      for (const id of removeMemberIds) {
        delete state.cycleRunCounts[id];
      }
    }

    nextLastKeep[root.id] = [...keepSet];
  }

  state.lastManualKeepByRoot = nextLastKeep;
  state.roundsSinceCleanup = 0;
  state.cycleRunCounts = {};
  state.lastCleanupRound = countAssistantRounds();

  return { ...settings, tasks };
}

export function resetReplicaFamilyCleanupCycle(settings: ScriptSettings): void {
  const state = ensureCleanupState(settings);
  state.roundsSinceCleanup = 0;
  state.cycleRunCounts = {};
}
