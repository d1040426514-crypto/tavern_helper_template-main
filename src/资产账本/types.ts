export type AttrMap = Record<string, string>;

export type NamedBlock = {
  attrs: AttrMap;
  text: string;
  children?: NamedBlock[];
};

export type EntityData = {
  name: string;
  location: string;
  attrs: AttrMap;
  facilities: NamedBlock[];
  materials: NamedBlock[];
  equipments: NamedBlock[];
  staffTotal: string;
  staffOnDuty: string;
  staffNote: string;
  roles: AttrMap[];
  keyPersons: NamedBlock[];
};

export type OpsLine = NamedBlock & { attrs: AttrMap };

export type BusinessData = {
  name: string;
  attrs: AttrMap;
  revenueTotal: string;
  revenuePeriod: string;
  revenueItems: NamedBlock[];
  /** 无 <条目> 时的收入正文（如 原因:...） */
  revenueNote: string;
  expenseTotal: string;
  expensePeriod: string;
  expenseItems: NamedBlock[];
  lines: OpsLine[];
  deliverables: AttrMap[];
  deliverAttrs: AttrMap;
  reconcile: NamedBlock;
  netWorth: string;
};

export type ProjectData = {
  name: string;
  attrs: AttrMap;
  text: string;
};

export type OperationsData = {
  name: string;
  attrs: AttrMap;
  /** <主管>/<执事> 的 name 属性 */
  managerName: string;
  /** 标签内文（重点/风险等） */
  manager: string;
  projects: ProjectData[];
};

export type CurrencyBlock = {
  code: string;
  symbol: string;
  attrs: AttrMap;
  text: string;
};

export type LedgerTimeData = {
  raw: string;
  timeLine: string;
  gateText: string;
};

export type LedgerData = {
  ledgerTime: LedgerTimeData;
  periodSummary: string;
  externalFactors: NamedBlock[];
  internalFactors: NamedBlock[];
  cashNote: string;
  currencies: CurrencyBlock[];
  cashBase: string;
  /** 折合基准等号后的流动资金总额展示文案 */
  cashTotal: string;
  entities: EntityData[];
  businesses: BusinessData[];
  operations: OperationsData[];
  /** 顶栏摘要：优先本期结算，其次根属性推断 */
  headline: {
    duration: string;
    status: string;
    delta: string;
  };
};
