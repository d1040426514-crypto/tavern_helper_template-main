export type AttrMap = Record<string, string>;

export type NpcCategoryKey = 'relation' | 'plot' | 'world';

export type NpcReputationItem = {
  label: string;
  value: string;
};

export type NpcSocialPerson = {
  name: string;
  note: string;
};

export type NpcSocialGroup = {
  category: string;
  people: NpcSocialPerson[];
};

export type NpcBackground = {
  group: string;
  circle: string;
  event: string;
};

export type QuestItemStatus = 'done' | 'active' | 'todo';

export type QuestItem = {
  status: QuestItemStatus;
  text: string;
  children: QuestItem[];
};

export type QuestLog = {
  kind: string;
  title: string;
  summary: string;
  items: QuestItem[];
  /** 收束场景，可空 */
  climax: string;
};

export type QuestArchiveEntry = {
  kind: string;
  title: string;
  completedAt: string;
  ending: string;
};

export type NpcCard = {
  name: string;
  actionChain: string[];
  predict: string;
  debutReady: boolean;
  statusParts: string[];
  wealth: string;
  reputation: NpcReputationItem[];
  socialNetwork: NpcSocialGroup[];
  background: NpcBackground;
  longGoal: string;
  nearPlan: string[];
  /** 兼容旧字段；新格式取自 background.event */
  relatedEvent: string;
  recentMemories: string[];
  settledMemories: string[];
  coreMemories: string[];
  /** 可选进行中任务；无标签时为空 */
  questLogs: QuestLog[];
  /** 可选已归档任务；无标签时为空，最多 5 条 */
  questArchive: QuestArchiveEntry[];
  /** 名单内有名但尚无行动落盘 */
  empty?: boolean;
};

export type CategorySection = {
  key: NpcCategoryKey;
  typeLabel: string;
  badge: string;
  icon: string;
  names: string[];
  npcs: NpcCard[];
};

export type InteractionEvent = {
  id: string;
  roles: string[];
  summary: string;
  result: string;
};

export type PreviewData = {
  startTime: string;
  endTime: string;
  timeBadge: string;
  relationNames: string[];
  plotNames: string[];
  worldNames: string[];
  interactions: InteractionEvent[];
};

export type ChronicleData = {
  timeBadge: string;
  sections: CategorySection[];
  interactions: InteractionEvent[];
};

export const CATEGORY_META: Record<
  NpcCategoryKey,
  { typeLabel: string; badge: string; icon: string }
> = {
  relation: {
    typeLabel: '不在场关系列表角色',
    badge: 'RELATIONS',
    icon: '🤝',
  },
  plot: {
    typeLabel: '不在场剧情关联背景角色',
    badge: 'PLOT',
    icon: '📖',
  },
  world: {
    typeLabel: '不在场时局背景角色',
    badge: 'WORLD',
    icon: '🌍',
  },
};

export const STATUS_LABELS = ['动作', '穿着', '位置', '正在做'] as const;

export type WealthClass =
  | 'wealth-destitute'
  | 'wealth-poor'
  | 'wealth-tight'
  | 'wealth-balanced'
  | 'wealth-comfortable'
  | 'wealth-welloff'
  | 'wealth-rich'
  | 'wealth-tycoon';
