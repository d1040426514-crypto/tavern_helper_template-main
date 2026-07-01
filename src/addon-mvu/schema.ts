/** 消息楼层变量中 addon 数据的顶层键名 */
export const ADDON_KEY = 'addon_data';

/**
 * addon 变量结构 (严格模式, 对齐 MVU stat_data 的 zod 用法).
 *
 * 使用 z.object: parse 时剥离未在 schema 声明的顶层键 (与 示例/角色卡示例/schema.ts 一致).
 * 扩展方式: 在 addonSchemaShape 内追加字段,
 * 写法参考 `.cursor/rules/mvu角色卡.md`.
 * 构建时自动生成 `schema.json` (export 名 `Schema` 供 dump_schema 使用).
 */
const addonSchemaShape = {
  $meta: z
    .object({
      版本: z.string().prefault('1.0.0'),
    })
    .prefault({}),

  // --- 在此下方追加 addon 业务字段 ---
  // 示例:
  // 助手: z.object({ 计数: z.coerce.number().prefault(0) }).prefault({}),
};

export const AddonSchema = z.object(addonSchemaShape).prefault({});

/** 与 MVU 角色卡一致, 供 dump_schema 生成 schema.json */
export const Schema = AddonSchema;

export type AddonData = z.infer<typeof AddonSchema>;

export const DEFAULT_ADDON_DATA: AddonData = AddonSchema.parse({});
