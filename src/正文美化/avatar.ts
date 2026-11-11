const HOSTS = ['files.catbox.moe', 'i.ibb.co', 'wsrv.nl'];
const DATABASE = 'status-avatar-db';
const STORE = 'avatars';
const BINDINGS = 'dlc-combat-actor-bindings';
const IMAGE_EXT_RE = /\.(avif|bmp|gif|jpe?g|png|webp)(?:$|\?)/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)(?:$|\?)/i;

type AvatarRecord = {
  scope_key?: string;
  owner_type?: string;
  owner_name?: string;
  source_type?: string;
  value?: string;
  updated_at?: number;
  key?: string;
};

type PartnerAvatar = {
  key: string;
  url: string;
};

type Binding = {
  name?: string;
};

type GalleryItem = {
  title: string;
  url: string;
};

type CharacterProfile = {
  roleColor: string;
  gallery: GalleryItem[];
};

export type AvatarIndex = {
  /** mood 有值时优先表情图，再回退默认头像。 */
  urlFor(name: string, mood?: string): string;
  colorFor(name: string): string;
};

const text = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

export function canonicalName(value: string): string {
  return text(value)
    .replace(/^【\s*(?:蓝方|藍方|红方|紅方)\s*】\s*/, '')
    .replace(/^[[【]\s*([^\]【】[]+?)\s*[\]】]$/, (_match, inner: string) => inner)
    .replace(/[（(]\s*MC\s*[=＝]\s*\d+(?:\.\d+)?\s*[)）]/gi, '')
    .replace(/[（(]\s*\d+\s*\/\s*\d+\s*[)）]/g, '')
    // 半角 · / 全角 ・ / 半角片假名 ･ / 项目符号 • 统一，便于对白与状态栏头像匹配
    .replace(/[·・･•]/g, '·')
    .trim();
}

/** 规范化情绪词，便于与 gallery title「表情 xxx」对齐。 */
export function canonicalMood(value: string): string {
  return text(value)
    .replace(/^表情\s*[:：]?\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** gallery / 外部相簿 title 规范化：表情[:：]?mood 或纯 mood。 */
export function normalizeGalleryTitle(value: string): string {
  return text(value).replace(/\s+/g, ' ').trim();
}

export function expressionTitle(mood: string): string {
  const key = canonicalMood(mood);
  return key ? `表情 ${key}` : '';
}

export function titlesMatchExpression(title: string, mood: string): boolean {
  const want = canonicalMood(mood);
  if (!want) return false;
  const raw = normalizeGalleryTitle(title);
  const stripped = canonicalMood(raw);
  if (stripped === want) return true;
  // 「表情：微笑」/「表情 微笑」
  const compact = raw.replace(/\s+/g, '').replace(/[:：]/g, '');
  return compact === `表情${want}`;
}

/** 外部链接只接受战斗美化同一组图床，排除 svg / 视频。状态栏里手填的地址不走这里。 */
export function allowedExternalUrl(value: string): string {
  const raw = text(value);
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !HOSTS.includes(url.hostname.toLowerCase())) return '';
    const decoded = decodeURIComponent(raw.toLowerCase());
    if (decoded.includes('.svg') || decoded.includes('image/svg+xml')) return '';
    if (VIDEO_EXT_RE.test(decoded)) return '';
    // 无扩展名时仍允许（部分图床短链）；有扩展则须是图片
    const path = url.pathname.toLowerCase();
    if (/\.[a-z0-9]+$/i.test(path) && !IMAGE_EXT_RE.test(path)) return '';
    return raw;
  } catch {
    return '';
  }
}

export function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(text(value));
}

export function absolutizeAvatarUrl(url: string): string {
  const raw = text(url);
  if (!raw) return '';
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  try {
    return new URL(raw, window.parent.location.href).href;
  } catch {
    return raw;
  }
}

let cache: { at: number; index: AvatarIndex } | null = null;

export function invalidateAvatarCache(): void {
  cache = null;
}

export async function loadAvatarIndex(): Promise<AvatarIndex> {
  if (cache && Date.now() - cache.at < 2000) return cache.index;
  try {
    const index = await buildAvatarIndex();
    cache = { at: Date.now(), index };
    return index;
  } catch (error) {
    console.error('[正文美化] 读取头像失败', error);
    return { urlFor: () => '', colorFor: () => '' };
  }
}

/** 用于轮询侦测状态栏头像库是否变化；不含完整 value，避免大图开销。 */
export async function avatarFingerprint(): Promise<string> {
  try {
    const character = text(getCurrentCharacterName()) || 'unknown-character';
    const records = await readRecords(`status:${character}`);
    const parts = records
      .map(record =>
        [
          text(record.owner_type),
          text(record.owner_name),
          text(record.source_type),
          String(record.updated_at ?? 0),
          String(text(record.value).length),
        ].join(':'),
      )
      .sort();
    const profiles = loadProfiles();
    const profileSig = [...profiles.entries()]
      .map(([name, profile]) => `${name}:${profile.roleColor}:${profile.gallery.length}`)
      .sort()
      .join('|');
    return `${character}|${parts.join('|')}|${profileSig}`;
  } catch {
    return '';
  }
}

/** 从聊天变量读取角色管理库档案。 */
export function loadProfiles(): Map<string, CharacterProfile> {
  const map = new Map<string, CharacterProfile>();
  try {
    const chat = getVariables({ type: 'chat' });
    const charInfo = asRecord(chat?.char_info);
    const profiles = asRecord(charInfo?.profiles);
    if (!profiles) return map;
    for (const [name, raw] of Object.entries(profiles)) {
      const key = canonicalName(name);
      const profile = asRecord(raw);
      if (!key || !profile) continue;
      const roleColor = pickRoleColor(profile);
      const gallery = readGalleryItems(profile.gallery);
      map.set(key, { roleColor, gallery });
    }
  } catch {
    /* 聊天变量不可用 */
  }
  return map;
}

function pickRoleColor(profile: Record<string, unknown>): string {
  for (const key of ['role_color', 'roleColor', 'custom_racecolor', 'raceColor']) {
    const value = text(profile[key]);
    if (isHexColor(value)) return value;
  }
  return '';
}

function readGalleryItems(raw: unknown): GalleryItem[] {
  if (!Array.isArray(raw)) return [];
  const items: GalleryItem[] = [];
  for (const entry of raw) {
    const record = asRecord(entry);
    if (!record) continue;
    const title = normalizeGalleryTitle(text(record.title));
    if (!title) continue;
    const url = firstImageUrl(record);
    if (!url) continue;
    items.push({ title, url });
  }
  return items;
}

function firstImageUrl(record: Record<string, unknown>): string {
  const direct = allowedExternalUrl(text(record.url));
  if (direct) return direct;
  const sources = record.sources;
  if (!Array.isArray(sources)) return '';
  for (const source of sources) {
    const url = allowedExternalUrl(text(source));
    if (url) return url;
  }
  return '';
}

function externalGalleryMap(): Map<string, GalleryItem[]> {
  const map = new Map<string, GalleryItem[]>();
  try {
    const chat = getVariables({ type: 'chat' });
    const status = asRecord(chat?.status);
    const external = asRecord(status?.externalGalleries);
    const partners = asRecord(external?.partners);
    if (!partners) return map;
    for (const [name, raw] of Object.entries(partners)) {
      const key = canonicalName(name);
      const partner = asRecord(raw);
      if (!key || !partner) continue;
      const images = Array.isArray(partner.images) ? partner.images : [];
      const items: GalleryItem[] = [];
      for (const image of images) {
        const record = asRecord(image);
        if (!record) continue;
        const title = normalizeGalleryTitle(text(record.title));
        const url = allowedExternalUrl(text(record.url)) || firstImageUrl(record);
        if (!title || !url) continue;
        items.push({ title, url });
      }
      if (items.length) map.set(key, items);
    }
  } catch {
    /* ignore */
  }
  return map;
}

async function buildAvatarIndex(): Promise<AvatarIndex> {
  const character = text(getCurrentCharacterName()) || 'unknown-character';
  const records = await readRecords(`status:${character}`);
  const recorded = new Map(records.map(record => [`${record.owner_type}::${record.owner_name}`, record]));
  const own = (type: string, name: string): string | null => {
    const record = recorded.get(`${type}::${name}`);
    if (!record) return null;
    return record.source_type === 'removed' ? '' : text(record.value);
  };

  const profiles = loadProfiles();
  const externalGalleries = externalGalleryMap();
  const stat = statData();
  const externalPartners = externalPartnerMap();
  const playerRecord = own('player', '主角');
  const player = playerRecord !== null ? playerRecord : await userAvatar();
  const protagonist = asRecord(stat.主角) ?? {};
  const playerNames = new Set(
    [protagonist.姓名, protagonist.名称, SillyTavern.name1].map(item => canonicalName(text(item))).filter(Boolean),
  );

  const partners = new Map<string, PartnerAvatar>();
  const names = new Set<string>([
    ...Object.keys(asRecord(stat.关系列表) ?? {}),
    ...records.filter(record => record.owner_type === 'partner').map(record => text(record.owner_name)),
    ...Object.keys(externalPartners),
    ...[...profiles.keys()],
  ]);
  for (const name of names) {
    if (!name) continue;
    const custom = own('partner', name);
    const external = allowedExternalUrl(text(asRecord(externalPartners[name])?.url));
    const url = custom !== null ? custom : external;
    const key = canonicalName(name);
    if (url && key) partners.set(key, { key: `relation:${name}`, url });
  }

  const bindings = readBindings();

  const statusOrExternal = (key: string): string => {
    const bound = Object.entries(bindings).find(
      ([, binding]) => binding && canonicalName(text(binding.name)) === key,
    );
    if (bound) {
      if (bound[0] === 'player') return player;
      const partner = [...partners.values()].find(entry => entry.key === bound[0]);
      return partner?.url ?? '';
    }
    if (playerNames.has(key) && !bindings.player) return player;
    const partner = partners.get(key);
    return partner && !bindings[partner.key] ? partner.url : '';
  };

  const galleryUrl = (key: string, matcher: (title: string) => boolean): string => {
    const fromProfile = profiles.get(key)?.gallery ?? [];
    const fromExternal = externalGalleries.get(key) ?? [];
    for (const item of [...fromProfile, ...fromExternal]) {
      if (matcher(item.title)) return item.url;
    }
    return '';
  };

  return {
    colorFor(name: string): string {
      const key = canonicalName(name);
      if (!key) return '';
      return profiles.get(key)?.roleColor ?? '';
    },
    urlFor(name: string, mood?: string): string {
      const key = canonicalName(name);
      if (!key) return '';
      const moodKey = canonicalMood(mood ?? '');
      if (moodKey) {
        const expr = galleryUrl(key, title => titlesMatchExpression(title, moodKey));
        if (expr) return expr;
      }
      const status = statusOrExternal(key);
      if (status) return status;
      const main = galleryUrl(key, title => normalizeGalleryTitle(title) === '主立绘');
      if (main) return main;
      return '';
    },
  };
}

function statData(): Record<string, unknown> {
  let current = -1;
  try {
    current = getLastMessageId();
  } catch {
    current = -1;
  }
  for (const messageId of [...new Set([current, -1])]) {
    try {
      const data = getVariables({ type: 'message', message_id: messageId });
      const stat = asRecord(data?.stat_data);
      if (stat) return stat;
    } catch {
      /* 换一条楼层变量 */
    }
  }
  return {};
}

function externalPartnerMap(): Record<string, unknown> {
  try {
    const chat = getVariables({ type: 'chat' });
    const status = asRecord(chat?.status);
    const external = asRecord(status?.externalAvatars);
    return asRecord(external?.partners) ?? {};
  } catch {
    return {};
  }
}

function readBindings(): Record<string, Binding> {
  try {
    const chatId = text(SillyTavern.getCurrentChatId?.() || SillyTavern.chatId);
    const store = JSON.parse(window.parent.localStorage.getItem(BINDINGS) || '{}') as unknown;
    const saved = asRecord(store)?.[chatId];
    const record = asRecord(saved);
    if (!record) return {};
    const bindings: Record<string, Binding> = {};
    for (const [key, value] of Object.entries(record)) {
      const binding = asRecord(value);
      if (binding) bindings[key] = { name: text(binding.name) };
    }
    return bindings;
  } catch {
    return {};
  }
}

async function userAvatar(): Promise<string> {
  const macro = '{' + '{userAvatarPath}' + '}';
  try {
    const value = text(await Promise.resolve(SillyTavern.substituteParams(macro)));
    if (value && value !== macro && !value.includes('{')) return value;
  } catch {
    /* 改从用户楼层头像取 */
  }
  try {
    const images = window.parent.document.querySelectorAll('#chat .mes[is_user="true"] .avatar img');
    const image = images[images.length - 1];
    return image?.getAttribute('src')?.trim() || '';
  } catch {
    return '';
  }
}

async function readRecords(scopeKey: string): Promise<AvatarRecord[]> {
  const idb = parentIndexedDB();
  if (!idb) return [];
  try {
    if (typeof idb.databases === 'function') {
      const names = await idb.databases();
      if (!names.some(entry => entry.name === DATABASE)) return [];
    }
  } catch {
    /* 打不开数据库列表时仍尝试打开 */
  }

  const db = await new Promise<IDBDatabase | null>(resolve => {
    let created = false;
    let request: IDBOpenDBRequest;
    try {
      request = idb.open(DATABASE);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      created = true;
      try {
        request.transaction?.abort();
      } catch {
        /* 事务已经结束 */
      }
    };
    request.onsuccess = () => {
      const result = request.result;
      if (created || !result.objectStoreNames.contains(STORE)) {
        result.close();
        resolve(null);
        return;
      }
      resolve(result);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  if (!db) return [];

  try {
    return await new Promise<AvatarRecord[]>(resolve => {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const query = store.indexNames.contains('scope_key') ? store.index('scope_key').getAll(scopeKey) : store.getAll();
      query.onsuccess = () => {
        const rows = (query.result || []) as AvatarRecord[];
        resolve(rows.filter(record => record && record.scope_key === scopeKey));
      };
      query.onerror = () => resolve([]);
    });
  } catch {
    return [];
  } finally {
    db.close();
  }
}

function parentIndexedDB(): IDBFactory | null {
  try {
    const parent = window.parent;
    if (parent.origin && parent.origin !== 'null' && parent.indexedDB) return parent.indexedDB;
  } catch {
    /* 跨域时读不到父页面数据库 */
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
