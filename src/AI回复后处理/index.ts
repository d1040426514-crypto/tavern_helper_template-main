import './ui/acu-theme.css';
import { reloadOnChatChange } from '@util/script';
import { mountAcuPostProcessAPI } from './bridge/post-process-api';
import { getCurrentChatKey } from './api/chat-key';
import { readChatTaskScope } from './tasks/chat-task-scope';
import { emitChatScopeChanged } from './tasks/events';
import { applyInjectVariableUpdates } from './tasks/inject-variable-update';
import { registerTrigger, rerunCurrentFloor } from './tasks/trigger';
import { registerTagVariableInheritance } from './tasks/tag-variables';
import {
  debugStopMvuEndedListener,
  getLastDeferDispatch,
} from './tasks/mvu-trigger-defer';
import { normalizeGameTimeRaw, parseGameTimeToMs } from './tasks/parse-game-time';
import { getLastPromptMessages, getLastPlaceholderVars } from './tasks/runtime';
import { openSettingsWindow, closeSettingsWindow } from './ui/mount-ui';
import { registerExtensionsMenuEntry } from './ui/extensions-menu';
import { loadSettings } from './settings';
import { updateGlobalTheme } from './ui/theme';
import { ensureAcuToastStyles } from './ui/toast-styles';
import { acuToast } from './ui/toast';

export const RERUN_BUTTON_NAME = '重跑后处理任务';

updateGlobalTheme(loadSettings().uiThemeId);
ensureAcuToastStyles();

let scriptReady = false;

function handleOpenSettings(): void {
  if (!scriptReady) {
    acuToast('warning', '「AI 回复后处理」脚本仍在加载，请稍候几秒后再点击');
    return;
  }
  try {
    openSettingsWindow();
  } catch (error) {
    console.error('[AI回复后处理] 打开设置失败:', error);
    acuToast('error', `打开设置失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

$(() => {
  const menuEntry = registerExtensionsMenuEntry(handleOpenSettings);
  scriptReady = true;

  appendInexistentScriptButtons([{ name: RERUN_BUTTON_NAME, visible: true }]);
  eventOn(getButtonEvent(RERUN_BUTTON_NAME), () => {
    if (!scriptReady) {
      acuToast('warning', '「AI 回复后处理」脚本仍在加载，请稍候几秒后再点击');
      return;
    }
    void rerunCurrentFloor();
  });

  const offTrigger = registerTrigger();
  const offTagInherit = registerTagVariableInheritance();
  const offChat = reloadOnChatChange();

  mountAcuPostProcessAPI();

  const offChatScopeNotify = eventOn(tavern_events.CHAT_CHANGED, () => {
    const scope = readChatTaskScope();
    void emitChatScopeChanged(scope ? 'chat_override' : 'inherit_global', scope?.originPresetName);
  });

  const w = window as unknown as Record<string, unknown>;
  w.__acuPpGetLastDeferDispatch = getLastDeferDispatch;
  w.__acuPpGetLastPromptMessages = getLastPromptMessages;
  w.__acuPpGetLastPlaceholderVars = getLastPlaceholderVars;
  w.__acuPpRerunCurrentFloor = rerunCurrentFloor;
  w.__acuPpApplyInjectVariableUpdates = applyInjectVariableUpdates;
  w.__acuPpDebugStopMvuEnded = debugStopMvuEndedListener;
  w.__acuPpParseGameTime = parseGameTimeToMs;
  w.__acuPpNormalizeGameTime = normalizeGameTimeRaw;

  $(window).on('pagehide', () => {
    menuEntry.destroy();
    offTrigger.stop();
    offTagInherit.stop();
    offChat.stop();
    offChatScopeNotify.stop();
    closeSettingsWindow();
  });
});
