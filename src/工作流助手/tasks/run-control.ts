export class RunCancelledError extends Error {
  constructor(message = 'TaskAbortedByUser') {
    super(message);
    this.name = 'RunCancelledError';
  }
}

let abortController: AbortController | null = null;
let runEpoch = 0;
const activeGenerationIds = new Set<string>();

export function beginRun(): { signal: AbortSignal; epoch: number } {
  abortController?.abort();
  abortController = new AbortController();
  activeGenerationIds.clear();
  const epoch = ++runEpoch;
  return { signal: abortController.signal, epoch };
}

export function endRun(epoch?: number): void {
  if (epoch !== undefined && epoch !== runEpoch) return;
  abortController = null;
  activeGenerationIds.clear();
}

export function getRunEpoch(): number {
  return runEpoch;
}

export function getRunSignal(): AbortSignal | undefined {
  return abortController?.signal;
}

export function registerGenerationId(generationId: string): void {
  if (generationId) activeGenerationIds.add(generationId);
}

export function unregisterGenerationId(generationId: string): void {
  activeGenerationIds.delete(generationId);
}

export function requestCancelRun(): void {
  for (const id of activeGenerationIds) {
    try {
      stopGenerationById(id);
    } catch {
      // ignore
    }
  }
  activeGenerationIds.clear();
  abortController?.abort();
}

export function checkRunCancelled(signal?: AbortSignal): void {
  if (signal?.aborted || abortController?.signal.aborted) {
    throw new RunCancelledError();
  }
}

export function isRunCancelled(signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted || abortController?.signal.aborted);
}

export async function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  checkRunCancelled(signal);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(new RunCancelledError());
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
