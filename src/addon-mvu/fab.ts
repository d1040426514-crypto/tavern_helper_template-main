import { createApp, type App as VueApp } from 'vue';
import { createPinia } from 'pinia';
import { teleportStyle } from '@util/script';

import ConsoleApp from '../addon-console/App.vue';

const FAB_ID = 'addon-console-fab';
const SHELL_ID = 'addon-console-shell';
const STYLE_ID = 'addon-console-fab-style';
const HOST_ATTR = 'data-addon-console-host';
const FAB_POS_KEY = 'addon-console-fab-pos';
const DRAG_THRESHOLD = 6;

type HostApi = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

let vueApp: VueApp | null = null;
let styleDestroy: (() => void) | null = null;
let bodyOverflowBackup: string | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;

function hostDoc(): Document {
  try {
    return window.parent?.document ?? document;
  } catch {
    return document;
  }
}

function hostWin(): Window {
  try {
    return window.parent ?? window;
  } catch {
    return window;
  }
}

function hostBody(): HTMLElement {
  return hostDoc().body;
}

function readConsoleUrl(): string {
  try {
    const vars = getVariables({ type: 'script' }) as { addon_console_url?: string };
    return String(vars?.addon_console_url ?? '').trim();
  } catch {
    return '';
  }
}

function ensureStyles(): void {
  const doc = hostDoc();
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.setAttribute(HOST_ATTR, '1');
  style.textContent = `
#${FAB_ID}{
  position:fixed;
  z-index:9990;
  width:48px;height:48px;
  border-radius:50%;
  border:1.5px solid rgba(217,184,107,.75);
  background:
    radial-gradient(circle at 30% 28%, rgba(232,213,176,.35), transparent 45%),
    linear-gradient(145deg,#1a2740 0%,#253d5e 55%,#1e3050 100%);
  color:#f5ecd7;
  font-size:16px;font-weight:700;
  letter-spacing:.06em;
  box-shadow:
    0 0 0 1px rgba(26,39,64,.35),
    0 6px 18px rgba(20,16,8,.32),
    inset 0 1px 0 rgba(255,255,255,.12);
  cursor:grab;
  display:flex;align-items:center;justify-content:center;
  user-select:none;
  touch-action:none;
  transition:box-shadow .18s ease, transform .15s ease;
}
#${FAB_ID}:hover{
  box-shadow:
    0 0 0 1px rgba(200,164,92,.45),
    0 8px 22px rgba(20,16,8,.4),
    inset 0 1px 0 rgba(255,255,255,.16);
}
#${FAB_ID}.dragging{cursor:grabbing;transform:scale(1.05)}
#${FAB_ID} .ac-fab-ring{
  position:absolute;inset:4px;border-radius:50%;
  border:1px solid rgba(200,164,92,.28);
  pointer-events:none;
}
#${FAB_ID} .ac-fab-glyph{position:relative;z-index:1;line-height:1}

#${SHELL_ID}{
  position:fixed;inset:0;z-index:9995;pointer-events:none;
  display:flex;align-items:center;justify-content:center;
  padding:0;
}
#${SHELL_ID}.open{pointer-events:auto}
#${SHELL_ID} .ac-mask{
  position:absolute;inset:0;
  background:rgba(12,16,28,.52);
  opacity:0;transition:opacity .22s ease;
  backdrop-filter:blur(2px);
}
#${SHELL_ID}.open .ac-mask{opacity:1}
#${SHELL_ID} .ac-panel{
  position:relative;
  z-index:1;
  width:min(1080px,94vw);
  height:min(92vh,920px);
  max-height:92vh;
  background:#fdf9f2;
  border-radius:16px;
  box-shadow:0 16px 48px rgba(12,16,28,.28);
  border:1px solid rgba(200,164,92,.28);
  transform:translateY(12px) scale(.98);
  opacity:0;
  transition:transform .24s ease, opacity .24s ease;
  display:flex;flex-direction:column;
  overflow:hidden;
}
#${SHELL_ID}.open .ac-panel{
  transform:translateY(0) scale(1);
  opacity:1;
}
#${SHELL_ID} .ac-panel-body{
  flex:1;min-height:0;overflow:hidden;
  display:flex;flex-direction:column;
}
#${SHELL_ID} .ac-panel-body iframe,
#${SHELL_ID} .ac-panel-body .ac-mount{
  width:100%;height:100%;border:0;display:block;background:transparent;
  min-height:0;flex:1;
}
@media (max-width:640px){
  #${SHELL_ID}{
    padding-top:env(safe-area-inset-top,0px);
    padding-right:env(safe-area-inset-right,0px);
    padding-bottom:env(safe-area-inset-bottom,0px);
    padding-left:env(safe-area-inset-left,0px);
    align-items:stretch;
    justify-content:stretch;
    box-sizing:border-box;
  }
  #${SHELL_ID} .ac-panel{
    width:auto;
    height:auto;
    flex:1;
    align-self:stretch;
    min-height:0;
    max-height:none;
    border-radius:0;
    border:0;
  }
}
`;
  doc.head.appendChild(style);
}

function readSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  const doc = hostDoc();
  const probe = doc.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;' +
    'padding-top:env(safe-area-inset-top,0px);' +
    'padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);' +
    'padding-left:env(safe-area-inset-left,0px)';
  doc.body.appendChild(probe);
  const cs = hostWin().getComputedStyle(probe);
  const insets = {
    top: Number.parseFloat(cs.paddingTop) || 0,
    right: Number.parseFloat(cs.paddingRight) || 0,
    bottom: Number.parseFloat(cs.paddingBottom) || 0,
    left: Number.parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return insets;
}

function clampFabPosition(left: number, top: number, size = 48): { left: number; top: number } {
  const doc = hostDoc();
  const vv = hostWin().visualViewport;
  const vw = vv?.width ?? doc.documentElement.clientWidth;
  const vh = vv?.height ?? doc.documentElement.clientHeight;
  const pad = 8;
  const safe = readSafeAreaInsets();
  return {
    left: Math.min(Math.max(pad + safe.left, left), Math.max(pad + safe.left, vw - size - pad - safe.right)),
    top: Math.min(Math.max(pad + safe.top, top), Math.max(pad + safe.top, vh - size - pad - safe.bottom)),
  };
}

function applyFabPosition(fab: HTMLElement, left: number, top: number): void {
  const pos = clampFabPosition(left, top);
  fab.style.left = `${pos.left}px`;
  fab.style.top = `${pos.top}px`;
  fab.style.right = 'auto';
  fab.style.bottom = 'auto';
}

function loadFabPosition(fab: HTMLElement): void {
  try {
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { left?: number; top?: number };
      if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
        applyFabPosition(fab, parsed.left, parsed.top);
        return;
      }
    }
  } catch {
    /* ignore */
  }
  const doc = hostDoc();
  const vv = hostWin().visualViewport;
  const vw = vv?.width ?? doc.documentElement.clientWidth;
  const vh = vv?.height ?? doc.documentElement.clientHeight;
  applyFabPosition(fab, vw - 48 - 12, vh - 48 - 12);
}

function saveFabPosition(left: number, top: number): void {
  try {
    localStorage.setItem(FAB_POS_KEY, JSON.stringify({ left, top }));
  } catch {
    /* ignore */
  }
}

function bindFabDrag(fab: HTMLElement): void {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;
  let pointerId: number | null = null;

  const onMove = (e: PointerEvent) => {
    if (!dragging || pointerId !== e.pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
      moved = true;
      fab.classList.add('dragging');
    }
    applyFabPosition(fab, origLeft + dx, origTop + dy);
  };

  const onUp = (e: PointerEvent) => {
    if (pointerId !== e.pointerId) return;
    dragging = false;
    pointerId = null;
    fab.classList.remove('dragging');
    fab.releasePointerCapture?.(e.pointerId);
    hostDoc().removeEventListener('pointermove', onMove);
    hostDoc().removeEventListener('pointerup', onUp);
    hostDoc().removeEventListener('pointercancel', onUp);
    const left = parseFloat(fab.style.left || '0');
    const top = parseFloat(fab.style.top || '0');
    saveFabPosition(left, top);
    if (!moved) {
      toggleAddonConsole();
    }
  };

  fab.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    const rect = fab.getBoundingClientRect();
    origLeft = rect.left;
    origTop = rect.top;
    fab.setPointerCapture?.(e.pointerId);
    hostDoc().addEventListener('pointermove', onMove);
    hostDoc().addEventListener('pointerup', onUp);
    hostDoc().addEventListener('pointercancel', onUp);
    e.preventDefault();
  });
}

function unmountConsole(): void {
  if (vueApp) {
    vueApp.unmount();
    vueApp = null;
  }
  styleDestroy?.();
  styleDestroy = null;
}

function syncTeleportedStyles(): void {
  styleDestroy?.();
  const { destroy } = teleportStyle();
  styleDestroy = destroy;
}

function mountConsoleInProcess(container: HTMLElement): void {
  unmountConsole();
  container.innerHTML = '';
  const mount = hostDoc().createElement('div');
  mount.className = 'ac-mount';
  container.appendChild(mount);
  vueApp = createApp(ConsoleApp);
  vueApp.use(createPinia());
  vueApp.mount(mount);
  requestAnimationFrame(() => syncTeleportedStyles());
}

function mountConsoleIframe(container: HTMLElement, url: string): void {
  unmountConsole();
  container.innerHTML = '';
  const iframe = hostDoc().createElement('iframe');
  iframe.src = url;
  iframe.title = 'addon-console';
  iframe.allow = 'clipboard-read; clipboard-write';
  container.appendChild(iframe);
}

function isOpen(): boolean {
  return hostDoc().getElementById(SHELL_ID)?.classList.contains('open') === true;
}

function setBodyScrollLocked(locked: boolean): void {
  const body = hostBody();
  if (locked) {
    if (bodyOverflowBackup === null) bodyOverflowBackup = body.style.overflow;
    body.style.overflow = 'hidden';
  } else if (bodyOverflowBackup !== null) {
    body.style.overflow = bodyOverflowBackup;
    bodyOverflowBackup = null;
  }
}

function setOpen(open: boolean): void {
  const shell = hostDoc().getElementById(SHELL_ID);
  if (!shell) return;
  shell.classList.toggle('open', open);
  setBodyScrollLocked(open);
  if (open) {
    if (!escHandler) {
      escHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeAddonConsole();
      };
      hostDoc().addEventListener('keydown', escHandler);
    }
  } else if (escHandler) {
    hostDoc().removeEventListener('keydown', escHandler);
    escHandler = null;
  }
}

function ensureShell(): HTMLElement {
  const doc = hostDoc();
  let shell = doc.getElementById(SHELL_ID);
  if (shell) return shell;

  shell = doc.createElement('div');
  shell.id = SHELL_ID;
  shell.setAttribute(HOST_ATTR, '1');
  shell.innerHTML = `
    <div class="ac-mask" data-ac-close="1"></div>
    <aside class="ac-panel" role="dialog" aria-modal="true" aria-label="世界时局与经济简报">
      <div class="ac-panel-body"></div>
    </aside>
  `;
  shell.addEventListener('click', e => {
    const t = e.target as HTMLElement | null;
    if (t?.getAttribute('data-ac-close') === '1') closeAddonConsole();
  });
  hostBody().appendChild(shell);
  return shell;
}

function loadConsoleContent(): void {
  const shell = ensureShell();
  const body = shell.querySelector('.ac-panel-body') as HTMLElement | null;
  if (!body) return;
  if (body.querySelector('.ac-mount, iframe')) return;
  const url = readConsoleUrl();
  if (url) {
    mountConsoleIframe(body, url);
  } else {
    mountConsoleInProcess(body);
  }
}

function exposeHostApi(): void {
  try {
    const api: HostApi = {
      open: openAddonConsole,
      close: closeAddonConsole,
      toggle: toggleAddonConsole,
    };
    (hostWin() as Window & { __addonConsoleHost?: HostApi }).__addonConsoleHost = api;
  } catch {
    /* ignore */
  }
}

export function openAddonConsole(): void {
  ensureStyles();
  ensureShell();
  loadConsoleContent();
  // 关闭时会卸掉 teleported 样式；再次打开需补回（内容可能已挂载）
  if (vueApp && !styleDestroy) {
    syncTeleportedStyles();
  }
  setOpen(true);
  exposeHostApi();
}

export function closeAddonConsole(): void {
  setOpen(false);
  // 移除注入父页的控制台样式，避免污染酒馆主题
  styleDestroy?.();
  styleDestroy = null;
}

export function toggleAddonConsole(): void {
  if (isOpen()) closeAddonConsole();
  else openAddonConsole();
}

export function injectAddonConsoleFab(): void {
  ensureStyles();
  exposeHostApi();
  const doc = hostDoc();
  if (doc.getElementById(FAB_ID)) return;

  const fab = doc.createElement('button');
  fab.id = FAB_ID;
  fab.type = 'button';
  fab.setAttribute(HOST_ATTR, '1');
  fab.setAttribute('aria-label', '打开世界简报');
  fab.title = '世界简报（可拖动）';
  fab.innerHTML = '<span class="ac-fab-ring" aria-hidden="true"></span><span class="ac-fab-glyph">界</span>';
  loadFabPosition(fab);
  bindFabDrag(fab);
  hostBody().appendChild(fab);

  hostWin().addEventListener('resize', () => {
    const left = parseFloat(fab.style.left || '0');
    const top = parseFloat(fab.style.top || '0');
    applyFabPosition(fab, left, top);
  });
}

export function destroyAddonConsoleHost(): void {
  unmountConsole();
  setOpen(false);
  const doc = hostDoc();
  doc.getElementById(FAB_ID)?.remove();
  doc.getElementById(SHELL_ID)?.remove();
  doc.getElementById(STYLE_ID)?.remove();
  // legacy id cleanup
  doc.getElementById('addon-console-drawer')?.remove();
  try {
    delete (hostWin() as Window & { __addonConsoleHost?: HostApi }).__addonConsoleHost;
  } catch {
    /* ignore */
  }
}
