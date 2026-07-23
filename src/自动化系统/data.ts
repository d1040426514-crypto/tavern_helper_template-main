import { buildChronicle, parseNpcBlock, parsePreview } from './parse';
import type { ChronicleData, NpcCard } from './types';

export const PREVIEW_TAG = '后台角色交互预演';
export const NPC_ACT_GROUP = 'npc_act';
export const NPC_ACT_SPEC = 'npc@act';
export const REPLICA_STATE_KEY = '_post_process_replica_state';

type ReplicaRootState = {
  attrValues?: string[];
  launchedAttrValues?: string[];
  lastEnumAttrValues?: string[];
};

type ReplicaTask = {
  id: string;
  replicaFamilyRootId?: string;
  replicaFamilySpec?: string;
  replicaFamilyEnumSpec?: string;
  replicaFamilyScheduleMode?: 'auto' | 'manual';
};

type ReplicaApi = {
  listTasks: () => ReplicaTask[];
};

export type ChronicleSources = {
  previewRaw: string;
  npcByName: Record<string, string>;
  launchedNames: string[] | null;
};

function getReplicaApi(): ReplicaApi | null {
  try {
    const parentWin = window.parent as Window & { AcuPostProcessAPI?: ReplicaApi };
    const api = parentWin?.AcuPostProcessAPI;
    if (api && typeof api.listTasks === 'function') return api;
  } catch {
    /* cross-origin / unavailable */
  }
  return null;
}

function findNpcActRoot(api: ReplicaApi | null): ReplicaTask | null {
  if (!api) return null;
  const spec = NPC_ACT_SPEC.toLowerCase();
  return (
    api.listTasks().find(t => {
      if (t.replicaFamilyRootId) return false;
      const a = String(t.replicaFamilyEnumSpec || t.replicaFamilySpec || '')
        .trim()
        .toLowerCase();
      return a === spec;
    }) ?? null
  );
}

function listLastLaunched(
  root: ReplicaTask,
  snapshot: Record<string, ReplicaRootState>,
): string[] {
  const state = snapshot[root.id];
  if (!state) return [];
  const launched = (state.launchedAttrValues ?? []).map(v => String(v).trim()).filter(Boolean);
  const enums = (state.lastEnumAttrValues ?? []).map(v => String(v).trim()).filter(Boolean);
  const mode = root.replicaFamilyScheduleMode ?? 'auto';
  const primary = mode === 'manual' ? launched : enums;
  const fallback = mode === 'manual' ? enums : launched;
  const chosen = primary.length ? primary : fallback;
  return [...new Set(chosen)];
}

/** 从 post_process_tags 扁平/嵌套读取全部 npc@act=* 内文 */
export function flattenNpcActTags(tags: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const group = tags[NPC_ACT_GROUP];
  if (group && typeof group === 'object' && !Array.isArray(group)) {
    for (const [attr, block] of Object.entries(group as Record<string, unknown>)) {
      const text = String(block ?? '').trim();
      if (text) out[attr] = text;
    }
  }
  for (const [k, v] of Object.entries(tags)) {
    const m = /^npc@act=(.+)$/i.exec(k);
    if (!m) continue;
    const name = String(m[1] ?? '').trim();
    const text = String(v ?? '').trim();
    if (name && text && !out[name]) out[name] = text;
  }
  return out;
}

function readReplicaSnapshot(messageId: number): Record<string, ReplicaRootState> {
  try {
    const msgs = getChatMessages(messageId);
    const data = (msgs?.[0] as { data?: Record<string, unknown> } | undefined)?.data;
    const raw = data?.[REPLICA_STATE_KEY];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return raw as Record<string, ReplicaRootState>;
  } catch {
    return {};
  }
}

/**
 * 读取本楼 chronicle 原始素材。
 * launchedNames === null 表示无法取得 last-launched 名单，调用方应回退为角色集交集。
 */
export function readChronicleSources(messageId?: number): ChronicleSources {
  const mid = messageId ?? (() => {
    try {
      return getCurrentMessageId();
    } catch {
      return -1;
    }
  })();

  let previewRaw = '';
  let npcByName: Record<string, string> = {};
  let launchedNames: string[] | null = null;

  try {
    const vars = getVariables({ type: 'message', message_id: mid }) ?? {};
    const tags = (vars.post_process_tags ?? {}) as Record<string, unknown>;
    previewRaw = String(tags[PREVIEW_TAG] ?? '').trim();
    npcByName = flattenNpcActTags(tags);
  } catch {
    /* ignore */
  }

  try {
    const api = getReplicaApi();
    const root = findNpcActRoot(api);
    if (root) {
      const snap = readReplicaSnapshot(mid);
      const list = listLastLaunched(root, snap);
      if (list.length) launchedNames = list;
    }
  } catch {
    /* ignore */
  }

  return { previewRaw, npcByName, launchedNames };
}

/** 按 last-launched 过滤；无名单时保留全部（再由角色集裁剪） */
export function filterNpcByLaunched(
  npcByName: Record<string, string>,
  launchedNames: string[] | null,
): Record<string, string> {
  if (!launchedNames || !launchedNames.length) return { ...npcByName };
  const allow = new Set(launchedNames);
  const out: Record<string, string> = {};
  for (const [name, body] of Object.entries(npcByName)) {
    if (allow.has(name)) out[name] = body;
  }
  return out;
}

export function loadChronicle(messageId?: number): ChronicleData {
  const { previewRaw, npcByName, launchedNames } = readChronicleSources(messageId);
  const preview = parsePreview(previewRaw);
  const filtered = filterNpcByLaunched(npcByName, launchedNames);
  return buildChronicle(preview, filtered);
}

export function hasChronicleSource(messageId?: number): boolean {
  const { previewRaw, npcByName } = readChronicleSources(messageId);
  return !!previewRaw || Object.keys(npcByName).length > 0;
}

/** 供测试：内文 → NpcCard 映射 */
export function parseNpcMap(npcByName: Record<string, string>): Record<string, NpcCard> {
  const out: Record<string, NpcCard> = {};
  for (const [name, body] of Object.entries(npcByName)) {
    out[name] = parseNpcBlock(body, name);
  }
  return out;
}
