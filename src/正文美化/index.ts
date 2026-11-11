import { teleportStyle } from '@util/script';
import './style.scss';
import { avatarFingerprint, invalidateAvatarCache } from './avatar';
import { closeAvatarLightbox, openAvatarLightbox } from './avatar-lightbox';
import {
  isInBeautifyWindow,
  refreshAllDialogueAvatars,
  renderAllMessages,
  renderMessage,
  restoreBeautifiedDom,
  setRenderHooks,
} from './render';
import { closeSettingsPanel, openSettingsPanel } from './settings-panel';

const RETRY_DELAYS_MS = [400, 1200];
const BODY_DEBOUNCE_MS = 300;
const SETTINGS_BUTTON = '对白美化设置';

$(() => {
  $(`head > div[script_id="${getScriptId()}"]`).remove();
  const { destroy } = teleportStyle();
  const stopAvatarWatch = startAvatarWatch();
  const { stop: stopBodyWatch, takeRecords } = startBodyWatch();
  setRenderHooks({ afterApply: () => takeRecords() });

  let generatingId: number | null = null;
  let retryTimers: number[] = [];

  const clearRetries = () => {
    for (const timer of retryTimers) window.clearTimeout(timer);
    retryTimers = [];
  };

  const scheduleWindowRetries = () => {
    clearRetries();
    retryTimers = RETRY_DELAYS_MS.map(delay =>
      window.setTimeout(() => {
        void renderAllMessages().then(() => refreshAllDialogueAvatars());
      }, delay),
    );
  };

  const refreshWindow = () => {
    void renderAllMessages().then(() => refreshAllDialogueAvatars());
    scheduleWindowRetries();
  };

  const maybeRender = (messageId: number) => {
    if (!isInBeautifyWindow(messageId)) return;
    void renderMessage(messageId);
  };

  appendInexistentScriptButtons([{ name: SETTINGS_BUTTON, visible: true }]);

  const listeners = [
    eventOn(getButtonEvent(SETTINGS_BUTTON), () => {
      openSettingsPanel({ onSaved: refreshWindow });
    }),
    eventOn(tavern_events.CHARACTER_MESSAGE_RENDERED, messageId => {
      maybeRender(messageId);
    }),
    eventOn(tavern_events.MESSAGE_UPDATED, messageId => {
      maybeRender(messageId);
    }),
    eventOn(tavern_events.MESSAGE_SWIPED, messageId => {
      maybeRender(messageId);
    }),
    eventOn(tavern_events.GENERATION_STARTED, () => {
      try {
        generatingId = getLastMessageId();
      } catch {
        generatingId = null;
      }
    }),
    eventOn(tavern_events.GENERATION_ENDED, messageId => {
      generatingId = null;
      maybeRender(messageId);
    }),
    eventOn(tavern_events.GENERATION_STOPPED, () => {
      generatingId = null;
    }),
    eventOn(tavern_events.CHAT_CHANGED, () => {
      invalidateAvatarCache();
      clearRetries();
      void renderAllMessages().then(() => refreshAllDialogueAvatars());
      scheduleWindowRetries();
    }),
  ];

  void renderAllMessages().then(() => refreshAllDialogueAvatars());
  scheduleWindowRetries();

  const stopAvatarLightbox = startAvatarLightbox();

  $(window).on('pagehide', () => {
    closeAvatarLightbox();
    stopAvatarLightbox();
    try {
      restoreBeautifiedDom();
    } catch (error) {
      console.error('[正文美化] 卸载还原失败', error);
    }
    invalidateAvatarCache();
    for (const listener of listeners) listener.stop();
    clearRetries();
    closeSettingsPanel();
    stopAvatarWatch();
    stopBodyWatch();
    setRenderHooks({});
    destroy();
  });

  function startAvatarLightbox(): () => void {
    let doc: Document;
    try {
      doc = window.parent.document;
    } catch {
      return () => undefined;
    }
    const onClick = (event: MouseEvent) => {
      // 监听挂在父页 document，事件目标是父页节点；不能用 iframe 的 instanceof Element/HTMLImageElement
      const raw = event.target;
      if (!raw || typeof raw !== 'object' || !('nodeType' in raw) || (raw as Node).nodeType !== 1) return;
      const img = (raw as Element).closest('img.gametxt-avatar-img');
      if (!img || img.tagName !== 'IMG') return;
      const src = (img as HTMLImageElement).currentSrc || (img as HTMLImageElement).src;
      if (!src) return;
      event.preventDefault();
      event.stopPropagation();
      openAvatarLightbox(src, (img as HTMLImageElement).alt || '');
    };
    doc.addEventListener('click', onClick, true);
    return () => {
      doc.removeEventListener('click', onClick, true);
      closeAvatarLightbox();
    };
  }

  function startBodyWatch(): { stop: () => void; takeRecords: () => void } {
    let disposed = false;
    const pending = new Map<number, number>();

    const queue = (messageId: number) => {
      if (disposed) return;
      if (generatingId != null && messageId === generatingId) return;
      if (!isInBeautifyWindow(messageId)) return;
      const prev = pending.get(messageId);
      if (prev != null) window.clearTimeout(prev);
      pending.set(
        messageId,
        window.setTimeout(() => {
          pending.delete(messageId);
          void renderMessage(messageId);
        }, BODY_DEBOUNCE_MS),
      );
    };

    const unreadDirectParagraph = (mesText: Element, node: Node | null): boolean => {
      if (!node || node.nodeType !== 1) return false;
      const el = node as Element;
      if (el.tagName !== 'P') return false;
      if (el.parentElement !== mesText) return false;
      if (el.hasAttribute('data-gametxt-beauty')) return false;
      if (el.closest('iframe, .TH-render, .gametxt-dialogue, .gametxt-iv, pre, code')) return false;
      return true;
    };

    const messageIdFrom = (node: Node | null): number | null => {
      if (!node) return null;
      const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
      const mes = el?.closest?.('.mes[mesid]');
      if (!mes) return null;
      const id = Number(mes.getAttribute('mesid'));
      return Number.isInteger(id) ? id : null;
    };

    const mesTextFrom = (node: Node | null): Element | null => {
      if (!node) return null;
      const el = node.nodeType === 1 ? (node as Element) : node.parentElement;
      return el?.closest?.('.mes_text') ?? null;
    };

    const shouldQueue = (mutation: MutationRecord): number | null => {
      const target = mutation.target;
      if (target.nodeType === 1) {
        const el = target as Element;
        if (el.closest?.('iframe, .TH-render, .gametxt-dialogue, .gametxt-iv, pre, code')) return null;
      }

      const mesText = mesTextFrom(target);
      if (!mesText) return null;
      const messageId = messageIdFrom(mesText);
      if (messageId == null) return null;

      if (mutation.type === 'characterData') {
        const parent = (target as CharacterData).parentElement;
        if (parent && unreadDirectParagraph(mesText, parent)) return messageId;
        // 文本落在直接子 p 的后代（如 q/span）里也算
        const direct = parent?.closest('p');
        if (direct && unreadDirectParagraph(mesText, direct)) return messageId;
        return null;
      }

      if (mutation.type === 'childList') {
        if (mutation.target === mesText) {
          for (const node of mutation.addedNodes) {
            if (unreadDirectParagraph(mesText, node)) return messageId;
          }
        }
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (el.closest?.('iframe, .TH-render, .gametxt-dialogue, .gametxt-iv, pre, code')) continue;
          if (unreadDirectParagraph(mesText, el)) return messageId;
          const direct = el.closest?.('p');
          if (direct && unreadDirectParagraph(mesText, direct)) return messageId;
        }
        if (unreadDirectParagraph(mesText, mutation.target as Node)) return messageId;
        const direct = (mutation.target as Element).closest?.('p');
        if (direct && unreadDirectParagraph(mesText, direct)) return messageId;
      }
      return null;
    };

    const observer = new MutationObserver(mutations => {
      if (disposed) return;
      const seen = new Set<number>();
      for (const mutation of mutations) {
        const id = shouldQueue(mutation);
        if (id == null || seen.has(id)) continue;
        seen.add(id);
        queue(id);
      }
    });

    const observeChat = () => {
      try {
        const chat = window.parent.document.querySelector('#chat');
        if (!chat) return;
        observer.observe(chat, { childList: true, subtree: true, characterData: true });
      } catch (error) {
        console.warn('[正文美化] 无法监视正文变更', error);
      }
    };
    observeChat();

    return {
      stop: () => {
        disposed = true;
        for (const timer of pending.values()) window.clearTimeout(timer);
        pending.clear();
        observer.disconnect();
      },
      takeRecords: () => {
        observer.takeRecords();
      },
    };
  }
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
