/** 消息楼层变量中 addon 数据的顶层键名 */
export const ADDON_KEY = 'addon_data';

/** 严格布尔: 仅接受 JSON true/false */
const strictBoolean = z.boolean().prefault(false);

/** 宽松字符串: 占位符选项在变量更新规则中约束, 不在 Zod 层 enum */
const looseString = z.string().prefault('');

/** 需严格校验的布尔字段名 (深度遍历时剔除非法值) */
export const STRICT_BOOLEAN_KEYS = new Set(['降临', '平行演化', '原典', '临界事件']);

const 叙事指导Schema = z
  .object({
    宏观层: looseString,
    发展层: looseString,
    细节层: looseString,
  })
  .prefault({});

const 声誉Schema = z
  .object({
    官方: looseString,
    民间: looseString,
    暗域: looseString,
    业界: looseString,
  })
  .prefault({});

const 正史演变条目Schema = z
  .object({
    前时代称谓: looseString,
    后时代称谓: looseString,
    演变起止: looseString,
    描述: looseString,
    历史影响: looseString,
    关键转折: looseString,
  })
  .prefault({});

const 分歧纪段条目Schema = z
  .object({
    前时代称谓: looseString,
    后时代称谓: looseString,
    纪段起止: looseString,
    描述: looseString,
    历史影响: looseString,
    关键转折: looseString,
  })
  .prefault({});

const 干预态势Schema = z
  .object({
    推动力: looseString,
    抑止力: looseString,
  })
  .prefault({});

const 事件节点Schema = z
  .object({
    开始日期: looseString,
    结束日期: looseString,
    干预方向: looseString,
    干预强度: looseString,
    描述: looseString,
    影响: looseString,
  })
  .prefault({});

const 权力支柱Record = z.record(z.string(), looseString).prefault({});

const 已完结转折点事件影响条目Schema = z
  .object({
    起止日期: looseString,
    最终结局: looseString,
    事件脉络: looseString,
  })
  .prefault({});

const 核心人物Schema = z
  .object({
    身份职务: looseString,
    权力支柱: 权力支柱Record,
  })
  .prefault({});

const 当前世界状态Schema = z
  .object({
    人理层: looseString,
    天道层: looseString,
    世界状态摘要: looseString,
  })
  .prefault({});

const 特异点Schema = z
  .object({
    分歧源头: looseString,
    降临: strictBoolean,
    事件记录: z.record(z.string(), 分歧纪段条目Schema).prefault({}),
  })
  .prefault({});

const 传世轶闻条目Schema = z
  .object({
    原典: strictBoolean,
    关键要素: looseString,
    版本流传范围: looseString,
    版本成型时代: looseString,
    内容梗概: looseString,
  })
  .prefault({});

const 史诗传奇条目Schema = z
  .object({
    基本类型: looseString,
    核心母题关键词: looseString,
    史实真相: looseString,
    传世轶闻: z.record(z.string(), 传世轶闻条目Schema).prefault({}),
  })
  .prefault({});

const 潜在时代演化条目Schema = z
  .object({
    开始日期: looseString,
    进度: looseString,
    状态: looseString,
    推动因子: looseString,
    抑止因子: looseString,
    描述: looseString,
    已完结转折点事件影响: z.record(z.string(), 已完结转折点事件影响条目Schema).prefault({}),
  })
  .prefault({});

const 时代关键转折点条目Schema = z
  .object({
    临界事件: strictBoolean,
    进度: looseString,
    干预态势: 干预态势Schema,
    关联潜在时代: looseString,
    描述: looseString,
    总体影响: looseString,
    事件脉络: z.record(z.string(), 事件节点Schema).prefault({}),
  })
  .prefault({});

const 位面条目Schema = z
  .object({
    降临: strictBoolean,
    平行演化: strictBoolean,
    当前世界状态: 当前世界状态Schema,
    岁月史书: z
      .object({
        正史: z.record(z.string(), 正史演变条目Schema).prefault({}),
        特异点: z.record(z.string(), 特异点Schema).prefault({}),
      })
      .prefault({}),
    史诗传奇: z.record(z.string(), 史诗传奇条目Schema).prefault({}),
    潜在时代演化: z.record(z.string(), 潜在时代演化条目Schema).prefault({}),
    时代关键转折点: z.record(z.string(), 时代关键转折点条目Schema).prefault({}),
  })
  .prefault({});

const 位面Record = z.record(z.string(), 位面条目Schema);

const 事件条目Schema = z
  .object({
    叙事指导: 叙事指导Schema,
    开始日期: looseString,
    预计结算日期: looseString,
    参与角色: looseString,
    牵涉团体: looseString,
    描述: looseString,
    进展: looseString,
  })
  .prefault({});

const 事件Schema = z
  .object({
    世界背景事件: z.record(z.string(), 事件条目Schema).prefault({}),
    当前区域事件: z.record(z.string(), 事件条目Schema).prefault({}),
  })
  .prefault({});

const 秘闻条目Schema = z
  .object({
    时效: looseString,
    知情者名单: looseString,
    描述: looseString,
  })
  .prefault({});

const 传闻条目Schema = z
  .object({
    影响力: looseString,
    流传范围: looseString,
    真相: looseString,
    描述: looseString,
  })
  .prefault({});

const 团体条目Schema = z
  .object({
    声誉: 声誉Schema,
    外交关系: z.record(z.string(), looseString).prefault({}),
    权力支柱: 权力支柱Record,
    内政概况: looseString,
    发展态势: looseString,
    当前动态: looseString,
    世界影响: looseString,
    核心人物: z.record(z.string(), 核心人物Schema).prefault({}),
  })
  .prefault({});

const 团体Schema = z
  .object({
    世界背景团体: z.record(z.string(), 团体条目Schema).prefault({}),
    当前区域团体: z.record(z.string(), 团体条目Schema).prefault({}),
  })
  .prefault({});

const 因果回响条目Schema = z
  .object({
    时效: looseString,
    引入契机: looseString,
    描述: looseString,
  })
  .prefault({});

const 因果回响Record = z.record(z.string(), 因果回响条目Schema);

/** 深度剔除非法布尔值, 避免整对象 parse 失败 */
export function stripInvalidStrictBooleans(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stripInvalidStrictBooleans);
  }
  const obj = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (STRICT_BOOLEAN_KEYS.has(key)) {
      if (typeof child === 'boolean') {
        next[key] = child;
      }
      continue;
    }
    next[key] = stripInvalidStrictBooleans(child);
  }
  return next;
}

/**
 * addon 变量结构 (对齐 MVU stat_data 的 zod 用法).
 *
 * - 字符串占位选项: 宽松 z.string().prefault(''), 约束写在世界书变量更新规则
 * - 布尔字段: 严格 z.boolean().prefault(false)
 * - 构建时自动生成 `schema.json` (export 名 `Schema` 供 dump_schema 使用)
 */
const addonSchemaShape = {
  位面: 位面Record.prefault({}),
  事件: 事件Schema,
  秘闻: z.record(z.string(), 秘闻条目Schema).prefault({}),
  传闻: z.record(z.string(), 传闻条目Schema).prefault({}),
  团体: 团体Schema,
  因果回响: 因果回响Record.prefault({}),
};

export const AddonSchema = z.object(addonSchemaShape).prefault({});

/** 与 MVU 角色卡一致, 供 dump_schema 生成 schema.json */
export const Schema = AddonSchema;

export type AddonData = z.infer<typeof AddonSchema>;

export const DEFAULT_ADDON_DATA: AddonData = AddonSchema.parse({});

/** 预处理非法布尔 + prefault 补全完整结构 */
export function normalizeAddonData(raw?: unknown): AddonData {
  const cleaned = stripInvalidStrictBooleans(raw ?? {});
  return AddonSchema.parse(cleaned);
}
