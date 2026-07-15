<template>
  <div class="ledger">
    <header
      class="ledger-global-header"
      role="button"
      :aria-expanded="bodyOpen"
      :aria-label="bodyOpen ? '收起资产账簿' : '展开资产账簿'"
      @click="bodyOpen = !bodyOpen"
    >
      <span class="gh-icon" aria-hidden="true">📒</span>
      <span class="gh-main-title">资产账簿</span>
      <span v-if="data.ledgerTime.timeLine" class="gh-subtitle">{{ data.ledgerTime.timeLine }}</span>
      <span class="gh-spacer" aria-hidden="true" />
      <span v-if="data.headline.duration" class="gh-pill">{{ data.headline.duration }}</span>
      <span v-if="data.headline.status" class="gh-pill">{{ data.headline.status }}</span>
      <span v-if="data.headline.delta" class="gh-delta">Δ {{ data.headline.delta }}</span>
      <button
        type="button"
        class="gh-theme-btn"
        title="切换主题"
        @click.stop="emit('toggle-theme')"
      >
        {{ themeDark ? '☀️' : '🌓' }}
      </button>
      <span class="gh-arrow" :class="{ open: bodyOpen }" aria-hidden="true">▾</span>
    </header>

    <div v-show="bodyOpen" class="ledger-body">
      <div class="ledger-toolbar">
        <button type="button" class="tb-btn" @click.stop="emit('expand-all')">全部展开</button>
        <button type="button" class="tb-btn" @click.stop="emit('collapse-all')">全部收起</button>
      </div>

      <!-- 1 宏观概览 -->
      <FoldPanel
        variant="section"
        title="宏观概览"
        emoji="📋"
        badge="OVERVIEW"
        :default-open="false"
        :forced-open="forcedOpen"
      >
        <div v-if="data.ledgerTime.gateText" class="highlight-block">
          <StatRow :text="data.ledgerTime.raw" />
        </div>
        <div v-else-if="data.ledgerTime.raw" class="highlight-block">
          <PreLine :text="data.ledgerTime.raw" />
        </div>

        <div v-if="data.periodSummary" class="highlight-block">
          <div class="hl-label">本期结算</div>
          <StatRow :text="data.periodSummary" />
        </div>

        <FoldPanel
          v-if="data.externalFactors.length"
          variant="sub"
          title="外因"
          emoji="🌊"
          :summary="`${data.externalFactors.length} 项`"
          :default-open="false"
          :forced-open="forcedOpen"
        >
          <div v-for="(f, i) in data.externalFactors" :key="'ext-' + i" class="factor-row">
            <span class="tag tag-primary">{{ f.attrs._tag || '因子' }}</span>
            <StatRow :text="f.text" />
          </div>
        </FoldPanel>

        <FoldPanel
          v-if="data.internalFactors.length"
          variant="sub"
          title="内因"
          emoji="🔬"
          :summary="`${data.internalFactors.length} 项`"
          :default-open="false"
          :forced-open="forcedOpen"
        >
          <div v-for="(f, i) in data.internalFactors" :key="'int-' + i" class="factor-row">
            <span class="tag tag-warm">{{ f.attrs._tag || '因子' }}</span>
            <StatRow :text="f.text" />
          </div>
        </FoldPanel>

        <FoldPanel
          v-if="data.currencies.length || data.cashBase"
          variant="sub"
          title="流动资金"
          emoji="💎"
          :summary="data.cashNote || `${data.currencies.length} 币种`"
          :default-open="false"
          :forced-open="forcedOpen"
        >
          <CurrencyCards v-if="data.currencies.length" :currencies="data.currencies" />
          <div v-if="data.cashBase" class="highlight-block">
            <div class="hl-label">折合基准</div>
            <StatRow :text="data.cashBase" :split-pipes="false" />
          </div>
        </FoldPanel>
      </FoldPanel>

      <!-- 2 资产分布 -->
      <FoldPanel
        v-if="data.entities.length"
        variant="section"
        title="资产分布"
        emoji="🏗️"
        badge="ASSET"
        :summary="`${data.entities.length} 实体`"
        :default-open="false"
        :forced-open="forcedOpen"
      >
        <FoldPanel
          v-for="(ent, ei) in data.entities"
          :key="'ent-' + ei"
          variant="entity"
          :title="ent.name"
          emoji="🏘️"
          :summary="entitySummary(ent)"
          :default-open="false"
          :forced-open="forcedOpen"
        >
          <FoldPanel
            v-if="ent.facilities.length"
            variant="sub"
            title="基础设施"
            :summary="`${ent.facilities.length} 类`"
            :default-open="false"
            :forced-open="forcedOpen"
          >
            <div v-for="(b, bi) in ent.facilities" :key="'f-' + bi" class="item-row">
              <strong>{{ b.type || '设施' }}</strong>
              <span v-if="b.count" class="muted"> ×{{ b.count }}</span>
              <span v-if="b.status" class="tag" :class="statusTagClass(b.status)">{{ b.status }}</span>
              <AttrChips :attrs="b" :hide="['type', 'count', 'status']" />
            </div>
          </FoldPanel>

          <FoldPanel
            v-if="ent.materials.length || ent.equipments.length"
            variant="sub"
            title="仓库"
            :summary="`${ent.materials.length + ent.equipments.length} 项`"
            :default-open="false"
            :forced-open="forcedOpen"
          >
            <FoldPanel
              v-for="(m, mi) in ent.materials"
              :key="'m-' + mi"
              variant="sub"
              :title="pick(m.attrs, 'name') || '物资'"
              :summary="oneLine(m.text)"
              :default-open="false"
              :forced-open="forcedOpen"
            >
              <AttrChips :attrs="m.attrs" :hide="['name']" />
              <StatRow :text="m.text" />
            </FoldPanel>
            <FoldPanel
              v-for="(e, eqi) in ent.equipments"
              :key="'eq-' + eqi"
              variant="sub"
              :title="pick(e.attrs, 'name') || '装备'"
              :summary="oneLine(e.text)"
              :default-open="false"
              :forced-open="forcedOpen"
            >
              <AttrChips :attrs="e.attrs" :hide="['name']" />
              <StatRow :text="e.text" />
            </FoldPanel>
          </FoldPanel>

          <FoldPanel
            v-if="ent.roles.length || ent.staffTotal"
            variant="sub"
            title="人员"
            :summary="ent.staffTotal ? `共 ${ent.staffTotal}` : `${ent.roles.length} 职级`"
            :default-open="false"
            :forced-open="forcedOpen"
          >
            <div v-for="(r, ri) in ent.roles" :key="'r-' + ri" class="item-row">
              <strong>{{ r.role || '职级' }}</strong>
              <span v-if="r.count" class="muted"> ×{{ r.count }}</span>
              <AttrChips :attrs="r" :hide="['role', 'count']" />
            </div>
          </FoldPanel>
        </FoldPanel>
      </FoldPanel>

      <!-- 3 经营效率 -->
      <FoldPanel
        v-if="data.businesses.length"
        variant="section"
        title="经营效率"
        emoji="📈"
        badge="OPS"
        :summary="`${data.businesses.length} 实体`"
        :default-open="false"
        :forced-open="forcedOpen"
      >
        <FoldPanel
          v-for="(biz, bi) in data.businesses"
          :key="'biz-' + bi"
          variant="entity"
          :title="biz.name"
          emoji="📊"
          :summary="bizSummary(biz)"
          :default-open="false"
          :forced-open="forcedOpen"
        >
          <FoldPanel
            variant="sub"
            title="收入"
            emoji="📈"
            :summary="moneySummary(biz.revenueTotal, biz.revenuePeriod)"
            badge="+"
            badge-class="is-plus"
            :default-open="false"
            :forced-open="forcedOpen"
          >
            <FoldPanel
              v-for="(item, ii) in biz.revenueItems"
              :key="'ri-' + ii"
              variant="sub"
              :title="pick(item.attrs, 'name') || '条目'"
              :summary="pick(item.attrs, 'amount') || oneLine(item.text)"
              :badge="pick(item.attrs, 'amount')"
              badge-class="is-plus"
              :default-open="false"
              :forced-open="forcedOpen"
            >
              <AttrChips :attrs="item.attrs" :hide="['name', 'amount']" />
              <StatRow :text="item.text" />
            </FoldPanel>
          </FoldPanel>

          <FoldPanel
            variant="sub"
            title="支出"
            emoji="📉"
            :summary="moneySummary(biz.expenseTotal, biz.expensePeriod)"
            badge="−"
            badge-class="is-minus"
            :default-open="false"
            :forced-open="forcedOpen"
          >
            <FoldPanel
              v-for="(item, ii) in biz.expenseItems"
              :key="'ei-' + ii"
              variant="sub"
              :title="pick(item.attrs, 'name') || '条目'"
              :summary="pick(item.attrs, 'amount') || oneLine(item.text)"
              :badge="pick(item.attrs, 'amount')"
              badge-class="is-minus"
              :default-open="false"
              :forced-open="forcedOpen"
            >
              <AttrChips :attrs="item.attrs" :hide="['name', 'amount']" />
              <StatRow :text="item.text" />
            </FoldPanel>
          </FoldPanel>

          <FoldPanel
            v-if="biz.lines.length"
            variant="sub"
            title="产能"
            emoji="🏗️"
            :summary="`${biz.lines.length} 产线`"
            :default-open="false"
            :forced-open="forcedOpen"
          >
            <FoldPanel
              v-for="(line, li) in biz.lines"
              :key="'ln-' + li"
              variant="sub"
              :title="lineTitle(line.attrs)"
              :badge="pick(line.attrs, 'run')"
              :badge-class="runBadgeClass(line.attrs.run)"
              :default-open="false"
              :forced-open="forcedOpen"
            >
              <AttrChips :attrs="line.attrs" :hide="['building', 'count', 'run']" />
              <StatRow :text="line.text" />
            </FoldPanel>
          </FoldPanel>

          <FoldPanel
            v-if="biz.deliverables.length"
            variant="sub"
            title="可交付"
            emoji="📦"
            :summary="pick(biz.deliverAttrs, '口径') || `${biz.deliverables.length} 品项`"
            :default-open="false"
            :forced-open="forcedOpen"
          >
            <div v-for="(d, di) in biz.deliverables" :key="'d-' + di" class="item-row">
              <strong>{{ d.name || '品项' }}</strong>
              <span v-if="d.qty" class="muted"> {{ d.qty }}{{ d.unit || '' }}</span>
              <span v-if="d.per" class="muted"> / {{ d.per }}</span>
              <AttrChips :attrs="d" :hide="['name', 'qty', 'unit', 'per']" />
            </div>
          </FoldPanel>

          <FoldPanel
            v-if="biz.reconcile.text"
            variant="sub"
            title="闭环校验"
            emoji="🧾"
            :badge="pick(biz.reconcile.attrs, 'result')"
            :badge-class="reconcileClass(biz.reconcile.attrs)"
            :default-open="false"
            :forced-open="forcedOpen"
          >
            <StatRow :text="biz.reconcile.text" />
          </FoldPanel>

          <div v-if="biz.netWorth" class="highlight-block">
            <div class="stat-inline">
              <span class="stat-inline__icon">💎</span>
              <strong>净值</strong>
              <span>{{ biz.netWorth }}</span>
            </div>
          </div>
        </FoldPanel>
      </FoldPanel>

      <!-- 4 运营监控 -->
      <FoldPanel
        v-if="data.operations.length"
        variant="section"
        title="运营监控"
        emoji="🧭"
        badge="MONITOR"
        :summary="`${data.operations.length} 实体`"
        :default-open="false"
        :forced-open="forcedOpen"
      >
        <FoldPanel
          v-for="(op, oi) in data.operations"
          :key="'op-' + oi"
          variant="entity"
          :title="op.name"
          emoji="🧭"
          :summary="oneLine(op.manager)"
          :default-open="false"
          :forced-open="forcedOpen"
        >
          <div v-if="op.manager" class="highlight-block">
            <div class="hl-label">执事</div>
            <StatRow :text="op.manager" />
          </div>

          <FoldPanel
            v-for="(p, pi) in op.projects"
            :key="'p-' + pi"
            variant="sub"
            :title="p.name"
            emoji="🏗️"
            :summary="p.attrs.progress || ''"
            :default-open="false"
            :forced-open="forcedOpen"
          >
            <ProgressBar :attrs="p.attrs" :extra-text="p.text" />
            <AttrChips :attrs="p.attrs" :hide="['name', 'bar', 'progress']" />
            <StatRow :text="p.text" />
          </FoldPanel>
        </FoldPanel>
      </FoldPanel>

      <div class="footer-note">✧ 通用资产账簿 · 自动生成 ✧</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AttrChips from './AttrChips.vue';
import CurrencyCards from './CurrencyCards.vue';
import FoldPanel from './FoldPanel.vue';
import PreLine from './PreLine.vue';
import ProgressBar from './ProgressBar.vue';
import StatRow from './StatRow.vue';
import type { BusinessData, EntityData, LedgerData } from '../types';

defineProps<{
  data: LedgerData;
  forcedOpen: boolean | null;
  themeDark: boolean;
}>();

const emit = defineEmits<{
  (e: 'expand-all'): void;
  (e: 'collapse-all'): void;
  (e: 'toggle-theme'): void;
}>();

const bodyOpen = ref(false);

function oneLine(text: string): string {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
}

function pick(attrs: Record<string, string>, key: string): string {
  return attrs?.[key] ?? '';
}

function entitySummary(ent: EntityData): string {
  const parts = [
    ent.facilities.length ? `设施${ent.facilities.length}` : '',
    ent.materials.length ? `物资${ent.materials.length}` : '',
    ent.staffTotal ? `人员${ent.staffTotal}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function moneySummary(total: string, period: string): string {
  if (!total && !period) return '';
  if (total && period) return `${total} / ${period}`;
  return total || period;
}

function bizSummary(biz: BusinessData): string {
  const parts = [
    biz.revenueTotal ? `入 ${biz.revenueTotal}` : '',
    biz.expenseTotal ? `支 ${biz.expenseTotal}` : '',
  ].filter(Boolean);
  return parts.join(' · ');
}

function lineTitle(attrs: Record<string, string>): string {
  const b = attrs.building || '产线';
  const n = attrs.count ? ` ×${attrs.count}` : '';
  return `${b}${n}`;
}

function reconcileClass(attrs: Record<string, string>): string {
  const r = (attrs.result || '').toLowerCase();
  if (r.includes('pass') || r.includes('通过')) return 'is-plus';
  if (r.includes('fail') || r.includes('失败')) return 'is-minus';
  return '';
}

function runBadgeClass(run?: string): string {
  const r = (run || '').toLowerCase();
  if (r.includes('full')) return 'is-plus';
  if (r.includes('idle') || r.includes('damaged') || r.includes('partial')) return 'is-minus';
  return '';
}

function statusTagClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('normal') || s.includes('正常')) return 'tag-green';
  if (s.includes('damaged') || s.includes('idle') || s.includes('损') || s.includes('闲')) return 'tag-red';
  return 'tag-primary';
}
</script>

<style lang="scss" scoped>
.ledger {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.ledger-global-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  padding: 4px 10px;
  min-height: 0;
  line-height: 1.25;
  background: var(--bg-card);
  border: 1px solid var(--border-card);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  box-shadow: var(--shadow-xs);
  transition: box-shadow var(--transition-smooth), border-color var(--transition-fast);
  position: sticky;
  top: 2px;
  z-index: 20;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  margin: 0;
  -webkit-tap-highlight-color: transparent;
  overflow: hidden;

  &:hover {
    box-shadow: var(--shadow-sm), var(--shadow-glow);
    border-color: var(--border-accent);
  }
}

.gh-icon {
  font-size: 1.05rem;
  flex-shrink: 0;
  line-height: 1;
}

.gh-main-title {
  font-family: var(--font-display);
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: var(--text-primary);
  line-height: 1.2;
  white-space: nowrap;
  flex-shrink: 0;
}

.gh-subtitle {
  font-size: 0.68rem;
  font-weight: 500;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 1 1 auto;
}

.gh-spacer {
  flex: 1 1 0;
  min-width: 4px;
}

.gh-pill {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 10px;
  background: rgba(176, 125, 68, 0.12);
  color: var(--accent-primary);
  border: 1px solid var(--border-accent);
  white-space: nowrap;
  flex-shrink: 0;
  line-height: 1.4;
}

.gh-delta {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-green);
  white-space: nowrap;
  flex-shrink: 0;
}

.gh-arrow {
  font-size: 10px;
  color: var(--accent-primary);
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(176, 125, 68, 0.1);
  transition: transform 0.35s cubic-bezier(0.33, 1, 0.68, 1);
  flex-shrink: 0;
  line-height: 1;

  &.open {
    transform: rotate(180deg);
  }
}

.gh-theme-btn {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  padding: 0;
  line-height: 1;

  &:hover {
    background: rgba(176, 125, 68, 0.15);
    border-color: var(--border-accent);
    color: var(--accent-primary);
  }
}

.ledger-body {
  padding: 10px 0 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ledger-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tb-btn {
  font: inherit;
  font-size: 0.75rem;
  padding: 0.3em 0.75em;
  border: 1px solid var(--border-card);
  border-radius: var(--radius-xs);
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  box-shadow: var(--shadow-xs);

  &:hover {
    border-color: var(--border-accent);
    color: var(--accent-primary);
  }
}

.highlight-block {
  background: linear-gradient(135deg, rgba(176, 125, 68, 0.08) 0%, rgba(176, 125, 68, 0.02) 100%);
  border: 1px solid var(--border-accent);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  margin: 8px 0;
}

.hl-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.factor-row {
  margin: 6px 0;
}

.item-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  padding: 6px 4px;
  border-bottom: 1px dashed var(--border-subtle);
  font-size: 0.82rem;
  overflow-wrap: anywhere;
}

.muted {
  color: var(--text-tertiary);
  font-size: 0.85em;
}

.tag {
  display: inline-block;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 8px;
  letter-spacing: 0.3px;
}

.tag-primary {
  background: rgba(176, 125, 68, 0.15);
  color: var(--accent-primary);
  border: 1px solid rgba(176, 125, 68, 0.25);
}

.tag-warm {
  background: rgba(184, 92, 56, 0.15);
  color: var(--accent-warm);
  border: 1px solid rgba(184, 92, 56, 0.25);
}

.tag-green {
  background: rgba(74, 124, 92, 0.15);
  color: var(--accent-green);
  border: 1px solid rgba(74, 124, 92, 0.25);
}

.tag-red {
  background: rgba(184, 72, 58, 0.15);
  color: var(--accent-red);
  border: 1px solid rgba(184, 72, 58, 0.25);
}

.stat-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 0.82rem;
  color: var(--text-primary);
}

.stat-inline__icon {
  opacity: 0.85;
}

.footer-note {
  text-align: center;
  font-size: 0.62rem;
  color: var(--text-muted);
  padding: 8px 0 4px;
  letter-spacing: 1px;
  border-top: 1px solid var(--border-subtle);
}

@media (max-width: 640px) {
  .ledger-global-header {
    padding: 3px 8px;
    gap: 4px;
    flex-wrap: nowrap;
  }

  .gh-main-title {
    font-size: 0.82rem;
  }

  .gh-subtitle {
    font-size: 0.58rem;
    /* 窄屏优先保证 pill 可见，时间可缩略 */
    flex: 1 1 0;
    max-width: 42%;
  }

  .gh-spacer {
    display: none;
  }

  .gh-pill {
    font-size: 0.6rem;
    padding: 1px 5px;
  }

  .gh-delta {
    font-size: 0.62rem;
    max-width: 4.5em;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gh-theme-btn {
    width: 26px;
    height: 26px;
  }

  .gh-arrow {
    width: 22px;
    height: 22px;
  }

  .ledger-body {
    padding-top: 8px;
    gap: 8px;
  }

  .tb-btn {
    font-size: 0.72rem;
    padding: 0.4em 0.85em;
    min-height: 36px;
  }

  .highlight-block {
    padding: 8px 10px;
    margin: 6px 0;
  }

  :deep(.fold--section > .fold__head) {
    padding: 8px 10px 8px 12px;
  }

  :deep(.fold--section > .fold__head .fold__title) {
    font-size: 0.9rem;
  }

  :deep(.fold--section > .fold__body) {
    padding: 2px 10px 10px 12px;
  }

  :deep(.fold--entity > .fold__head) {
    padding: 8px 10px;
    font-size: 0.8rem;
  }

  :deep(.fold--entity > .fold__body) {
    padding: 8px 10px;
  }

  :deep(.fold--sub > .fold__head) {
    padding: 8px;
  }

  :deep(.fold__arrow) {
    width: 32px;
    height: 32px;
  }
}
</style>
