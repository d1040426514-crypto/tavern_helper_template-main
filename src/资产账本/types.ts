export type AttrMap = Record<string, string>;

export type NamedBlock = {
  attrs: AttrMap;
  text: string;
  children?: NamedBlock[];
};

export type EntityData = {
  name: string;
  attrs: AttrMap;
  facilities: AttrMap[];
  materials: NamedBlock[];
  equipments: NamedBlock[];
  staffTotal: string;
  roles: AttrMap[];
};

export type OpsLine = NamedBlock & { attrs: AttrMap };

export type BusinessData = {
  name: string;
  attrs: AttrMap;
  revenueTotal: string;
  revenuePeriod: string;
  revenueItems: NamedBlock[];
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
