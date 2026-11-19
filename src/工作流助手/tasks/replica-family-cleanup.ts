import { buildAttrGroupKey, parseExtractTagSpec, sortAttrValues } from './tag-extract';
import {
  getReplicaFamilyEnumSpecKey,
  getReplicaFamilyScheduleMode,
  getReplicaTasks,
  hasReplicaFamilyTasks,
  isReplicaLaunched,
  isReplicaFamilyRootTemplate,
} from './replica-family';
import { countAssistantRounds } from './schedule';
import type { PostProcessTask, ReplicaFamilyCleanupRuntime, ScriptSettings } from './schema';
import type { TagContainerRaw } from './tag-variables-nested';
import { findLatestAccessibleFloorId, isAccessibleMessageFloor } from './message-floor';

const TAG_DATA_ROOT_KEY = 'post_process_tags';

export type ReplicaFamilyCleanupConfig = ScriptSettings['replicaFamilyCleanup'];

export type ReplicaCleanupCandidate = {
  /** 稳定键：attrValue（同 spec 下去重后） */
  memberId: string;
  attrValue: string;
  name: string;
  launched: boolean;
  runCount: number;
  /** 本周期调度放行（试过）次数取 max */
  opportunityCount: number;
  /** 本周期调度等待（已进 runnable 未放行）次数取 max */
  scheduleWaitCount: number;
  defaultSelected: boolean;
};

export type ReplicaCleanupCandidateGroup = {
  spec: string;
  members: ReplicaCleanupCandidate[];
};

type AttrAgg = {
  attrValue: string;
  runCountMax: number;
  opportunityCountMax: number;
  scheduleWaitCountMax: number;
  anyLaunched: boolean;
  anyProtected: boolean;
  displayName: string;
};

type SpecBucket = {
  /** canonical：trim + lowerCase，用作 keep / 记忆 map 键 */
  spec: string;
  roots: PostProcessTask[];
  byAttr: Map<string, AttrAgg>;
};

/** 清理 keep / 记忆用的规范 spec 键 */
export function canonicalSpecKey(spec: string): string {
  return String(spec ?? '')
    .trim()
    .toLowerCase();
}

function specKeysEqual(a: string, b: string): boolean {
  return canonicalSpecKey(a) === canonicalSpecKey(b);
}

/** 合并大小写变体键，attrs 并集；返回新 map */
export function canonicalizeLastManualKeepMap(
  map: Record<string, string[]> | undefined,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!map || typeof map !== 'object') return out;
  for (const [rawKey, attrs] of Object.entries(map)) {
    const key = canonicalSpecKey(rawKey);
    if (!key || !Array.isArray(attrs)) continue;
    const merged = [
      ...(out[key] ?? []),
      ...attrs.map(a => String(a ?? '').trim()).filter(Boolean),
    ];
    out[key] = sortAttrValues([...new Set(merged)]);
  }
  return out;
}

function getLastManualKeepForSpec(
  state: ReplicaFamilyCleanupConfig,
  spec: string,
): string[] {
  const map = state.lastManualKeepBySpec ?? {};
  const key = findKeepKeyForSpec(map, spec);
  if (!key) return [];
  // 同 canonical 下可能仍有未规范化的多键：并集
  const canonical = canonicalSpecKey(spec);
  const attrs = new Set<string>();
  for (const [k, list] of Object.entries(map)) {
    if (canonicalSpecKey(k) !== canonical || !Array.isArray(list)) continue;
    for (const a of list) {
      const t = String(a ?? '').trim();
      if (t) attrs.add(t);
    }
  }
  return sortAttrValues([...attrs]);
}

function findKeepKeyForSpec(keepBySpec: Record<string, string[]>, spec: string): string | undefined {
  const canonical = canonicalSpecKey(spec);
  if (!canonical) return undefined;
  if (Object.prototype.hasOwnProperty.call(keepBySpec, canonical)) return canonical;
  for (const key of Object.keys(keepBySpec)) {
    if (canonicalSpecKey(key) === canonical) return key;
  }
  return undefined;
}

function cloneKeepMap(map: Record<string, string[]> | undefined): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, values] of Object.entries(map ?? {})) {
    out[key] = [...values];
  }
  return out;
}

export function emptyReplicaFamilyCleanupRuntime(): ReplicaFamilyCleanupRuntime {
  return {
    roundsSinceCleanup: 0,
    cycleRunCounts: {},
    cycleOpportunityCounts: {},
    cycleScheduleWaitCounts: {},
    lastManualKeepBySpec: {},
    lastCleanupRound: 0,
  };
}

export function pickReplicaFamilyCleanupRuntime(
  cleanup: ReplicaFamilyCleanupConfig | undefined,
): ReplicaFamilyCleanupRuntime {
  if (!cleanup) return emptyReplicaFamilyCleanupRuntime();
  return {
    roundsSinceCleanup: cleanup.roundsSinceCleanup ?? 0,
    cycleRunCounts: { ...(cleanup.cycleRunCounts ?? {}) },
    cycleOpportunityCounts: { ...(cleanup.cycleOpportunityCounts ?? {}) },
    cycleScheduleWaitCounts: { ...(cleanup.cycleScheduleWaitCounts ?? {}) },
    lastManualKeepBySpec: cloneKeepMap(cleanup.lastManualKeepBySpec),
    lastCleanupRound: cleanup.lastCleanupRound ?? 0,
  };
}

/** 有聊天快照运行时时叠上；没有则计数归零，避免沿用脚本级旧计数。 */
export function applyReplicaFamilyCleanupRuntime(
  cleanup: ReplicaFamilyCleanupConfig,
  runtime: ReplicaFamilyCleanupRuntime | undefined,
): void {
  const rt = runtime ?? emptyReplicaFamilyCleanupRuntime();
  cleanup.roundsSinceCleanup = rt.roundsSinceCleanup ?? 0;
  cleanup.cycleRunCounts = { ...(rt.cycleRunCounts ?? {}) };
  cleanup.cycleOpportunityCounts = { ...(rt.cycleOpportunityCounts ?? {}) };
  cleanup.cycleScheduleWaitCounts = { ...(rt.cycleScheduleWaitCounts ?? {}) };
  cleanup.lastManualKeepBySpec = cloneKeepMap(rt.lastManualKeepBySpec);
  cleanup.lastCleanupRound = rt.lastCleanupRound ?? 0;
}

/** 脚本落盘只保留开关与周期，不把本聊天计数写进脚本变量。 */
export function stripReplicaFamilyCleanupRuntime(
  cleanup: ReplicaFamilyCleanupConfig,
): ReplicaFamilyCleanupConfig {
  return {
    ...cleanup,
    ...emptyReplicaFamilyCleanupRuntime(),
  };
}

export function createDefaultReplicaFamilyCleanup(hasReplicaFamily: boolean): ReplicaFamilyCleanupConfig {
  return {
    enabled: hasReplicaFamily,
    cycleRounds: 10,
    minActivityTries: 1,
    mode: hasReplicaFamily ? 'auto' : 'manual',
    ...(hasReplicaFamily ? { defaultsMigrated: true } : {}),
    roundsSinceCleanup: 0,
    cycleRunCounts: {},
    cycleOpportunityCounts: {},
    cycleScheduleWaitCounts: {},
    lastManualKeepBySpec: {},
    lastCleanupRound: 0,
  };
}

export function isReplicaFamilyCleanupAtFactoryDefaults(state: ReplicaFamilyCleanupConfig): boolean {
  return (
    !state.enabled &&
    state.mode === 'manual' &&
    state.cycleRounds === 10 &&
    (state.minActivityTries ?? 1) === 1 &&
    (state.roundsSinceCleanup ?? 0) === 0 &&
    (state.lastCleanupRound ?? 0) === 0 &&
    Object.keys(state.cycleRunCounts ?? {}).length === 0 &&
    Object.keys(state.cycleOpportunityCounts ?? {}).length === 0 &&
    Object.keys(state.cycleScheduleWaitCounts ?? {}).length === 0 &&
    Object.keys(state.lastManualKeepBySpec ?? {}).length === 0 &&
    Object.keys(state.lastManualKeepByRoot ?? {}).length === 0 &&
    state.activityRatio === undefined
  );
}

/** 维持 opportunity ≥ runCount（升级回填 + 不变量） */
export function reconcileOpportunityCountsWithRuns(state: ReplicaFamilyCleanupConfig): void {
  if (!state.cycleOpportunityCounts) state.cycleOpportunityCounts = {};
  if (!state.cycleRunCounts) state.cycleRunCounts = {};
  const ids = new Set([
    ...Object.keys(state.cycleRunCounts),
    ...Object.keys(state.cycleOpportunityCounts),
  ]);
  for (const id of ids) {
    const run = state.cycleRunCounts[id] ?? 0;
    const opp = state.cycleOpportunityCounts[id] ?? 0;
    if (run > opp) state.cycleOpportunityCounts[id] = run;
  }
}

/** 将遗留 activityRatio 迁入 minActivityTries */
export function migrateActivityRatioToMinTries(state: ReplicaFamilyCleanupConfig): void {
  const legacy = state.activityRatio;
  if (legacy !== undefined) {
    // 旧档带 activityRatio：按规则写入（zod 可能已填默认 min=1，仍以 ratio 为准）
    state.minActivityTries = legacy <= 0 ? 0 : 1;
    delete state.activityRatio;
  }
  if (typeof state.minActivityTries !== 'number' || !Number.isFinite(state.minActivityTries) || state.minActivityTries < 0) {
    state.minActivityTries = 1;
  } else {
    state.minActivityTries = Math.floor(state.minActivityTries);
  }
}

/** 将遗留 lastManualKeepByRoot 并入 lastManualKeepBySpec 后删除旧键 */
export function migrateLastManualKeepByRootToSpec(settings: ScriptSettings): void {
  const state = settings.replicaFamilyCleanup;
  if (!state) return;
  if (!state.lastManualKeepBySpec) state.lastManualKeepBySpec = {};
  const legacy = state.lastManualKeepByRoot;
  if (!legacy || typeof legacy !== 'object') {
    delete state.lastManualKeepByRoot;
    state.lastManualKeepBySpec = canonicalizeLastManualKeepMap(state.lastManualKeepBySpec);
    return;
  }
  const bySpec = { ...state.lastManualKeepBySpec };
  for (const [rootId, attrs] of Object.entries(legacy)) {
    if (!Array.isArray(attrs)) continue;
    const root = settings.tasks.find(t => t.id === rootId);
    if (!root) continue;
    const spec = canonicalSpecKey(getReplicaFamilyEnumSpecKey(root));
    if (!spec) continue;
    const merged = [...(bySpec[spec] ?? []), ...attrs.map(a => String(a ?? '').trim()).filter(Boolean)];
    bySpec[spec] = sortAttrValues([...new Set(merged)]);
  }
  state.lastManualKeepBySpec = canonicalizeLastManualKeepMap(bySpec);
  delete state.lastManualKeepByRoot;
}

/** 用户可在设置里改的清理配置字段（不含聊天级周期计数） */
export type ReplicaFamilyCleanupUserConfig = Pick<
  ReplicaFamilyCleanupConfig,
  'enabled' | 'mode' | 'cycleRounds' | 'minActivityTries' | 'defaultsMigrated'
>;

export function pickReplicaFamilyCleanupUserConfig(
  cleanup: ReplicaFamilyCleanupConfig,
): ReplicaFamilyCleanupUserConfig {
  return {
    enabled: cleanup.enabled,
    mode: cleanup.mode,
    cycleRounds: cleanup.cycleRounds,
    minActivityTries: cleanup.minActivityTries,
    defaultsMigrated: cleanup.defaultsMigrated,
  };
}

/** 把磁盘上最新的用户配置覆盖到运行时 settings 上，计数字段保持不变 */
export function applyReplicaFamilyCleanupUserConfig(
  target: ScriptSettings,
  source: ReplicaFamilyCleanupConfig | undefined,
): void {
  if (!source) return;
  if (!target.replicaFamilyCleanup) {
    target.replicaFamilyCleanup = {
      ...createDefaultReplicaFamilyCleanup(false),
      ...pickReplicaFamilyCleanupUserConfig(source),
    };
    return;
  }
  Object.assign(target.replicaFamilyCleanup, pickReplicaFamilyCleanupUserConfig(source));
}

/**
 * 只做规范化与旧档迁移，不改写用户的开关/模式。
 * 读路径（触发判定、计数、候选列表）一律走这里，避免读取时悄悄改写配置。
 */
export function normalizeReplicaFamilyCleanup(settings: ScriptSettings): ReplicaFamilyCleanupConfig {
  const hasReplica = hasReplicaFamilyTasks(settings.tasks);
  if (!settings.replicaFamilyCleanup) {
    settings.replicaFamilyCleanup = createDefaultReplicaFamilyCleanup(hasReplica);
    return settings.replicaFamilyCleanup;
  }
  migrateLastManualKeepByRootToSpec(settings);
  migrateActivityRatioToMinTries(settings.replicaFamilyCleanup);
  settings.replicaFamilyCleanup.lastManualKeepBySpec = canonicalizeLastManualKeepMap(
    settings.replicaFamilyCleanup.lastManualKeepBySpec,
  );
  if (!settings.replicaFamilyCleanup.cycleOpportunityCounts) {
    settings.replicaFamilyCleanup.cycleOpportunityCounts = {};
  }
  if (!settings.replicaFamilyCleanup.cycleScheduleWaitCounts) {
    settings.replicaFamilyCleanup.cycleScheduleWaitCounts = {};
  }
  reconcileOpportunityCountsWithRuns(settings.replicaFamilyCleanup);
  return settings.replicaFamilyCleanup;
}

/**
 * 有副本族任务时，对「从未迁移过」的配置做一次性默认升级：
 * 仍是出厂默认则启用 + 自动；已被用户改过则保持原样。
 * 升级只执行一次（置 defaultsMigrated），之后用户关闭开关不会被改回。
 * 无副本族时不迁移，等首次出现副本族再处理。
 */
export function ensureReplicaFamilyCleanupDefaults(settings: ScriptSettings): ReplicaFamilyCleanupConfig {
  const hadState = !!settings.replicaFamilyCleanup;
  const state = normalizeReplicaFamilyCleanup(settings);
  if (!hadState) return state;
  if (state.defaultsMigrated || !hasReplicaFamilyTasks(settings.tasks)) return state;
  if (isReplicaFamilyCleanupAtFactoryDefaults(state)) {
    state.enabled = true;
    state.mode = 'auto';
  }
  state.defaultsMigrated = true;
  return state;
}

function ensureCleanupState(settings: ScriptSettings): ReplicaFamilyCleanupConfig {
  return normalizeReplicaFamilyCleanup(settings);
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
  const next: Partial<ReplicaFamilyCleanupConfig> = { ...patch };
  if (next.cycleRounds !== undefined) {
    const n = Math.floor(Number(next.cycleRounds));
    next.cycleRounds = Number.isFinite(n) && n >= 1 ? n : state.cycleRounds;
  }
  if (next.minActivityTries !== undefined) {
    const n = Math.floor(Number(next.minActivityTries));
    next.minActivityTries = Number.isFinite(n) && n >= 0 ? n : (state.minActivityTries ?? 1);
  }
  if (next.mode !== undefined && next.mode !== 'auto' && next.mode !== 'manual') {
    next.mode = state.mode;
  }
  if (next.enabled !== undefined) next.enabled = !!next.enabled;
  Object.assign(state, next);
  // 外部显式改过配置，视为用户已确认，不再做默认升级
  state.defaultsMigrated = true;
  return { ...state };
}

export function incrementReplicaRunCounts(settings: ScriptSettings, executedMemberIds: string[]): void {
  if (!executedMemberIds.length) return;
  const state = ensureCleanupState(settings);
  for (const id of executedMemberIds) {
    state.cycleRunCounts[id] = (state.cycleRunCounts[id] ?? 0) + 1;
  }
  reconcileOpportunityCountsWithRuns(state);
}

export function incrementReplicaOpportunityCounts(
  settings: ScriptSettings,
  opportunityMemberIds: string[],
): void {
  if (!opportunityMemberIds.length) return;
  const state = ensureCleanupState(settings);
  for (const id of opportunityMemberIds) {
    state.cycleOpportunityCounts[id] = (state.cycleOpportunityCounts[id] ?? 0) + 1;
  }
}

export function incrementReplicaScheduleWaitCounts(
  settings: ScriptSettings,
  scheduleWaitMemberIds: string[],
): void {
  if (!scheduleWaitMemberIds.length) return;
  const state = ensureCleanupState(settings);
  for (const id of scheduleWaitMemberIds) {
    state.cycleScheduleWaitCounts[id] = (state.cycleScheduleWaitCounts[id] ?? 0) + 1;
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

function isMemberProtectedThisRound(memberId: string, protectMemberIds?: readonly string[]): boolean {
  if (!protectMemberIds?.length) return false;
  return protectMemberIds.includes(memberId);
}

function buildSpecBuckets(
  settings: ScriptSettings,
  protectMemberIds?: readonly string[],
): SpecBucket[] {
  const state = ensureCleanupState(settings);
  const bySpec = new Map<string, SpecBucket>();

  for (const root of settings.tasks) {
    if (!isReplicaFamilyRootTemplate(root) || !root.enabled) continue;
    const spec = canonicalSpecKey(getReplicaFamilyEnumSpecKey(root));
    if (!spec) continue;
    let bucket = bySpec.get(spec);
    if (!bucket) {
      bucket = { spec, roots: [], byAttr: new Map() };
      bySpec.set(spec, bucket);
    }
    bucket.roots.push(root);

    for (const member of getReplicaTasks(root.id, settings.tasks)) {
      const attr = (member.replicaFamilyAttrValue ?? '').trim();
      if (!attr) continue;
      const runCount = state.cycleRunCounts[member.id] ?? 0;
      const opportunityCount = state.cycleOpportunityCounts[member.id] ?? 0;
      const scheduleWaitCount = state.cycleScheduleWaitCounts[member.id] ?? 0;
      const existing = bucket.byAttr.get(attr);
      const launched =
        getReplicaFamilyScheduleMode(root) === 'manual' && isReplicaLaunched(member);
      const protectedMember = isMemberProtectedThisRound(member.id, protectMemberIds);
      if (!existing) {
        bucket.byAttr.set(attr, {
          attrValue: attr,
          runCountMax: runCount,
          opportunityCountMax: opportunityCount,
          scheduleWaitCountMax: scheduleWaitCount,
          anyLaunched: launched,
          anyProtected: protectedMember,
          displayName: member.name,
        });
      } else {
        existing.runCountMax = Math.max(existing.runCountMax, runCount);
        existing.opportunityCountMax = Math.max(existing.opportunityCountMax, opportunityCount);
        existing.scheduleWaitCountMax = Math.max(existing.scheduleWaitCountMax, scheduleWaitCount);
        existing.anyLaunched = existing.anyLaunched || launched;
        existing.anyProtected = existing.anyProtected || protectedMember;
      }
    }
  }

  return [...bySpec.values()];
}

function isAttrKeepByScheduleAndActivity(
  agg: AttrAgg,
  minActivityTries: number,
): boolean {
  if (agg.anyProtected) return true;
  if (agg.anyLaunched) return true;
  if (agg.scheduleWaitCountMax > 0) return true;
  return agg.opportunityCountMax >= minActivityTries;
}

function isAttrManualDialogDefault(
  agg: AttrAgg,
  minActivityTries: number,
  lastManualKeep: string[],
): boolean {
  if (agg.anyProtected) return true;
  if (lastManualKeep.includes(agg.attrValue)) return true;
  return isAttrKeepByScheduleAndActivity(agg, minActivityTries);
}

function collectKeepAttrsForBucket(
  bucket: SpecBucket,
  shouldKeep: (agg: AttrAgg) => boolean,
): string[] {
  const keep: string[] = [];
  for (const agg of bucket.byAttr.values()) {
    if (shouldKeep(agg)) keep.push(agg.attrValue);
  }
  return sortAttrValues(keep);
}

/** 每个有副本族根的 enumSpec 都有键（可为空数组） */
export function computeAutoKeepSet(
  settings: ScriptSettings,
  protectMemberIds?: readonly string[],
): Record<string, string[]> {
  const state = ensureCleanupState(settings);
  const result: Record<string, string[]> = {};
  for (const bucket of buildSpecBuckets(settings, protectMemberIds)) {
    result[bucket.spec] = collectKeepAttrsForBucket(bucket, agg =>
      isAttrKeepByScheduleAndActivity(agg, state.minActivityTries ?? 1),
    );
  }
  return result;
}

export function computeManualDialogDefaultSelection(
  settings: ScriptSettings,
  protectMemberIds?: readonly string[],
): Record<string, string[]> {
  const state = ensureCleanupState(settings);
  const result: Record<string, string[]> = {};
  for (const bucket of buildSpecBuckets(settings, protectMemberIds)) {
    const lastManualKeep = getLastManualKeepForSpec(state, bucket.spec);
    result[bucket.spec] = collectKeepAttrsForBucket(bucket, agg =>
      isAttrManualDialogDefault(agg, state.minActivityTries ?? 1, lastManualKeep),
    );
  }
  return result;
}

/** @deprecated 使用 computeManualDialogDefaultSelection */
export function computeDefaultSelection(
  settings: ScriptSettings,
  protectMemberIds?: readonly string[],
): Record<string, string[]> {
  return computeManualDialogDefaultSelection(settings, protectMemberIds);
}

export function listReplicaFamilyCleanupCandidates(
  settings: ScriptSettings,
  protectMemberIds?: readonly string[],
): ReplicaCleanupCandidateGroup[] {
  const state = ensureCleanupState(settings);
  const groups: ReplicaCleanupCandidateGroup[] = [];
  for (const bucket of buildSpecBuckets(settings, protectMemberIds)) {
    const lastManualKeep = getLastManualKeepForSpec(state, bucket.spec);
    const members: ReplicaCleanupCandidate[] = sortAttrValues([...bucket.byAttr.keys()]).map(attr => {
      const agg = bucket.byAttr.get(attr)!;
      return {
        memberId: attr,
        attrValue: attr,
        name: agg.displayName,
        launched: agg.anyLaunched,
        runCount: agg.runCountMax,
        opportunityCount: agg.opportunityCountMax,
        scheduleWaitCount: agg.scheduleWaitCountMax,
        defaultSelected: isAttrManualDialogDefault(
          agg,
          state.minActivityTries ?? 1,
          lastManualKeep,
        ),
      };
    });
    groups.push({ spec: bucket.spec, members });
  }
  return groups;
}

function readTagContainerRaw(variables: Record<string, unknown>): TagContainerRaw {
  const raw = variables[TAG_DATA_ROOT_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return { ...(raw as TagContainerRaw) };
}

/**
 * post_process_tags 的分组键/扁平键由占位符原大小写写入，而清理侧的 spec 经 canonicalSpecKey 已小写，
 * 因此按 tag/attr 名大小写不敏感匹配（attrValue 仍区分大小写）。
 */
function findMatchingGroupKeys(raw: TagContainerRaw, groupKey: string): string[] {
  const target = groupKey.toLowerCase();
  return Object.keys(raw).filter(k => k.toLowerCase() === target);
}

function findMatchingFlatKeys(
  raw: TagContainerRaw,
  tagName: string,
  attrName: string,
  attrValue: string,
): string[] {
  const prefix = `${tagName}@${attrName}=`.toLowerCase();
  return Object.keys(raw).filter(k => k.toLowerCase().startsWith(prefix) && k.slice(prefix.length) === attrValue);
}

export function pruneFloorTagKeysForReplica(
  spec: string,
  attrValuesToRemove: string[],
  messageId: number,
): void {
  if (!attrValuesToRemove.length) return;
  if (!isAccessibleMessageFloor(messageId)) return;
  const parsed = parseExtractTagSpec(spec);
  if (!parsed?.attrName) return;
  const groupKey = buildAttrGroupKey(parsed.tagName, parsed.attrName);
  const removeSet = new Set(attrValuesToRemove);

  updateVariablesWith(
    variables => {
      const raw = readTagContainerRaw(variables);
      for (const key of findMatchingGroupKeys(raw, groupKey)) {
        const existing = raw[key];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) continue;
        const merged = { ...(existing as Record<string, string>) };
        for (const k of Object.keys(merged)) {
          if (removeSet.has(k)) delete merged[k];
        }
        if (Object.keys(merged).length) {
          raw[key] = merged;
        } else {
          delete raw[key];
        }
      }
      for (const attrValue of attrValuesToRemove) {
        for (const flatKey of findMatchingFlatKeys(raw, parsed.tagName, parsed.attrName!, attrValue)) {
          delete raw[flatKey];
        }
      }
      variables[TAG_DATA_ROOT_KEY] = raw;
      return variables;
    },
    { type: 'message', message_id: messageId },
  );
}

/**
 * 将当前楼 post_process_tags 中某 spec 的 attrValue 从 from 迁到 to（nested + flat）。
 * 目标键已存在时跳过（不覆盖）；返回是否发生了迁移。
 */
export function readFloorTagContainerRaw(messageId: number): TagContainerRaw {
  if (!isAccessibleMessageFloor(messageId)) return {};
  try {
    const variables = getVariables({ type: 'message', message_id: messageId });
    return readTagContainerRaw(variables);
  } catch {
    return {};
  }
}

function attrValueExistsInTagContainer(
  raw: TagContainerRaw,
  tagName: string,
  attrName: string,
  attrValue: string,
): boolean {
  for (const key of findMatchingGroupKeys(raw, buildAttrGroupKey(tagName, attrName))) {
    const existing = raw[key];
    if (
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      Object.prototype.hasOwnProperty.call(existing as Record<string, string>, attrValue)
    ) {
      return true;
    }
  }
  return findMatchingFlatKeys(raw, tagName, attrName, attrValue).length > 0;
}

/** 只读 preflight：from 存在且 to 已在 nested/flat 任一处存在则不可迁移 */
export function canMigrateFloorTagKeysForReplica(
  spec: string,
  fromAttr: string,
  toAttr: string,
  messageId: number,
): boolean {
  const from = String(fromAttr ?? '').trim();
  const to = String(toAttr ?? '').trim();
  if (!from || !to || from === to) return true;
  if (!isAccessibleMessageFloor(messageId)) return true;
  const parsed = parseExtractTagSpec(spec);
  if (!parsed?.attrName) return true;

  const raw = readFloorTagContainerRaw(messageId);
  if (!attrValueExistsInTagContainer(raw, parsed.tagName, parsed.attrName, from)) return true;

  return !attrValueExistsInTagContainer(raw, parsed.tagName, parsed.attrName, to);
}

/** 只读：当前楼 post_process_tags 是否含 from 键 */
export function floorTagFromExistsForReplica(
  spec: string,
  fromAttr: string,
  messageId: number,
): boolean {
  const from = String(fromAttr ?? '').trim();
  if (!from || !isAccessibleMessageFloor(messageId)) return false;
  const parsed = parseExtractTagSpec(spec);
  if (!parsed?.attrName) return false;
  const raw = readFloorTagContainerRaw(messageId);
  return attrValueExistsInTagContainer(raw, parsed.tagName, parsed.attrName, from);
}

export function migrateFloorTagKeysForReplica(
  spec: string,
  fromAttr: string,
  toAttr: string,
  messageId: number,
): boolean {
  const from = String(fromAttr ?? '').trim();
  const to = String(toAttr ?? '').trim();
  if (!from || !to || from === to) return false;
  if (!isAccessibleMessageFloor(messageId)) return false;
  const parsed = parseExtractTagSpec(spec);
  if (!parsed?.attrName) return false;
  const tagName = parsed.tagName;
  const attrName = parsed.attrName;
  const groupKey = buildAttrGroupKey(tagName, attrName);
  let migrated = false;

  updateVariablesWith(
    variables => {
      const raw = readTagContainerRaw(variables);
      let changed = false;

      for (const key of findMatchingGroupKeys(raw, groupKey)) {
        const existing = raw[key];
        if (!existing || typeof existing !== 'object' || Array.isArray(existing)) continue;
        const merged = { ...(existing as Record<string, string>) };
        if (Object.prototype.hasOwnProperty.call(merged, from)) {
          if (!Object.prototype.hasOwnProperty.call(merged, to)) {
            merged[to] = merged[from]!;
            delete merged[from];
            changed = true;
          }
        }
        if (Object.keys(merged).length) {
          raw[key] = merged;
        } else {
          delete raw[key];
        }
      }

      const flatToExists = findMatchingFlatKeys(raw, tagName, attrName, to).length > 0;
      const flatFromKeys = findMatchingFlatKeys(raw, tagName, attrName, from);
      if (flatFromKeys.length && !flatToExists) {
        const fromKey = flatFromKeys[0]!;
        // 保持原键的 tag/attr 大小写，只替换末尾的 attrValue
        const toKey = `${fromKey.slice(0, fromKey.length - from.length)}${to}`;
        raw[toKey] = raw[fromKey];
        for (const k of flatFromKeys) delete raw[k];
        changed = true;
      }

      if (changed) {
        variables[TAG_DATA_ROOT_KEY] = raw;
        migrated = true;
      }
      return variables;
    },
    { type: 'message', message_id: messageId },
  );

  return migrated;
}

/** 将 cleanup 记忆中某 spec 的 attrValue from→to */
export function remapLastManualKeepAttrValue(
  settings: ScriptSettings,
  spec: string,
  fromAttr: string,
  toAttr: string,
): void {
  const from = String(fromAttr ?? '').trim();
  const to = String(toAttr ?? '').trim();
  if (!from || !to || from === to) return;
  const state = normalizeReplicaFamilyCleanup(settings);
  const key = findKeepKeyForSpec(state.lastManualKeepBySpec ?? {}, spec);
  if (!key) return;
  const list = state.lastManualKeepBySpec![key];
  if (!Array.isArray(list) || !list.length) return;
  const next = sortAttrValues([
    ...new Set(list.map(v => (String(v).trim() === from ? to : v)).filter(Boolean)),
  ]);
  if (!next.length) {
    delete state.lastManualKeepBySpec![key];
  } else {
    state.lastManualKeepBySpec![key] = next;
  }
  state.lastManualKeepBySpec = canonicalizeLastManualKeepMap(state.lastManualKeepBySpec);
}

function collectExtractSpecsFromMembers(members: PostProcessTask[]): string[] {
  const specs = new Set<string>();
  for (const member of members) {
    for (const tag of member.extractInjectTags ?? []) {
      const parsed = parseExtractTagSpec(String(tag ?? '').trim());
      if (!parsed?.attrName) continue;
      specs.add(canonicalSpecKey(`${parsed.tagName}@${parsed.attrName}`));
    }
  }
  return [...specs];
}

export type RemovedReplicaCleanupInfo = {
  rootId: string;
  spec: string;
  attrValues: string[];
};

export type ReplicaCleanupSnapshotEffect = {
  authoritativeRootIds: string[];
  removedAttrByRoot: Record<string, string[]>;
  /** keep 被清空的 spec，世界书包裹条目一并墓碑 */
  clearedSpecs: string[];
};

export type ApplyReplicaFamilyCleanupOptions = {
  persistManualKeepBySpec?: Record<string, string[]>;
  /** 清理后是否重置清理周期计数；默认 true。用户手动删单个副本时传 false，避免打断周期 */
  resetCycle?: boolean;
  /** 输出：本次清理实际移除的副本（供世界书条目/账本联动清理） */
  removedOut?: RemovedReplicaCleanupInfo[];
  /** 输出：最新一楼副本快照要盖住旧楼的根与被删属性 */
  snapshotEffect?: ReplicaCleanupSnapshotEffect;
};

function resolveTagPruneFloor(fallback: number): number {
  return findLatestAccessibleFloorId() ?? fallback;
}

export function applyReplicaFamilyCleanup(
  settings: ScriptSettings,
  keepAttrValuesBySpec: Record<string, string[]>,
  messageId: number,
  options?: ApplyReplicaFamilyCleanupOptions,
): ScriptSettings {
  const state = ensureCleanupState(settings);
  let tasks = [...settings.tasks];
  const buckets = buildSpecBuckets(settings);
  const tagFloor = resolveTagPruneFloor(messageId);
  const snapshotEffect = options?.snapshotEffect;
  if (snapshotEffect) {
    snapshotEffect.authoritativeRootIds = [];
    snapshotEffect.removedAttrByRoot = {};
    snapshotEffect.clearedSpecs = [];
  }

  for (const bucket of buckets) {
    const keepKey = findKeepKeyForSpec(keepAttrValuesBySpec, bucket.spec);
    // 未出现在 keep 表中的 spec 视为「本次不处理」
    if (keepKey === undefined) continue;
    const keepSet = new Set(keepAttrValuesBySpec[keepKey] ?? []);
    const removedAttrs = new Set<string>();
    const removeMemberIds: string[] = [];
    const removedMembers: PostProcessTask[] = [];

    for (const root of bucket.roots) {
      for (const member of getReplicaTasks(root.id, tasks)) {
        const attr = (member.replicaFamilyAttrValue ?? '').trim();
        if (!attr || keepSet.has(attr)) continue;
        removedAttrs.add(attr);
        removeMemberIds.push(member.id);
        removedMembers.push(member);
      }
    }

    if (!removeMemberIds.length) continue;

    const removedAttrList = sortAttrValues([...removedAttrs]);
    pruneFloorTagKeysForReplica(bucket.spec, removedAttrList, tagFloor);

    const extractSpecs = collectExtractSpecsFromMembers(removedMembers).filter(
      s => !specKeysEqual(s, bucket.spec),
    );
    for (const extractSpec of extractSpecs) {
      pruneFloorTagKeysForReplica(extractSpec, removedAttrList, tagFloor);
    }

    if (snapshotEffect) {
      if (keepSet.size === 0) snapshotEffect.clearedSpecs.push(bucket.spec);
      for (const root of bucket.roots) {
        if (!snapshotEffect.authoritativeRootIds.includes(root.id)) {
          snapshotEffect.authoritativeRootIds.push(root.id);
        }
        const prev = snapshotEffect.removedAttrByRoot[root.id] ?? [];
        snapshotEffect.removedAttrByRoot[root.id] = sortAttrValues([...prev, ...removedAttrList]);
      }
    }

    tasks = tasks.filter(t => !removeMemberIds.includes(t.id));
    for (const id of removeMemberIds) {
      delete state.cycleRunCounts[id];
      delete state.cycleOpportunityCounts[id];
      delete state.cycleScheduleWaitCounts[id];
    }

    const primaryRootId = bucket.roots[0]?.id ?? '';
    options?.removedOut?.push({
      rootId: primaryRootId,
      spec: bucket.spec,
      attrValues: removedAttrList,
    });
    for (const extractSpec of extractSpecs) {
      options?.removedOut?.push({
        rootId: primaryRootId,
        spec: extractSpec,
        attrValues: removedAttrList,
      });
    }
  }

  if (options?.persistManualKeepBySpec) {
    const patched = { ...(state.lastManualKeepBySpec ?? {}) };
    for (const [spec, attrs] of Object.entries(options.persistManualKeepBySpec)) {
      const key = canonicalSpecKey(spec);
      if (!key) continue;
      patched[key] = [...attrs];
    }
    state.lastManualKeepBySpec = canonicalizeLastManualKeepMap(patched);
  }

  if (options?.resetCycle !== false) {
    state.roundsSinceCleanup = 0;
    state.cycleRunCounts = {};
    state.cycleOpportunityCounts = {};
    state.cycleScheduleWaitCounts = {};
    state.lastCleanupRound = countAssistantRounds();
  }

  return { ...settings, tasks };
}

/** 某 enumSpec 下各族全部现有 attr 的并集 */
export function listAllAttrValuesForEnumSpec(settings: ScriptSettings, enumSpec: string): string[] {
  const target = canonicalSpecKey(enumSpec);
  if (!target) return [];
  const attrs = new Set<string>();
  for (const bucket of buildSpecBuckets(settings)) {
    if (bucket.spec !== target) continue;
    for (const attr of bucket.byAttr.keys()) attrs.add(attr);
  }
  return sortAttrValues([...attrs]);
}

export function resetReplicaFamilyCleanupCycle(settings: ScriptSettings): void {
  const state = ensureCleanupState(settings);
  state.roundsSinceCleanup = 0;
  state.cycleRunCounts = {};
  state.cycleOpportunityCounts = {};
  state.cycleScheduleWaitCounts = {};
}
