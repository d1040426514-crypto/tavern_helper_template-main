/**
 * 区分 TauriTavern 与原版 SillyTavern。
 * 助手页在 iframe 里，标志可能在本窗口，也可能在父窗口。
 * 每次调用现判，不缓存。
 */
export function isTauriTavernHost(): boolean {
  try {
    const root = globalThis as {
      __TAURITAVERN__?: unknown;
      window?: { parent?: { __TAURITAVERN__?: unknown } };
    };
    if (root.__TAURITAVERN__) return true;
    const win = root.window;
    const parent = win?.parent;
    if (!parent || parent === win) return false;
    return Boolean(parent.__TAURITAVERN__);
  } catch {
    return false;
  }
}
