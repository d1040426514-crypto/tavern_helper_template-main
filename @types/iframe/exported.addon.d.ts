declare namespace Addon {
  type AddonData = Record<string, unknown> & {
    $meta?: {
      版本?: string;
      [key: string]: unknown;
    };
  };

  type AddonWrapper = {
    addon_data: AddonData;
  };

  type JsonPatchOp =
    | { op: 'replace'; path: string; value: unknown }
    | { op: 'delta'; path: string; value: number }
    | { op: 'insert'; path: string; value: unknown }
    | { op: 'remove'; path: string }
    | { op: 'move'; from: string; to: string };
}

/**
 * addon-mvu 脚本提供的全局接口, 与 MVU 变量框架平行, 作用于 addon_data.
 * **在使用之前, 你应该先通过 `await waitGlobalInitialized('Addon')` 来等待 Addon 初始化完毕**
 */
declare const Addon: {
  events: {
    /** 某轮 addon 变量更新开始时触发 */
    VARIABLE_UPDATE_STARTED: 'addon_variable_update_started';

    /**
     * patch 解析完成、应用前触发; listener 可修改 ops 数组
     *
     * @example
     * eventOn(Addon.events.PATCH_PARSED, (_old, ops) => {
     *   ops.forEach(op => {
     *     if ('path' in op) op.path = op.path.replaceAll('-', '');
     *   });
     * });
     */
    PATCH_PARSED: 'addon_patch_parsed';

    /** addon 变量更新结束、写回前触发; listener 可修改 new_data.addon_data */
    VARIABLE_UPDATE_ENDED: 'addon_variable_update_ended';
  };

  /**
   * 获取指定楼层的 addon 变量包装对象
   *
   * @example
   * const { addon_data } = Addon.getAddonData({ type: 'message', message_id: 'latest' });
   */
  getAddonData: (options: Extract<VariableOption, { type: 'message' }>) => Addon.AddonWrapper;

  /**
   * 将 addon 变量写回指定楼层
   *
   * @example
   * Addon.replaceAddonData({ addon_data: { ... } }, { type: 'message', message_id: 'latest' });
   */
  replaceAddonData: (data: Addon.AddonWrapper, options: Extract<VariableOption, { type: 'message' }>) => void;

  /**
   * 解析消息中的 `<AddonJSONPatch>`, 不写回楼层; 无有效更新时返回 undefined
   *
   * @example
   * const old = Addon.getAddonData({ type: 'message', message_id: 'latest' });
   * const next = await Addon.parseMessage(message, old);
   */
  parseMessage: (message: string, old_data: Addon.AddonWrapper) => Promise<Addon.AddonWrapper | undefined>;

  /** 对指定楼层 inherit + parse + patch (含事件钩子) */
  processFloor: (message_id?: number | 'latest') => Promise<void>;

  /** generate 等同层未新建楼层时使用 */
  applyAddonUpdateFromMessage: (message: string, message_id?: number) => Promise<Addon.AddonData>;

  /** 确保楼层存在 addon_data, 缺失时 inherit */
  ensureAddonData: (message_id: number) => Addon.AddonData;
};

interface ListenerType {
  [Addon.events.VARIABLE_UPDATE_STARTED]: (variables: Addon.AddonWrapper) => void;

  [Addon.events.PATCH_PARSED]: (variables: Addon.AddonWrapper, ops: Addon.JsonPatchOp[], message_content: string) => void;

  [Addon.events.VARIABLE_UPDATE_ENDED]: (variables: Addon.AddonWrapper, variables_before_update: Addon.AddonWrapper) => void;
}
