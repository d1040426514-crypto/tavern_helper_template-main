<template>
  <section v-if="visible" class="ac-brief-section" id="brief-econ">
    <h3 class="ac-brief-h">世界经济简报</h3>

    <div v-if="climateVisible" class="ac-sub-stack">
      <h4 class="ac-brief-subh">世界经济气候</h4>
      <div v-if="phase" class="ac-prose-block">
        <div class="ac-kv-key">整体周期相位</div>
        <div class="ac-prose">{{ phase }}</div>
      </div>
      <div v-if="zones.length" class="ac-card-grid">
        <div v-for="[name, st] in zones" :key="name" class="ac-mini-card">
          <div class="ac-mini-card-title">{{ name }}</div>
          <div class="ac-muted">{{ textOf(st?.状态) }}</div>
          <div class="ac-mini-card-line">产业：{{ textOf(st?.主导产业) || '—' }}</div>
          <div class="ac-mini-card-line">需求：{{ textOf(st?.需求品类) || '—' }}</div>
        </div>
      </div>
    </div>

    <div v-if="commodityVisible" class="ac-sub-stack">
      <h4 class="ac-brief-subh">大宗商品市场</h4>
      <div class="ac-card-grid">
        <div v-if="hasCommodity('粮食')" class="ac-mini-card">
          <div class="ac-mini-card-title">粮食</div>
          <KvGrid :data="econ?.大宗商品市场?.粮食" :labels="['供需', '主要影响因素', '价格趋势']" :cols="1" />
        </div>
        <div v-if="hasCommodity('矿产')" class="ac-mini-card">
          <div class="ac-mini-card-title">矿产</div>
          <KvGrid :data="econ?.大宗商品市场?.矿产" :labels="['供需', '重点品种', '价格趋势']" :cols="1" />
        </div>
        <div v-if="hasCommodity('能源')" class="ac-mini-card">
          <div class="ac-mini-card-title">能源</div>
          <KvGrid :data="econ?.大宗商品市场?.能源" :labels="['供需', '类型', '价格趋势']" :cols="1" />
        </div>
      </div>
    </div>

    <div v-if="moneyVisible" class="ac-sub-stack">
      <h4 class="ac-brief-subh">货币与金融</h4>
      <div v-if="baseUnit" class="ac-prose-block">
        <div class="ac-kv-key">基准计价单位</div>
        <div class="ac-prose">{{ baseUnit }}</div>
      </div>
      <div v-if="currencies.length" class="ac-fx-list">
        <div v-for="[name, c] in currencies" :key="name" class="ac-fx-row">
          <div class="ac-fx-name">{{ name }}</div>
          <div class="ac-fx-rates">
            <span>本期 {{ textOf(c?.汇率?.本期) || '—' }}</span>
            <span class="ac-muted">上期 {{ textOf(c?.汇率?.上期) || '—' }}</span>
            <ChangeBadge :value="c?.汇率?.涨跌" />
          </div>
          <div v-if="textOf(c?.市场情绪)" class="ac-mini-card-line">情绪：{{ textOf(c?.市场情绪) }}</div>
          <div v-if="textOf(c?.驱动因素)" class="ac-mini-card-line">驱动：{{ textOf(c?.驱动因素) }}</div>
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
      <h4 class="ac-brief-subh">投机市场</h4>
      <div v-if="specMood" class="ac-prose-block">
        <div class="ac-kv-key">市场整体情绪</div>
        <div class="ac-prose">{{ specMood }}</div>
      </div>
      <KvGrid
        v-if="econ?.投机市场?.投机指数"
        :data="econ.投机市场.投机指数"
        :labels="['报', '周涨跌']"
        :cols="2"
      />
      <FoldBlock
        v-for="[name, node] in specAssets"
        :key="name"
        :title="name"
        :badge="textOf(node?.涨跌)"
        :summary="`${textOf(node?.当前价格)} · ${textOf(node?.类型)}`"
      >
        <div class="ac-fx-rates" style="margin-bottom: 8px">
          <span>现价 {{ textOf(node?.当前价格) || '—' }}</span>
          <span class="ac-muted">上期 {{ textOf(node?.上期价格) || '—' }}</span>
          <ChangeBadge :value="node?.涨跌" />
        </div>
        <KvGrid
          :data="node"
          :labels="['类型', '交易热度', '量能', '驱动事件']"
          :cols="1"
        />
      </FoldBlock>
      <FoldBlock
        v-for="[name, node] in futures"
        :key="'f-' + name"
        :title="'期货 · ' + name"
        :summary="`近月 ${textOf(node?.近月价格)} / 远月 ${textOf(node?.远月价格)}`"
      >
        <KvGrid :data="node" :labels="['近月价格', '远月价格', '基差']" :cols="3" />
      </FoldBlock>
    </div>

    <div v-if="tradeVisible" class="ac-sub-stack">
      <h4 class="ac-brief-subh">贸易格局</h4>
      <div v-if="routes.length" class="ac-card-grid">
        <div v-for="[name, st] in routes" :key="name" class="ac-mini-card">
          <div class="ac-mini-card-title">{{ name }}</div>
          <div class="ac-muted">{{ textOf(st?.状态) }}</div>
          <div class="ac-mini-card-line">{{ textOf(st?.原因) }}</div>
        </div>
      </div>
      <div v-if="policies.length" class="ac-nested">
        <div class="ac-kv-key">贸易政策</div>
        <div v-for="[k, v] in policies" :key="k" class="ac-timeline-row">
          <strong>{{ k }}</strong>
          <span>{{ textOf(v) }}</span>
        </div>
      </div>
    </div>

    <div v-if="econEvents.length" class="ac-sub-stack">
      <h4 class="ac-brief-subh">经济事件</h4>
      <FoldBlock
        v-for="[name, node] in econEvents"
        :key="name"
        :title="name"
        :summary="textOf(node?.当前态势) || textOf(node?.描述).slice(0, 40)"
      >
        <KvGrid :data="node" :labels="['描述', '影响维度', '当前态势']" :cols="1" />
      </FoldBlock>
    </div>
  </section>
</template>

<script setup lang="ts">
import { entriesOf, hasAnyText, isNonEmptyText, textOf } from '../../brief-utils';
import ChangeBadge from './ChangeBadge.vue';
import FoldBlock from './FoldBlock.vue';
import KvGrid from './KvGrid.vue';

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
const specVisible = computed(
  () =>
    isNonEmptyText(specMood.value) ||
    specAssets.value.length > 0 ||
    futures.value.length > 0 ||
    hasAnyText(econ.value?.投机市场?.投机指数, ['报', '周涨跌']),
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
