import { getAddonArchive } from './archive';
import {
  applyCreateWorld,
  applyRenameWorld,
  applySetSingularityDescent,
  applySetWorldDescent,
  applySetWorldParallel,
} from './control';
import { AddonEvent } from './events';
import {
  applyAddonUpdateFromMessage,
  ensureAddonData,
  getAddonData as getAddonDataFromStore,
  hasChatMessages,
  parseAddonMessage,
  processFloor as processFloorInternal,
  resolveMessageId,
  writeAddonData,
} from './store';
import { stripAddonHiddenFieldsForDisplay } from './display';
import { syncReplicaLaunched } from './replica-sync';
import { AddonData, DEFAULT_ADDON_DATA, normalizeAddonData } from './schema';
import { getAddonUi, writeAddonUi, type AddonUiState, type AddonUiTheme } from './ui-state';
import { wrapAddonData, AddonWrapper } from './update';

type AddonMessageOption = Extract<VariableOption, { type: 'message' }>;

function resolveAddonMessageId(option: AddonMessageOption): number {
  return resolveMessageId(option.message_id);
}

function requireFloorData(message_id: number): AddonData {
  return getAddonDataFromStore(message_id) ?? ensureAddonData(message_id);
}

export const Addon = {
  events: AddonEvent,

  getAddonData(options: AddonMessageOption): AddonWrapper {
    if (!hasChatMessages()) {
      return wrapAddonData(DEFAULT_ADDON_DATA);
    }
    const message_id = resolveAddonMessageId(options);
    const addon_data = getAddonDataFromStore(message_id) ?? DEFAULT_ADDON_DATA;
    return wrapAddonData(addon_data);
  },

  /** 供提示词/世界书使用的 addon 快照 */
  getDisplayAddonData(options: AddonMessageOption): AddonWrapper {
    if (!hasChatMessages()) {
      return wrapAddonData(DEFAULT_ADDON_DATA);
    }
    const message_id = resolveAddonMessageId(options);
    const addon_data = getAddonDataFromStore(message_id) ?? DEFAULT_ADDON_DATA;
    return wrapAddonData(normalizeAddonData(stripAddonHiddenFieldsForDisplay(addon_data)) as AddonData);
  },

  replaceAddonData(data: AddonWrapper, options: AddonMessageOption): void {
    if (!hasChatMessages()) {
      return;
    }
    const message_id = resolveAddonMessageId(options);
    writeAddonData(message_id, normalizeAddonData(data.addon_data));
  },

  parseMessage(message: string, old_data: AddonWrapper): Promise<AddonWrapper | undefined> {
    return parseAddonMessage(message, old_data.addon_data).then(updated =>
      updated === undefined ? undefined : wrapAddonData(updated),
    );
  },

  processFloor(message_id?: number | 'latest'): Promise<void> {
    const resolved = message_id === undefined ? getLastMessageId() : resolveMessageId(message_id);
    return processFloorInternal(resolved);
  },

  applyAddonUpdateFromMessage,
  ensureAddonData,

  getArchive(options: AddonMessageOption = { type: 'message', message_id: 'latest' }) {
    if (!hasChatMessages()) {
      return { activeKey: null, snapshots: {} };
    }
    return getAddonArchive(resolveAddonMessageId(options));
  },

  getUiState(options: AddonMessageOption = { type: 'message', message_id: 'latest' }): AddonUiState {
    if (!hasChatMessages()) {
      return { 位面交汇: false, theme: 'light' };
    }
    return getAddonUi(resolveAddonMessageId(options));
  },

  setUiState(patch: Partial<AddonUiState>, options: AddonMessageOption = { type: 'message', message_id: 'latest' }): AddonUiState {
    if (!hasChatMessages()) {
      return { 位面交汇: false, theme: 'light', ...patch };
    }
    const message_id = resolveAddonMessageId(options);
    const next = { ...getAddonUi(message_id), ...patch };
    writeAddonUi(message_id, next);
    return next;
  },

  setTheme(theme: AddonUiTheme, options?: AddonMessageOption): AddonUiState {
    return Addon.setUiState({ theme }, options ?? { type: 'message', message_id: 'latest' });
  },

  setPlaneMerge(value: boolean, options?: AddonMessageOption): AddonUiState {
    return Addon.setUiState({ 位面交汇: value }, options ?? { type: 'message', message_id: 'latest' });
  },

  async setSingularityDescent(
    world: string,
    name: string,
    value: boolean,
    options: AddonMessageOption = { type: 'message', message_id: 'latest' },
  ) {
    const message_id = resolveAddonMessageId(options);
    return applySetSingularityDescent(message_id, world, name, value, requireFloorData, writeAddonData);
  },

  async setWorldDescent(
    world: string,
    value: boolean,
    options: AddonMessageOption = { type: 'message', message_id: 'latest' },
  ) {
    const message_id = resolveAddonMessageId(options);
    return applySetWorldDescent(message_id, world, value, requireFloorData, writeAddonData);
  },

  async setWorldParallel(
    world: string,
    value: boolean,
    options: AddonMessageOption = { type: 'message', message_id: 'latest' },
  ) {
    const message_id = resolveAddonMessageId(options);
    return applySetWorldParallel(message_id, world, value, requireFloorData, writeAddonData);
  },

  async createWorld(name: string, options: AddonMessageOption = { type: 'message', message_id: 'latest' }) {
    const message_id = resolveAddonMessageId(options);
    return applyCreateWorld(message_id, name, requireFloorData, writeAddonData);
  },

  async renameWorld(
    oldName: string,
    newName: string,
    options: AddonMessageOption = { type: 'message', message_id: 'latest' },
  ) {
    const message_id = resolveAddonMessageId(options);
    return applyRenameWorld(message_id, oldName, newName, requireFloorData, writeAddonData);
  },

  async syncReplicaLaunched(options: AddonMessageOption = { type: 'message', message_id: 'latest' }) {
    if (!hasChatMessages()) return [] as string[];
    const message_id = resolveAddonMessageId(options);
    return syncReplicaLaunched(requireFloorData(message_id));
  },
} as const;

export type { AddonData, AddonWrapper };
