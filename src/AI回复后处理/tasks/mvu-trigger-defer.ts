import { loadSettings } from '../settings';
import { shouldSuppressAutoTriggerAfterAbort } from './trigger-guard';
import { resolveEffectiveSettings } from './effective-settings';
import { isProcessing } from './runtime';
import { needsMvuDeferredRun } from './schedule';

type MessageHandler = (
  messageId: number,
  type: string,
  options?: { bypassSchedule?: boolean; force?: boolean },
) => Promise<void>;

type DeferDispatchVia = 'ended' | 'fallback';

interface PendingItem {
  messageId: number;
  type: string;
  dispatched: boolean;
  via?: DeferDispatchVia;
}

let mvuAvailable = false;
let offMvuEnded: EventOnReturn | null = null;
const pendingQueue: PendingItem[] = [];

function pruneDispatchedHead(): void {
  while (pendingQueue.length > 0 && pendingQueue[0].dispatched) {
    pendingQueue.shift();
  }
}

function tryDispatchHead(handler: MessageHandler, via: DeferDispatchVia): void {
  pruneDispatchedHead();
  const head = pendingQueue[0];
  if (!head || head.dispatched) return;
  if (shouldSuppressAutoTriggerAfterAbort()) {
    pendingQueue.shift();
    return;
  }
  if (isProcessing(head.messageId)) return;
  head.dispatched = true;
  head.via = via;
  void handler(head.messageId, head.type);
  pruneDispatchedHead();
}

function shouldEnqueueDefer(): boolean {
  return mvuAvailable && needsMvuDeferredRun(resolveEffectiveSettings(loadSettings()));
}

async function waitForMvuReady(): Promise<boolean> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (typeof Mvu !== 'undefined') return true;
    try {
      await Promise.race([
        waitGlobalInitialized('Mvu'),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('MVU wait retry')), 2_000);
        }),
      ]);
      if (typeof Mvu !== 'undefined') return true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return typeof Mvu !== 'undefined';
}

async function initMvuEndedListener(handler: MessageHandler): Promise<void> {
  const ready = await waitForMvuReady();
  if (!ready) {
    mvuAvailable = false;
    console.warn(
      '[AI回复后处理] MVU 变量框架未就绪，无法延后至 stat_data 更新后执行，将按 MESSAGE_RECEIVED 立即触发',
    );
    return;
  }
  mvuAvailable = true;
  offMvuEnded = eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, () => {
    if (!needsMvuDeferredRun(resolveEffectiveSettings(loadSettings()))) return;
    tryDispatchHead(handler, 'ended');
  });
}

/**
 * 注册 MVU 延后触发：入队、VARIABLE_UPDATE_ENDED 主路径、eventMakeLast 兜底。
 * 与 registerTrigger 中的即时路径配合使用。
 */
export function registerMvuDeferredTrigger(handler: MessageHandler): EventOnReturn {
  void initMvuEndedListener(handler);

  const offEnqueue = eventOn(tavern_events.MESSAGE_RECEIVED, (messageId, type) => {
    if (!shouldEnqueueDefer()) return;
    pendingQueue.push({ messageId, type, dispatched: false });
  });

  const offFallback = eventMakeLast(tavern_events.MESSAGE_RECEIVED, (messageId, type) => {
    if (!shouldEnqueueDefer()) return;
    const head = pendingQueue[0];
    if (!head || head.dispatched || head.messageId !== messageId) return;
    tryDispatchHead(handler, 'fallback');
  });

  return {
    stop: () => {
      offEnqueue.stop();
      offFallback.stop();
      offMvuEnded?.stop();
      offMvuEnded = null;
      pendingQueue.length = 0;
      mvuAvailable = false;
    },
  };
}

/** 当前是否应由延后模块接管 MESSAGE_RECEIVED（即时路径应跳过） */
export function isMvuDeferActive(): boolean {
  return shouldEnqueueDefer();
}
