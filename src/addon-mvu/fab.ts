import { createApp, type App as VueApp } from 'vue';
import { createPinia } from 'pinia';
import { teleportStyle } from '@util/script';

import ConsoleApp from '../addon-console/App.vue';
import { AddonEvent } from './events';
import { getAddonData, hasChatMessages } from './store';

const FAB_ID = 'addon-console-fab';
const SHELL_ID = 'addon-console-shell';
const STYLE_ID = 'addon-console-fab-style';
const HOST_ATTR = 'data-addon-console-host';
const FAB_POS_KEY = 'addon-console-fab-pos';
const DRAG_THRESHOLD = 6;

/** 2:1 世界剪影，供陆地 mask（风格对齐 DlSNlGHT/World 悬浮球） */
const WORLDMAP_MASK =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100" preserveAspectRatio="none">' +
      '<path fill="#000" d="' +
      'M18 32c2-10 14-16 24-12 7 3 9 12 6 19-2 5-7 8-6 13 1 6-5 11-12 10-8-1-14-8-15-16-1-5 1-10 3-14z' +
      'M36 58c3 2 4 10-1 15-4 4-11 3-14-1-3-5 0-12 5-14 3-1 7-1 10 0z' +
      'M62 30c6-8 18-8 24 0 5 6 5 16-1 22-5 5-14 5-19 0-6-6-8-15-4-22z' +
      'M68 54c5 1 9 8 6 14-3 6-12 7-16 2-4-5-2-13 4-15 2-1 4-1 6-1z' +
      'M98 26c10-8 26-6 32 5 5 9 2 20-7 25-8 5-20 3-26-4-7-8-6-18 1-26z' +
      'M118 56c6-1 12 3 13 9 1 6-4 12-10 12-7 0-12-5-12-11 0-5 4-9 9-10z' +
      'M148 34c5-3 12-1 14 5 2 5 0 11-5 13-5 2-11 0-13-5-2-5 0-10 4-13z' +
      'M158 58c4 0 7 3 7 7s-3 7-7 7-7-3-7-7 3-7 7-7z' +
      '"/>' +
      '</svg>',
  );

type HostApi = {
  open: () => void;
  close: () => void;
  toggle: () => void;
};

let vueApp: VueApp | null = null;
let styleDestroy: (() => void) | null = null;
let bodyOverflowBackup: string | null = null;
let escHandler: ((e: KeyboardEvent) => void) | null = null;
let orbitSyncBound = false;

const onChatChangedForOrbit = () => {
  syncFabOrbitPlanets();
};
const onVariableUpdateEndedForOrbit = () => {
  syncFabOrbitPlanets();
};

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
  let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute(HOST_ATTR, '1');
    doc.head.appendChild(style);
  }
  style.textContent = `
#${FAB_ID}{
  --ac-fab-size:40px;
  --ac-fab-ocean:#163039;
  --ac-fab-land:#5a9387;
  --ac-fab-orbit:rgba(120,170,180,.38);
  --ac-fab-orbit-pad:7px;
  position:fixed;
  z-index:9990;
  width:var(--ac-fab-size);
  height:var(--ac-fab-size);
  padding:0;
  margin:0;
  border:0;
  border-radius:50%;
  background:transparent;
  cursor:grab;
  display:block;
  user-select:none;
  -webkit-tap-highlight-color:transparent;
  touch-action:none;
  overflow:visible;
  filter:drop-shadow(0 4px 12px rgba(8,18,24,.55));
  transition:filter .2s ease, transform .15s ease;
}
#${FAB_ID}:hover{transform:scale(1.06)}
#${FAB_ID}.dragging{
  cursor:grabbing;
  transform:scale(1.1);
  transition:none;
}
#${FAB_ID} > span{
  position:absolute;
  inset:0;
  pointer-events:none;
}
#${FAB_ID} .ac-fab-orbit{
  inset:calc(var(--ac-fab-orbit-pad) * -1);
  border-radius:50%;
  border:1px dashed var(--ac-fab-orbit);
  z-index:0;
}
#${FAB_ID}[data-worlds]:not([data-worlds="0"]) .ac-fab-orbit{
  animation:ac-fab-orbit-spin 18s linear infinite;
}
#${FAB_ID}:hover .ac-fab-orbit{
  border-color:rgba(88,184,169,.55);
}
#${FAB_ID}:hover[data-worlds]:not([data-worlds="0"]) .ac-fab-orbit{
  animation-duration:12s;
}
#${FAB_ID}:hover[data-worlds="0"] .ac-fab-orbit{
  animation:ac-fab-orbit-spin 12s linear infinite;
}
#${FAB_ID} .ac-fab-moon{
  --ac-fab-moon-size:6px;
  position:absolute;
  left:50%;
  top:50%;
  width:var(--ac-fab-moon-size);
  height:var(--ac-fab-moon-size);
  margin:calc(var(--ac-fab-moon-size) / -2);
  border-radius:50%;
  z-index:2;
  background:
    radial-gradient(circle at 30% 28%, rgba(255,255,255,.55), transparent 42%),
    radial-gradient(circle at 50% 50%, hsl(var(--ac-fab-moon-hue,168) 42% 58%), hsl(var(--ac-fab-moon-hue,168) 38% 32%));
  box-shadow:
    0 0 0 1px rgba(229,240,237,.22),
    0 1px 2px rgba(8,18,24,.35);
  transform:rotate(calc(var(--i, 0) * 360deg / var(--n, 1)))
    translateY(calc(var(--ac-fab-size) / -2 - var(--ac-fab-orbit-pad)));
}
#${FAB_ID}[data-many-moons="1"] .ac-fab-moon{
  --ac-fab-moon-size:5px;
}
#${FAB_ID} .ac-fab-globe{
  border-radius:50%;
  overflow:hidden;
  background:var(--ac-fab-ocean);
  border:1px solid rgba(229,240,237,.14);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.1);
  z-index:1;
}
#${FAB_ID} .ac-fab-globe::before{
  content:'';
  position:absolute;
  inset:0;
  background:var(--ac-fab-land);
  -webkit-mask:url("${WORLDMAP_MASK}") 0 center / 200% 100% repeat-x;
  mask:url("${WORLDMAP_MASK}") 0 center / 200% 100% repeat-x;
  animation:ac-fab-map-scroll 28s linear infinite;
}
@keyframes ac-fab-map-scroll{
  from{-webkit-mask-position:0 center;mask-position:0 center}
  to{-webkit-mask-position:-200% center;mask-position:-200% center}
}
@keyframes ac-fab-orbit-spin{to{transform:rotate(360deg)}}
@media (max-width:640px){
  #${FAB_ID}{--ac-fab-size:36px}
}
@media (max-width:380px){
  #${FAB_ID}{--ac-fab-size:32px}
}
@media (prefers-reduced-motion:reduce){
  #${FAB_ID} .ac-fab-globe::before,
  #${FAB_ID} .ac-fab-orbit,
  #${FAB_ID}:hover .ac-fab-orbit{animation:none}
  #${FAB_ID}{transition:none}
}
@media (hover:none){
  #${FAB_ID}:hover{transform:none}
  #${FAB_ID} .ac-fab-orbit{
    animation:none;
    border-color:var(--ac-fab-orbit);
  }
}

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
}

const FAB_MARKUP =
  '<span class="ac-fab-orbit" aria-hidden="true"></span>' +
  '<span class="ac-fab-globe" aria-hidden="true"></span>';

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

function getFabSize(fab?: HTMLElement | null): number {
  const el = fab ?? (hostDoc().getElementById(FAB_ID) as HTMLElement | null);
  if (el) {
    const w = el.getBoundingClientRect().width;
    if (w > 0) return w;
  }
  const vw = hostWin().visualViewport?.width ?? hostDoc().documentElement.clientWidth;
  if (vw <= 380) return 32;
  if (vw <= 640) return 36;
  return 40;
}

function clampFabPosition(left: number, top: number, size?: number): { left: number; top: number } {
  const doc = hostDoc();
  const vv = hostWin().visualViewport;
  const vw = vv?.width ?? doc.documentElement.clientWidth;
  const vh = vv?.height ?? doc.documentElement.clientHeight;
  const fabSize = size ?? getFabSize();
  const pad = 8;
  const safe = readSafeAreaInsets();
  return {
    left: Math.min(Math.max(pad + safe.left, left), Math.max(pad + safe.left, vw - fabSize - pad - safe.right)),
    top: Math.min(Math.max(pad + safe.top, top), Math.max(pad + safe.top, vh - fabSize - pad - safe.bottom)),
  };
}

function applyFabPosition(fab: HTMLElement, left: number, top: number): void {
  const pos = clampFabPosition(left, top, getFabSize(fab));
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
  const size = getFabSize(fab);
  applyFabPosition(fab, vw - size - 12, vh - size - 12);
}

function saveFabPosition(left: number, top: number): void {
  try {
    localStorage.setItem(FAB_POS_KEY, JSON.stringify({ left, top }));
  } catch {
    /* ignore */
  }
}

function bindFabDrag(fab: HTMLElement): void {
  type HostWithAbort = Window & { __acFabDragAbort?: AbortController };
  const win = hostWin() as HostWithAbort;
  win.__acFabDragAbort?.abort();
  const ac = new AbortController();
  win.__acFabDragAbort = ac;
  const { signal } = ac;

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

  fab.addEventListener(
    'pointerdown',
    e => {
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
      hostDoc().addEventListener('pointermove', onMove, { signal });
      hostDoc().addEventListener('pointerup', onUp, { signal });
      hostDoc().addEventListener('pointercancel', onUp, { signal });
      e.preventDefault();
    },
    { signal },
  );
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

function countWorlds(): number {
  try {
    if (!hasChatMessages()) return 0;
    const message_id = getLastMessageId();
    const data = getAddonData(message_id);
    return Object.keys(data ?? {}).length;
  } catch {
    return 0;
  }
}

/** 按 addon_data 世界数刷新轨道小星球 */
export function syncFabOrbitPlanets(): void {
  const fab = hostDoc().getElementById(FAB_ID) as HTMLElement | null;
  if (!fab) return;
  const orbit = fab.querySelector('.ac-fab-orbit') as HTMLElement | null;
  if (!orbit) return;

  const n = countWorlds();
  fab.setAttribute('data-worlds', String(n));
  if (n > 8) fab.setAttribute('data-many-moons', '1');
  else fab.removeAttribute('data-many-moons');
  orbit.style.setProperty('--n', String(Math.max(n, 1)));

  const existing = orbit.querySelectorAll('.ac-fab-moon');
  if (existing.length === n) {
    existing.forEach((el, i) => {
      (el as HTMLElement).style.setProperty('--i', String(i));
    });
    return;
  }

  orbit.querySelectorAll('.ac-fab-moon').forEach(el => el.remove());
  for (let i = 0; i < n; i++) {
    const moon = hostDoc().createElement('span');
    moon.className = 'ac-fab-moon';
    moon.setAttribute('aria-hidden', 'true');
    moon.style.setProperty('--i', String(i));
    // 色相围绕青绿海洋色微调，避免全部同色
    moon.style.setProperty('--ac-fab-moon-hue', String(155 + ((i * 37) % 80)));
    orbit.appendChild(moon);
  }
}

function bindOrbitSyncListeners(): void {
  if (orbitSyncBound) return;
  orbitSyncBound = true;
  eventOn(tavern_events.CHAT_CHANGED, onChatChangedForOrbit);
  eventOn(AddonEvent.VARIABLE_UPDATE_ENDED, onVariableUpdateEndedForOrbit);
}

function unbindOrbitSyncListeners(): void {
  if (!orbitSyncBound) return;
  orbitSyncBound = false;
  try {
    eventRemoveListener(tavern_events.CHAT_CHANGED, onChatChangedForOrbit);
  } catch {
    /* ignore */
  }
  try {
    eventRemoveListener(AddonEvent.VARIABLE_UPDATE_ENDED, onVariableUpdateEndedForOrbit);
  } catch {
    /* ignore */
  }
}

export function injectAddonConsoleFab(): void {
  ensureStyles();
  exposeHostApi();
  bindOrbitSyncListeners();
  const doc = hostDoc();
  const existing = doc.getElementById(FAB_ID) as HTMLButtonElement | null;
  if (existing) {
    // 脚本 iframe 热重载时保留父页悬浮球 DOM，仅重绑事件，避免闪没
    bindFabDrag(existing);
    syncFabOrbitPlanets();
    return;
  }

  const fab = doc.createElement('button');
  fab.id = FAB_ID;
  fab.type = 'button';
  fab.setAttribute(HOST_ATTR, '1');
  fab.setAttribute('aria-label', '打开世界简报');
  fab.title = '世界简报（可拖动）';
  fab.innerHTML = FAB_MARKUP;
  loadFabPosition(fab);
  bindFabDrag(fab);
  hostBody().appendChild(fab);
  syncFabOrbitPlanets();

  hostWin().addEventListener('resize', () => {
    const left = parseFloat(fab.style.left || '0');
    const top = parseFloat(fab.style.top || '0');
    applyFabPosition(fab, left, top);
  });
}

/**
 * 脚本 iframe 卸载时的软清理：卸下面板，但保留父页悬浮球与样式，
 * 避免 CHAT_CHANGED / HMR 重载脚本时悬浮球闪没再出现。
 */
export function softTeardownAddonConsoleHost(): void {
  unmountConsole();
  setOpen(false);
  hostDoc().getElementById(SHELL_ID)?.remove();
  hostDoc().getElementById('addon-console-drawer')?.remove();
}

export function destroyAddonConsoleHost(): void {
  unbindOrbitSyncListeners();
  softTeardownAddonConsoleHost();
  const doc = hostDoc();
  doc.getElementById(FAB_ID)?.remove();
  doc.getElementById(STYLE_ID)?.remove();
  try {
    delete (hostWin() as Window & { __addonConsoleHost?: HostApi }).__addonConsoleHost;
  } catch {
    /* ignore */
  }
  try {
    delete (hostWin() as Window & { __acFabDragAbort?: AbortController }).__acFabDragAbort;
  } catch {
    /* ignore */
  }
}
