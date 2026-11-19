import { createApp, nextTick } from 'vue';
import { createScriptIdDiv, teleportStyle } from '@util/script';
import { loadSettings } from '../settings';
import { applyThemeTokens, updateGlobalTheme } from './theme';
import ReplicaFamilyCleanupDialog from './ReplicaFamilyCleanupDialog.vue';
import { listReplicaFamilyCleanupCandidates } from '../tasks/replica-family-cleanup';
import type { ScriptSettings } from '../tasks/schema';
import { ensureVueFeatureFlags } from './ensure-vue-feature-flags';
import './acu-theme.css';

export type ReplicaFamilyCleanupDialogResult = {
  keepBySpec: Record<string, string[]>;
  persistManualKeep: boolean;
};

/**
 * confirmed：用户确认；skipped：用户主动跳过；
 * busy：已有弹窗未关闭；empty：没有可清理的候选。busy / empty 不应视为用户跳过。
 */
export type ReplicaFamilyCleanupDialogOutcome =
  | ({ status: 'confirmed' } & ReplicaFamilyCleanupDialogResult)
  | { status: 'skipped' }
  | { status: 'busy' }
  | { status: 'empty' };

let pendingResolve: ((value: ReplicaFamilyCleanupDialogOutcome) => void) | null = null;
let styleDestroy: (() => void) | null = null;

function syncTeleportedStyles(mountEl: HTMLElement): void {
  styleDestroy?.();
  const { destroy } = teleportStyle(mountEl);
  styleDestroy = destroy;
}

export function showReplicaFamilyCleanupDialog(
  settings: ScriptSettings,
  protectMemberIds?: readonly string[],
): Promise<ReplicaFamilyCleanupDialogOutcome> {
  if (pendingResolve) {
    return Promise.resolve({ status: 'busy' });
  }

  const groups = listReplicaFamilyCleanupCandidates(settings, protectMemberIds);
  if (!groups.length || !groups.some(g => g.members.length)) {
    return Promise.resolve({ status: 'empty' });
  }

  return new Promise(resolve => {
    pendingResolve = resolve;

    const $root = createScriptIdDiv()
      .addClass('acu-pp-root')
      .css({
        // 与 mount-ui 一致：视口单位，避免 ST html transform 下百分比高度塌缩
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '10050',
        pointerEvents: 'auto',
      });
    $root[0].style.setProperty('height', '100dvh');
    $root.appendTo('body');

    const uiThemeId = loadSettings().uiThemeId;
    updateGlobalTheme(uiThemeId);
    applyThemeTokens($root[0], uiThemeId);

    ensureVueFeatureFlags();
    const app = createApp(ReplicaFamilyCleanupDialog, {
      groups,
      onConfirm: (keepBySpec: Record<string, string[]>) => {
        cleanup({ status: 'confirmed', keepBySpec, persistManualKeep: true });
      },
      onCancel: () => {
        cleanup({ status: 'skipped' });
      },
    });

    function cleanup(result: ReplicaFamilyCleanupDialogOutcome): void {
      styleDestroy?.();
      styleDestroy = null;
      try {
        app.unmount();
      } catch {
        /* ignore */
      }
      $root.remove();
      const r = pendingResolve;
      pendingResolve = null;
      r?.(result);
    }

    app.mount($root[0]);

    void nextTick(() => {
      syncTeleportedStyles($root[0]);
    });
  });
}
