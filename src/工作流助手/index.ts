import './ui/acu-theme.css';
import { reloadOnChatChange } from '@util/script';
import { mountAcuPostProcessAPI, acuPostProcessTaskApi } from './bridge/post-process-api';
import { readChatTaskScope } from './tasks/chat-task-scope';
import { emitChatScopeChanged } from './tasks/events';
import { registerTrigger } from './tasks/trigger';
import { registerUserChatTagExtractTrigger } from './tasks/chat-tag-extract';
import { registerTagVariableInheritance } from './tasks/tag-variables';
import { openSettingsWindow, closeSettingsWindow } from './ui/mount-ui';
import { registerExtensionsMenuEntry } from './ui/extensions-menu';
import { loadSettings } from './settings';
import { updateGlobalTheme } from './ui/theme';
import { ensureAcuToastStyles } from './ui/toast-styles';
import { acuToast } from './ui/toast';
import { RERUN_BUTTON_LABEL, SCRIPT_DISPLAY_NAME, SCRIPT_LOG_PREFIX } from './ui/brand';

export const RERUN_BUTTON_NAME = RERUN_BUTTON_LABEL;

updateGlobalTheme(loadSettings().uiThemeId);
ensureAcuToastStyles();

let scriptReady = false;

function handleOpenSettings(): void {
  if (!scriptReady) {
    acuToast('warning', `「${SCRIPT_DISPLAY_NAME}」脚本仍在加载，请稍候几秒后再点击`);
    return;
  }
  try {
    openSettingsWindow();
  } catch (error) {
    console.error(`${SCRIPT_LOG_PREFIX} 打开设置失败:`, error);
    acuToast('error', `打开设置失败: ${error instanceof Error ? error.message : String(error)}`);
  }
}

$(() => {
  const menuEntry = registerExtensionsMenuEntry(handleOpenSettings);
  scriptReady = true;

  appendInexistentScriptButtons([{ name: RERUN_BUTTON_NAME, visible: true }]);
  eventOn(getButtonEvent(RERUN_BUTTON_NAME), () => {
    if (!scriptReady) {
      acuToast('warning', `「${SCRIPT_DISPLAY_NAME}」脚本仍在加载，请稍候几秒后再点击`);
      return;
    }
    void acuPostProcessTaskApi.rerunCurrentFloor();
  });

  const offTrigger = registerTrigger();
  const offChatTagExtract = registerUserChatTagExtractTrigger();
  const offTagInherit = registerTagVariableInheritance();
  const offChat = reloadOnChatChange();

  mountAcuPostProcessAPI();

  const offChatScopeNotify = eventOn(tavern_events.CHAT_CHANGED, () => {
    const scope = readChatTaskScope();
    void emitChatScopeChanged(scope ? 'chat_override' : 'inherit_global', scope?.originPresetName);
  });

  $(window).on('pagehide', () => {
    menuEntry.destroy();
    offTrigger.stop();
    offChatTagExtract.stop();
    offTagInherit.stop();
    offChat.stop();
    offChatScopeNotify.stop();
    closeSettingsWindow();
  });
});
