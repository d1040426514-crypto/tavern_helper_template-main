declare namespace Addon {
  type 叙事指导 = {
    宏观层?: string;
    发展层?: string;
    细节层?: string;
  };

  type 演变纪段基 = {
    前时代称谓?: string;
    后时代称谓?: string;
    描述?: string;
    历史影响?: string;
    关键转折?: string;
  };

  type 正史演变条目 = 演变纪段基 & {
    演变起止?: string;
  };

  type 分歧纪段条目 = 演变纪段基 & {
    纪段起止?: string;
  };

  type 干预态势 = {
    推动力?: string;
    抑止力?: string;
  };

  type 事件节点 = {
    开始日期?: string;
    结束日期?: string;
    干预方向?: string;
    干预强度?: string;
    描述?: string;
    影响?: string;
  };

  type 已完结转折点事件影响条目 = {
    起止日期?: string;
    最终结局?: string;
    事件脉络?: string;
  };

  type 传世轶闻条目 = {
    原典?: boolean;
    关键要素?: string;
    版本流传范围?: string;
    版本成型时代?: string;
    内容梗概?: string;
  };

  type 史诗传奇条目 = {
    基本类型?: string;
    核心母题关键词?: string;
    史实真相?: string;
    传世轶闻?: Record<string, 传世轶闻条目>;
  };

  type 特异点条目 = {
    分歧源头?: string;
    降临?: boolean;
    事件记录?: Record<string, 分歧纪段条目>;
  };

  type 潜在时代演化条目 = {
    开始日期?: string;
    进度?: string;
    状态?: string;
    推动因子?: string;
    抑止因子?: string;
    描述?: string;
    已完结转折点事件影响?: Record<string, 已完结转折点事件影响条目>;
  };

  type 时代关键转折点条目 = {
    临界事件?: boolean;
    进度?: string;
    干预态势?: 干预态势;
    关联潜在时代?: string;
    描述?: string;
    总体影响?: string;
    事件脉络?: Record<string, 事件节点>;
  };

  type 位面条目 = {
    降临?: boolean;
    平行演化?: boolean;
    当前世界状态?: {
      人理层?: string;
      天道层?: string;
      世界状态摘要?: string;
    };
    岁月史书?: {
      正史?: Record<string, 正史演变条目>;
      特异点?: Record<string, 特异点条目>;
    };
    史诗传奇?: Record<string, 史诗传奇条目>;
    潜在时代演化?: Record<string, 潜在时代演化条目>;
    时代关键转折点?: Record<string, 时代关键转折点条目>;
  };

  type 事件条目 = {
    叙事指导?: 叙事指导;
    开始日期?: string;
    预计结算日期?: string;
    参与角色?: string;
    牵涉团体?: string;
    描述?: string;
    进展?: string;
  };

  type 声誉 = {
    官方?: string;
    民间?: string;
    暗域?: string;
    业界?: string;
  };

  type 核心人物 = {
    身份职务?: string;
    权力支柱?: Record<string, string>;
  };

  type 团体条目 = {
    声誉?: 声誉;
    外交关系?: Record<string, string>;
    权力支柱?: Record<string, string>;
    内政概况?: string;
    发展态势?: string;
    当前动态?: string;
    世界影响?: string;
    核心人物?: Record<string, 核心人物>;
  };

  type AddonData = {
    位面?: Record<string, 位面条目>;
    事件?: {
      世界背景事件?: Record<string, 事件条目>;
      近距离事件?: Record<string, 事件条目>;
    };
    秘闻?: Record<
      string,
      {
        时效?: string;
        知情者名单?: string;
        描述?: string;
      }
    >;
    传闻?: Record<
      string,
      {
        影响力?: string;
        流传范围?: string;
        真相?: string;
        描述?: string;
      }
    >;
    团体?: {
      世界背景团体?: Record<string, 团体条目>;
      近距离团体?: Record<string, 团体条目>;
    };
    因果回响?: Record<
      string,
      {
        时效?: string;
        引入契机?: string;
        描述?: string;
      }
    >;
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
   * 获取供提示词/世界书使用的 addon 快照（隐藏 降临、平行演化 等前端控制字段）
   *
   * @example
   * const { addon_data } = Addon.getDisplayAddonData({ type: 'message', message_id: 'latest' });
   */
  getDisplayAddonData: (options: Extract<VariableOption, { type: 'message' }>) => Addon.AddonWrapper;

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
