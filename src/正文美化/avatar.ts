const HOSTS = ['files.catbox.moe', 'i.ibb.co', 'wsrv.nl'];
const DATABASE = 'status-avatar-db';
const STORE = 'avatars';
const BINDINGS = 'dlc-combat-actor-bindings';

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

export type AvatarIndex = {
  urlFor(name: string): string;
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

/** 外部链接只接受战斗美化同一组图床，排除 svg。状态栏里手填的地址不走这里。 */
export function allowedExternalUrl(value: string): string {
  const raw = text(value);
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !HOSTS.includes(url.hostname.toLowerCase())) return '';
    const decoded = decodeURIComponent(raw.toLowerCase());
    return decoded.includes('.svg') || decoded.includes('image/svg+xml') ? '' : raw;
  } catch {
    return '';
  }
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
    return { urlFor: () => '' };
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
    return `${character}|${parts.join('|')}`;
  } catch {
    return '';
  }
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
  return {
    urlFor(name: string): string {
      const key = canonicalName(name);
      if (!key) return '';
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
