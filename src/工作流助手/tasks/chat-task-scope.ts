import {
  CHAT_SCOPE_METADATA_KEY,
  CHAT_SNAPSHOT_PRESET_NAME,
  ChatTaskScopeStateSchema,
  PostProcessPresetSchema,
  type ChatTaskScopeState,
  type PostProcessPreset,
  type ScriptSettings,
} from './schema';

type SillyTavernContext = {
  chatMetadata: Record<string, unknown>;
  updateChatMetadata: (new_values: Record<string, unknown>, reset: boolean) => void;
  saveChat: () => Promise<void>;
};

export function getStContext(): SillyTavernContext | null {
  try {
    const ctx = (
      window.parent as Window & { SillyTavern?: { getContext?: () => SillyTavernContext } }
    ).SillyTavern?.getContext?.();
    return ctx ?? null;
  } catch {
    return null;
  }
}

export function buildChatSnapshotFromSettings(settings: ScriptSettings): PostProcessPreset {
  return PostProcessPresetSchema.parse({
    name: CHAT_SNAPSHOT_PRESET_NAME,
    tasks: _.cloneDeep(settings.tasks),
    finalInjectTemplate: settings.finalInjectTemplate,
    tagVariableInjectTemplate: settings.tagVariableInjectTemplate,
    chatExtractTags: _.cloneDeep(settings.chatExtractTags ?? { user: [], assistant: [] }),
    chatBodyTagReplaceRules: _.cloneDeep(settings.chatBodyTagReplaceRules ?? []),
    chatWorldbookWriteRules: _.cloneDeep(settings.chatWorldbookWriteRules ?? []),
    contextTurnCount: settings.contextTurnCount,
    contextExtractRules: _.cloneDeep(settings.contextExtractRules),
    contextExcludeRules: _.cloneDeep(settings.contextExcludeRules),
    plotWorldbookConfig: _.cloneDeep(settings.plotWorldbookConfig),
    taskPlotWorldbookOverridesEnabled: settings.taskPlotWorldbookOverridesEnabled ?? false,
    taskContextOverridesEnabled: settings.taskContextOverridesEnabled ?? false,
  });
}

export function isChatOverrideActive(scope?: ChatTaskScopeState | null): boolean {
  return scope?.mode === 'chat_override' && !!scope.snapshot;
}

export function readChatTaskScope(): ChatTaskScopeState | null {
  const ctx = getStContext();
  if (!ctx) return null;
  const raw = ctx.chatMetadata?.[CHAT_SCOPE_METADATA_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const parsed = ChatTaskScopeStateSchema.safeParse(raw);
  if (!parsed.success) return null;
  if (!isChatOverrideActive(parsed.data)) return null;
  return parsed.data;
}

async function persistChatMetadata(scope: ChatTaskScopeState | null): Promise<void> {
  const ctx = getStContext();
  if (!ctx) return;
  if (scope && isChatOverrideActive(scope)) {
    ctx.updateChatMetadata({ [CHAT_SCOPE_METADATA_KEY]: _.cloneDeep(scope) }, false);
  } else {
    const next = { ...ctx.chatMetadata };
    delete next[CHAT_SCOPE_METADATA_KEY];
    ctx.updateChatMetadata(next, true);
  }
  try {
    await ctx.saveChat();
  } catch (error) {
    console.warn('[工作流助手] 保存聊天快照到 chat 文件失败:', error);
  }
}

export async function writeChatTaskScope(
  state: ChatTaskScopeState,
  options?: { skipSave?: boolean },
): Promise<ChatTaskScopeState | null> {
  const normalized = ChatTaskScopeStateSchema.parse(state);
  if (!isChatOverrideActive(normalized)) {
    await clearChatTaskScope({ skipSave: options?.skipSave });
    return null;
  }
  if (!options?.skipSave) {
    await persistChatMetadata(normalized);
  } else {
    const ctx = getStContext();
    ctx?.updateChatMetadata({ [CHAT_SCOPE_METADATA_KEY]: _.cloneDeep(normalized) }, false);
  }
  return normalized;
}

export async function clearChatTaskScope(options?: { skipSave?: boolean }): Promise<void> {
  if (!options?.skipSave) {
    await persistChatMetadata(null);
  } else {
    const ctx = getStContext();
    if (ctx) {
      const next = { ...ctx.chatMetadata };
      delete next[CHAT_SCOPE_METADATA_KEY];
      ctx.updateChatMetadata(next, true);
    }
  }
}

export async function ensureChatOverride(
  settings: ScriptSettings,
  source: 'api' | 'ui',
): Promise<ChatTaskScopeState> {
  const existing = readChatTaskScope();
  if (existing?.snapshot) {
    return existing;
  }
  const snapshot = buildChatSnapshotFromSettings(settings);
  const state = ChatTaskScopeStateSchema.parse({
    mode: 'chat_override',
    snapshot,
    originPresetName: settings.activePresetName || '',
    updatedAt: Date.now(),
    source,
  });
  await writeChatTaskScope(state);
  return state;
}
