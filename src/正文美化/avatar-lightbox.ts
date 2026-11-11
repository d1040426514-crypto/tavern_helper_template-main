const LIGHTBOX_ID = 'gametxt-avatar-lightbox';
const STYLE_ID = 'gametxt-avatar-lightbox-style';

let escHandler: ((event: KeyboardEvent) => void) | null = null;

function hostDocument(): Document | null {
  try {
    return window.parent?.document ?? document;
  } catch {
    return null;
  }
}

export function closeAvatarLightbox(): void {
  const doc = hostDocument();
  if (!doc) return;
  doc.getElementById(LIGHTBOX_ID)?.remove();
  doc.getElementById(STYLE_ID)?.remove();
  if (escHandler) {
    doc.removeEventListener('keydown', escHandler, true);
    escHandler = null;
  }
}

export function openAvatarLightbox(url: string, name = ''): void {
  const src = url.trim();
  if (!src) return;
  const doc = hostDocument();
  if (!doc) {
    console.warn('[正文美化] 无法打开头像浮层');
    return;
  }

  ensureStyle(doc);

  const existing = doc.getElementById(LIGHTBOX_ID);
  if (existing) {
    const img = existing.querySelector<HTMLImageElement>('img.gametxt-avatar-lightbox-img');
    if (img) {
      img.src = src;
      img.alt = name || img.alt || '';
    }
    return;
  }

  const overlay = doc.createElement('div');
  overlay.id = LIGHTBOX_ID;
  overlay.className = 'gametxt-avatar-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', name ? `${name} 的立绘` : '角色立绘');

  const frame = doc.createElement('div');
  frame.className = 'gametxt-avatar-lightbox-frame';

  const image = doc.createElement('img');
  image.className = 'gametxt-avatar-lightbox-img';
  image.alt = name;
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.src = src;
  image.addEventListener('click', event => {
    event.stopPropagation();
  });

  frame.append(image);
  overlay.append(frame);
  overlay.addEventListener('click', () => {
    closeAvatarLightbox();
  });

  doc.body.append(overlay);

  escHandler = event => {
    if (event.key !== 'Escape') return;
    if (!doc.getElementById(LIGHTBOX_ID)) return;
    event.stopPropagation();
    closeAvatarLightbox();
  };
  doc.addEventListener('keydown', escHandler, true);
}

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.gametxt-avatar-lightbox {
  position: fixed;
  inset: 0;
  z-index: 10050;
  display: grid;
  place-items: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(20, 18, 16, 0.48);
  cursor: zoom-out;
}
.gametxt-avatar-lightbox-frame {
  max-width: min(72vw, 280px);
  max-height: min(60vh, 360px);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.28);
  background: rgba(0, 0, 0, 0.2);
  cursor: default;
}
.gametxt-avatar-lightbox-img {
  display: block;
  width: auto;
  height: auto;
  max-width: min(72vw, 280px);
  max-height: min(60vh, 360px);
  object-fit: contain;
  object-position: center top;
}
@media (min-width: 768px) {
  .gametxt-avatar-lightbox-frame,
  .gametxt-avatar-lightbox-img {
    max-width: min(36vw, 360px);
    max-height: min(70vh, 420px);
  }
}
`;
  doc.head.append(style);
}
