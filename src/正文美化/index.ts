import { teleportStyle } from '@util/script';
import './style.scss';
import { avatarFingerprint, invalidateAvatarCache } from './avatar';
import { refreshAllDialogueAvatars, renderAllMessages, renderMessage } from './render';

$(() => {
  $(`head > div[script_id="${getScriptId()}"]`).remove();
  const { destroy } = teleportStyle();
  const stopWatch = startAvatarWatch();
  const listeners = [
    eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.USER_MESSAGE_RENDERED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.MESSAGE_UPDATED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.MESSAGE_SWIPED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.GENERATION_ENDED, messageId => {
      void renderMessage(messageId);
    }),
    eventOn(tavern_events.CHAT_CHANGED, () => {
      invalidateAvatarCache();
      void renderAllMessages().then(() => refreshAllDialogueAvatars());
    }),
  ];

  void renderAllMessages().then(() => refreshAllDialogueAvatars());

  $(window).on('pagehide', () => {
    for (const listener of listeners) listener.stop();
    stopWatch();
    destroy();
  });
});

function startAvatarWatch(): () => void {
  let lastFingerprint = '';
  let refreshTimer: number | null = null;
  let disposed = false;

  const scheduleRefresh = (delayMs = 200) => {
    if (disposed) return;
    if (refreshTimer != null) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      void refreshAllDialogueAvatars();
    }, delayMs);
  };

  const poll = window.setInterval(() => {
    void (async () => {
      if (disposed) return;
      const next = await avatarFingerprint();
      if (!next) return;
      if (!lastFingerprint) {
        lastFingerprint = next;
        return;
      }
      if (next === lastFingerprint) return;
      lastFingerprint = next;
      scheduleRefresh(0);
    })();
  }, 2000);

  void avatarFingerprint().then(value => {
    if (!disposed) lastFingerprint = value;
  });

  const isAvatarMutation = (mutation: MutationRecord): boolean => {
    const related = (node: Node | null): boolean => {
      if (!node || node.nodeType !== 1) return false;
      const el = node as Element;
      if (el.matches?.('img') && el.closest?.('[class*="AvatarPanel"]')) return true;
      if (el.matches?.('[class*="AvatarPanel"]')) return true;
      if (el.querySelector?.('[class*="AvatarPanel"] img, [class*="AvatarPanel"]')) return true;
      return false;
    };
    if (mutation.type === 'attributes') return related(mutation.target);
    if (mutation.type === 'childList') {
      for (const node of mutation.addedNodes) if (related(node)) return true;
      for (const node of mutation.removedNodes) if (related(node)) return true;
    }
    return false;
  };

  const observer = new MutationObserver(mutations => {
    if (mutations.some(isAvatarMutation)) scheduleRefresh(200);
  });
  const observedDocs = new WeakSet<Document>();
  const observeRoot = (root: Node | null | undefined) => {
    if (!root) return;
    try {
      observer.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src'],
      });
    } catch {
      /* 节点可能已脱离文档 */
    }
  };
  const observeAvatarPanels = () => {
    try {
      const parentDoc = window.parent.document;
      const chat = parentDoc.querySelector('#chat');
      observeRoot(chat);
      const frames = parentDoc.querySelectorAll('iframe');
      for (const frame of frames) {
        try {
          const doc = frame.contentDocument;
          if (!doc || observedDocs.has(doc)) continue;
          if (!doc.querySelector('[class*="AvatarPanel"]')) continue;
          observedDocs.add(doc);
          observeRoot(doc);
        } catch {
          /* 跨域 iframe 跳过 */
        }
      }
    } catch (error) {
      console.warn('[正文美化] 无法监视状态栏头像面板', error);
    }
  };
  observeAvatarPanels();
  const rescanPanels = window.setInterval(() => {
    if (!disposed) observeAvatarPanels();
  }, 3000);

  return () => {
    disposed = true;
    window.clearInterval(poll);
    window.clearInterval(rescanPanels);
    if (refreshTimer != null) window.clearTimeout(refreshTimer);
    observer.disconnect();
  };
}
