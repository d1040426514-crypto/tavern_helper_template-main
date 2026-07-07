import { createApp, nextTick } from 'vue';
import { createScriptIdDiv, teleportStyle } from '@util/script';
import { loadSettings } from '../settings';
import { applyThemeTokens, updateGlobalTheme } from './theme';
import ReplicaFamilyCleanupDialog from './ReplicaFamilyCleanupDialog.vue';
import { computeDefaultSelection, listReplicaFamilyCleanupCandidates } from '../tasks/replica-family-cleanup';
import type { ScriptSettings } from '../tasks/schema';
import './acu-theme.css';

let pendingResolve: ((value: Record<string, string[]> | null) => void) | null = null;
let styleDestroy: (() => void) | null = null;

function syncTeleportedStyles(mountEl: HTMLElement): void {
  styleDestroy?.();
  const { destroy } = teleportStyle(mountEl);
  styleDestroy = destroy;
}

export function showReplicaFamilyCleanupDialog(
  settings: ScriptSettings,
): Promise<Record<string, string[]> | null> {
  if (pendingResolve) {
    return Promise.resolve(null);
  }

  const groups = listReplicaFamilyCleanupCandidates(settings);
  if (!groups.length || !groups.some(g => g.members.length)) {
    return Promise.resolve(computeDefaultSelection(settings));
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

    const app = createApp(ReplicaFamilyCleanupDialog, {
      groups,
      onConfirm: (keepByRoot: Record<string, string[]>) => {
        cleanup(keepByRoot);
      },
      onCancel: () => {
        cleanup(computeDefaultSelection(settings));
      },
    });

    function cleanup(result: Record<string, string[]> | null): void {
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
