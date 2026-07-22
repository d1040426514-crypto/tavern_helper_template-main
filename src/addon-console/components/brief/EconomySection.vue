<template>
  <div v-if="visible" id="brief-econ" class="ac-econ-page">
    <div v-if="climateVisible" class="ac-sub-stack">
      <h4 class="ac-brief-subh">🌡️ 世界经济气候</h4>
      <div v-if="phase" class="ac-econ-summary">
        <span class="ac-econ-summary-label">整体周期相位</span>
        <span class="ac-econ-summary-value">{{ phase }}</span>
      </div>
      <div v-if="zones.length" class="ac-trade-regions-grid">
        <div v-for="[name, st] in zones" :key="name" class="ac-region-card">
          <div class="ac-region-name">{{ name }}</div>
          <div class="ac-region-status">{{ textOf(st?.状态) || '—' }}</div>
          <div class="ac-region-industry">产业：{{ textOf(st?.主导产业) || '—' }}</div>
          <div class="ac-region-industry">需求：{{ textOf(st?.需求品类) || '—' }}</div>
        </div>
      </div>
    </div>

    <div v-if="commodityVisible" class="ac-sub-stack">
      <h4 class="ac-brief-subh">📦 大宗商品市场</h4>
      <div class="ac-card-grid">
        <div v-if="hasCommodity('粮食')" class="ac-region-card">
          <div class="ac-region-name">🌾 粮食</div>
          <KvGrid :data="econ?.大宗商品市场?.粮食" :labels="['供需', '主要影响因素', '价格趋势']" :cols="1" />
        </div>
        <div v-if="hasCommodity('矿产')" class="ac-region-card">
          <div class="ac-region-name">⛏️ 矿产</div>
          <KvGrid :data="econ?.大宗商品市场?.矿产" :labels="['供需', '重点品种', '价格趋势']" :cols="1" />
        </div>
        <div v-if="hasCommodity('能源')" class="ac-region-card">
          <div class="ac-region-name">⚡ 能源</div>
          <KvGrid :data="econ?.大宗商品市场?.能源" :labels="['供需', '类型', '价格趋势']" :cols="1" />
        </div>
      </div>
    </div>

    <div v-if="moneyVisible" class="ac-sub-stack">
      <h4 class="ac-brief-subh">
        💱 货币与金融
        <span v-if="baseUnit" class="ac-econ-inline">基准 · {{ baseUnit }}</span>
      </h4>
      <div v-if="currencies.length" class="ac-currency-grid">
        <div v-for="[name, c] in currencies" :key="name" class="ac-currency-card">
          <div class="ac-currency-name">{{ name }}</div>
          <div class="ac-currency-rate">{{ textOf(c?.汇率?.本期) || '—' }}</div>
          <div class="ac-currency-prev">上期 {{ textOf(c?.汇率?.上期) || '—' }}</div>
          <ChangeBadge :value="c?.汇率?.涨跌" />
          <div v-if="textOf(c?.市场情绪)" class="ac-currency-meta">情绪：{{ textOf(c?.市场情绪) }}</div>
          <div v-if="textOf(c?.驱动因素)" class="ac-currency-meta">驱动：{{ textOf(c?.驱动因素) }}</div>
        </div>
      </div>
      <KvGrid
        v-if="econ?.货币与金融?.汇率波动指数"
        :data="econ.货币与金融.汇率波动指数"
        :labels="['综合汇率波动率', '主要影响因素']"
        :cols="1"
      />
      <KvGrid
        v-if="econ?.货币与金融?.信贷环境"
        :data="econ.货币与金融.信贷环境"
        :labels="['状态', '系统性风险']"
        :cols="2"
      />
    </div>

    <div v-if="specVisible" class="ac-sub-stack">
      <h4 class="ac-brief-subh">📈 投机市场</h4>
      <div v-if="specMood || hasSpecIndex" class="ac-econ-summary">
        <template v-if="specMood">
          <span class="ac-econ-summary-label">市场情绪</span>
          <span class="ac-econ-summary-value">{{ specMood }}</span>
        </template>
        <span v-if="specMood && hasSpecIndex" class="ac-econ-summary-sep" aria-hidden="true">·</span>
        <template v-if="hasSpecIndex">
          <span class="ac-econ-summary-label">报</span>
          <span class="ac-econ-summary-value">{{ textOf(econ?.投机市场?.投机指数?.报) || '—' }}</span>
          <ChangeBadge :value="econ?.投机市场?.投机指数?.周涨跌" />
        </template>
      </div>
      <div v-if="specAssets.length" class="ac-spec-grid">
        <div v-for="[name, node] in specAssets" :key="name" class="ac-spec-card">
          <div class="ac-spec-title">{{ name }}</div>
          <div class="ac-currency-rate" style="font-size: 1.15rem">
            {{ textOf(node?.当前价格) || '—' }}
          </div>
          <div class="ac-currency-prev">上期 {{ textOf(node?.上期价格) || '—' }}</div>
          <ChangeBadge :value="node?.涨跌" />
          <div class="ac-spec-meta">{{ textOf(node?.类型) }}</div>
          <div v-if="textOf(node?.交易热度)" class="ac-spec-meta">热度：{{ textOf(node?.交易热度) }}</div>
          <div v-if="textOf(node?.量能)" class="ac-spec-meta">量能：{{ textOf(node?.量能) }}</div>
          <div v-if="textOf(node?.驱动事件)" class="ac-spec-meta">驱动：{{ textOf(node?.驱动事件) }}</div>
        </div>
      </div>
      <div v-if="futures.length" class="ac-spec-grid">
        <div v-for="[name, node] in futures" :key="'f-' + name" class="ac-spec-card">
          <div class="ac-spec-title">期货 · {{ name }}</div>
          <div class="ac-spec-meta">近月 {{ textOf(node?.近月价格) || '—' }}</div>
          <div class="ac-spec-meta">远月 {{ textOf(node?.远月价格) || '—' }}</div>
          <div class="ac-spec-meta">基差 {{ textOf(node?.基差) || '—' }}</div>
        </div>
      </div>
    </div>

    <div v-if="tradeVisible" class="ac-sub-stack">
      <h4 class="ac-brief-subh">🚢 贸易格局</h4>
      <div v-if="routes.length" class="ac-trade-regions-grid">
        <div v-for="[name, st] in routes" :key="name" class="ac-region-card">
          <div class="ac-region-name">{{ name }}</div>
          <div class="ac-region-status">{{ textOf(st?.状态) }}</div>
          <div class="ac-region-industry">{{ textOf(st?.原因) }}</div>
        </div>
      </div>
      <div v-if="policies.length" class="ac-sub-stack" style="margin-top: 8px">
        <h4 class="ac-brief-subh">📜 贸易政策</h4>
        <div v-for="[k, v] in policies" :key="k" class="ac-timeline-node">
          <strong>{{ k }} · </strong>
          <span>{{ textOf(v) }}</span>
        </div>
      </div>
    </div>

    <div v-if="econEvents.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">📰 经济事件</h4>
      <div
        v-for="[name, node] in econEvents"
        :key="name"
        class="ac-timeline-node"
      >
        <div class="ac-timeline-node-head">
          <strong>📰 {{ name }}</strong>
        </div>
        <div v-if="textOf(node?.描述)" class="ac-timeline-node-line">{{ textOf(node?.描述) }}</div>
        <div class="ac-econ-event-tags">
          <span v-if="textOf(node?.影响维度)" class="ac-tag">📊 {{ textOf(node?.影响维度) }}</span>
          <StatusTag v-if="textOf(node?.当前态势)" :value="node?.当前态势" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { entriesOf, hasAnyText, isNonEmptyText, textOf } from '../../brief-utils';
import ChangeBadge from './ChangeBadge.vue';
import KvGrid from './KvGrid.vue';
import StatusTag from './StatusTag.vue';

const props = defineProps<{ world: Record<string, any> | null }>();

const econ = computed(() => props.world?.世界经济简报 as Record<string, any> | undefined);
const phase = computed(() => textOf(econ.value?.世界经济气候?.整体周期相位).trim());
const zones = computed(() => entriesOf(econ.value?.世界经济气候?.主要贸易区状态));
const climateVisible = computed(() => isNonEmptyText(phase.value) || zones.value.length > 0);

function hasCommodity(key: '粮食' | '矿产' | '能源'): boolean {
  const block = econ.value?.大宗商品市场?.[key];
  if (key === '粮食') return hasAnyText(block, ['供需', '主要影响因素', '价格趋势']);
  if (key === '矿产') return hasAnyText(block, ['供需', '重点品种', '价格趋势']);
  return hasAnyText(block, ['供需', '类型', '价格趋势']);
}
const commodityVisible = computed(
  () => hasCommodity('粮食') || hasCommodity('矿产') || hasCommodity('能源'),
);

const baseUnit = computed(() => textOf(econ.value?.货币与金融?.基准计价单位).trim());
const currencies = computed(() => entriesOf(econ.value?.货币与金融?.流通货币));
const moneyVisible = computed(
  () =>
    isNonEmptyText(baseUnit.value) ||
    currencies.value.length > 0 ||
    hasAnyText(econ.value?.货币与金融?.汇率波动指数, ['综合汇率波动率', '主要影响因素']) ||
    hasAnyText(econ.value?.货币与金融?.信贷环境, ['状态', '系统性风险']),
);

const specMood = computed(() => textOf(econ.value?.投机市场?.市场整体情绪).trim());
const specAssets = computed(() => entriesOf(econ.value?.投机市场?.主要交易标的));
const futures = computed(() => entriesOf(econ.value?.投机市场?.期货合约));
const hasSpecIndex = computed(() => hasAnyText(econ.value?.投机市场?.投机指数, ['报', '周涨跌']));
const specVisible = computed(
  () =>
    isNonEmptyText(specMood.value) ||
    specAssets.value.length > 0 ||
    futures.value.length > 0 ||
    hasSpecIndex.value,
);

const routes = computed(() => entriesOf(econ.value?.贸易格局?.主要商路));
const policies = computed(() => entriesOf(econ.value?.贸易格局?.贸易政策));
const tradeVisible = computed(() => routes.value.length > 0 || policies.value.length > 0);

const econEvents = computed(() => entriesOf(econ.value?.经济事件));

const visible = computed(
  () =>
    climateVisible.value ||
    commodityVisible.value ||
    moneyVisible.value ||
    specVisible.value ||
    tradeVisible.value ||
    econEvents.value.length > 0,
);
</script>
