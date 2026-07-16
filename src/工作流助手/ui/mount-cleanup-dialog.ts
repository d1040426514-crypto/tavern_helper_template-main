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
  keepByRoot: Record<string, string[]>;
  persistManualKeep: boolean;
};

let pendingResolve: ((value: ReplicaFamilyCleanupDialogResult | null) => void) | null = null;
let styleDestroy: (() => void) | null = null;

function syncTeleportedStyles(mountEl: HTMLElement): void {
  styleDestroy?.();
  const { destroy } = teleportStyle(mountEl);
  styleDestroy = destroy;
}

export function showReplicaFamilyCleanupDialog(
  settings: ScriptSettings,
  protectMemberIds?: readonly string[],
): Promise<ReplicaFamilyCleanupDialogResult | null> {
  if (pendingResolve) {
    return Promise.resolve(null);
  }

  const groups = listReplicaFamilyCleanupCandidates(settings, protectMemberIds);
  if (!groups.length || !groups.some(g => g.members.length)) {
    return Promise.resolve(null);
  }

  return new Promise(resolve => {
    pendingResolve = resolve;

    const $root = createScriptIdDiv()
      .addClass('acu-pp-root')
      .css({
        position: 'fixed',
        inset: '0',
        width: '100%',
        height: '100%',
        zIndex: '10050',
        pointerEvents: 'auto',
      })
      .appendTo('body');

    const uiThemeId = loadSettings().uiThemeId;
    updateGlobalTheme(uiThemeId);
    applyThemeTokens($root[0], uiThemeId);

    ensureVueFeatureFlags();
    const app = createApp(ReplicaFamilyCleanupDialog, {
      groups,
      onConfirm: (keepByRoot: Record<string, string[]>) => {
        cleanup({ keepByRoot, persistManualKeep: true });
      },
      onCancel: () => {
        cleanup(null);
      },
    });

    function cleanup(result: ReplicaFamilyCleanupDialogResult | null): void {
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
