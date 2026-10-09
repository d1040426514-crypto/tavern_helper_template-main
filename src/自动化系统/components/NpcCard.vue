<template>
  <div
    class="npc-card"
    :class="{ 'npc-card--empty': npc.empty, 'npc-card--open': expanded }"
  >
    <!-- 顶栏：可点击折叠；头像 + 名字 | 社会身份 | 箭头 -->
    <button
      type="button"
      class="npc-card-top"
      :class="{ 'npc-card-top--static': !hasBody }"
      :aria-expanded="hasBody ? expanded : undefined"
      :disabled="!hasBody"
      @click="toggleExpanded"
    >
      <div class="npc-avatar" aria-hidden="true">🌟</div>
      <div class="npc-name">
        <span class="npc-name-icon">💠</span>
        {{ npc.name }}
      </div>
      <div
        v-if="npc.socialIdentity.length || npc.lifeArchive.lifeTier"
        class="npc-identity-inline"
      >
        <span v-if="npc.lifeArchive.lifeTier" class="npc-identity-tag npc-identity-tag--tier" title="生命层级">{{ npc.lifeArchive.lifeTier }}</span>
        <span
          v-for="(id, i) in npc.socialIdentity"
          :key="'id' + i"
          class="npc-identity-tag"
        >{{ id }}</span>
      </div>
      <span v-else-if="npc.empty" class="npc-identity-empty">暂无行动数据</span>
      <span
        v-if="hasBody"
        class="npc-card-caret"
        :class="{ 'npc-card-caret--open': expanded }"
        aria-hidden="true"
      >▾</span>
    </button>

    <div v-show="expanded && hasBody" class="npc-card-body">
      <div
        v-if="lifeChips.length || npc.wealth || npc.reputation.length || showBackgroundCard || npc.socialNetwork.length"
        class="npc-dossier"
      >
        <div v-if="lifeChips.length" class="npc-life-row" aria-label="生命档案">
          <span
            v-for="chip in lifeChips"
            :key="chip.id || chip.key"
            class="npc-life-chip"
            :class="[chip.tone ? `npc-life-chip--${chip.tone}` : '', `npc-life-chip--${chip.key}`]"
          >
            <span v-if="chip.label" class="npc-life-k">{{ chip.label }}</span>
            <span class="npc-life-v">{{ chip.value }}</span>
          </span>
        </div>

        <div v-if="npc.wealth || npc.reputation.length" class="npc-social-profile">
          <span v-if="npc.wealth" class="npc-wealth-tag" :class="wealthCls">
            {{ wealthEmoji }} {{ npc.wealth }}
          </span>
          <div v-if="npc.reputation.length" class="npc-rep-inline" title="声誉">
            <span
              v-for="(r, i) in npc.reputation"
              :key="'rep' + i"
              class="npc-chip npc-chip--rep"
              :class="getReputationClass(r.value)"
            >
              <span v-if="r.label" class="npc-rep-k">{{ r.label }}</span>
              <span class="npc-rep-v">{{ r.value }}</span>
            </span>
          </div>
        </div>

        <div v-if="showBackgroundCard || npc.socialNetwork.length" class="npc-ties">
          <div v-if="showBackgroundCard" class="npc-ties-col">
            <header class="npc-relations-head">
              <span class="npc-relations-ico" aria-hidden="true">🔗</span>
              <span>背景关联</span>
            </header>
            <div class="npc-bg-list">
              <div
                v-for="row in backgroundRows"
                :key="row.key"
                class="npc-bg-row"
                :class="`npc-bg-row--${row.key}`"
              >
                <span class="npc-bg-k">{{ row.label }}</span>
                <div class="npc-bg-names">
                  <span v-if="row.empty" class="npc-bg-empty">无</span>
                  <span v-for="(name, i) in row.names" :key="row.key + i" class="npc-bg-name">{{ name }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-if="npc.socialNetwork.length" class="npc-ties-col">
            <header class="npc-relations-head">
              <span class="npc-relations-ico" aria-hidden="true">🤝</span>
              <span>社交网络</span>
              <span class="npc-relations-count">{{ socialCount }}</span>
            </header>
            <div class="npc-chip-flow npc-chip-flow--fill">
              <template v-for="(g, gi) in npc.socialNetwork" :key="'soc' + gi">
                <span
                  v-for="(p, pi) in g.people"
                  :key="'p' + gi + '-' + pi"
                  class="npc-person-chip npc-person-chip--social"
                >
                  <span class="npc-person-chip-top">
                    <span class="npc-person-chip-cat">{{ g.category }}</span>
                    <span class="npc-person-chip-name">{{ p.name }}</span>
                    <span v-if="p.warmth" class="npc-person-warmth">
                      <span class="npc-person-meta-k">好感</span>{{ p.warmth }}
                    </span>
                  </span>
                  <span v-if="p.note" class="npc-person-meta">
                    <span class="npc-person-meta-k">关系</span>
                    <span class="npc-person-meta-v">{{ p.note }}</span>
                  </span>
                  <span v-if="p.attitude" class="npc-person-meta">
                    <span class="npc-person-meta-k">态度</span>
                    <span class="npc-person-meta-v">{{ p.attitude }}</span>
                  </span>
                </span>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 此刻：行为链、身处环境、当前状态、现场人物收成一块 -->
      <section
        v-if="npc.actionChain.length || npc.predict || placeCells.length || stateCells.length || npc.companions.length"
        class="npc-now"
      >
        <div v-if="npc.actionChain.length || npc.predict" class="npc-chain-section">
          <div class="chain-label">⚡ 行为链</div>
          <div class="chain-flow">
            <template v-for="(step, i) in npc.actionChain" :key="'a' + i">
              <span v-if="i > 0" class="chain-arrow">→</span>
              <span class="chain-step">{{ step }}</span>
            </template>
            <template v-if="npc.predict">
              <span class="chain-arrow">→</span>
              <span class="chain-predict">后续: {{ npc.predict }}</span>
            </template>
            <span v-if="npc.debutReady" class="chain-debut-tag">⚡准备登场</span>
          </div>
        </div>

        <div v-if="placeCells.length || stateCells.length" class="npc-presence">
          <section v-if="placeCells.length" class="npc-presence-card npc-presence-card--place">
            <header class="npc-presence-head">
              <span class="npc-presence-ico" aria-hidden="true">📍</span>
              <span>身处环境</span>
            </header>
            <div v-if="placeFactCells.length" class="npc-presence-facts">
              <div
                v-for="cell in placeFactCells"
                :key="cell.label"
                class="npc-presence-fact"
                :class="presenceFactClass(cell.label)"
              >
                <div class="npc-presence-k">{{ cell.label }}</div>
                <div class="npc-presence-v">{{ cell.value }}</div>
              </div>
            </div>
            <div v-if="envCell" class="npc-presence-prose">
              <div class="npc-presence-k">{{ envCell.label }}</div>
              <div class="npc-presence-v">{{ envCell.value }}</div>
            </div>
          </section>

          <section v-if="stateCells.length" class="npc-presence-card npc-presence-card--state">
            <header class="npc-presence-head">
              <span class="npc-presence-ico" aria-hidden="true">✦</span>
              <span>当前状态</span>
            </header>
            <div v-if="doingCell" class="npc-presence-lead">
              <div class="npc-presence-k">{{ doingCell.label }}</div>
              <div class="npc-presence-v">{{ doingCell.value }}</div>
            </div>
            <div v-if="poseCells.length" class="npc-presence-stack">
              <div v-for="cell in poseCells" :key="cell.label" class="npc-presence-block">
                <div class="npc-presence-k">{{ cell.label }}</div>
                <div class="npc-presence-v">{{ cell.value }}</div>
              </div>
            </div>
          </section>
        </div>

        <div v-if="npc.companions.length" class="npc-scene-people">
          <header class="npc-presence-head">
            <span class="npc-presence-ico" aria-hidden="true">👥</span>
            <span>现场人物</span>
            <span v-if="companionCount" class="npc-relations-count">{{ companionCount }}</span>
          </header>
          <div v-if="npc.companions.length" class="npc-chip-flow npc-chip-flow--fill">
            <template v-for="(g, gi) in npc.companions" :key="'cmp' + gi">
              <span
                v-for="(p, pi) in g.people"
                :key="'cp' + gi + '-' + pi"
                class="npc-person-chip npc-person-chip--compact"
              >
                <span class="npc-person-chip-cat">{{ g.category }}</span>
                <span class="npc-person-chip-name">{{ p.name }}</span>
                <span v-if="p.note" class="npc-person-chip-note">{{ companionNoteText(p.note) }}</span>
              </span>
            </template>
          </div>
        </div>
      </section>

      <!-- 长期目标 / 近期打算：并排；近期内联键值 -->
      <div v-if="npc.longGoal || npc.nearPlan.length" class="npc-duo">
        <article v-if="npc.longGoal" class="npc-subcard">
          <header class="npc-subcard-head">🎯 长期目标</header>
          <p class="npc-goal-text">{{ npc.longGoal }}</p>
        </article>
        <article v-if="npc.nearPlan.length" class="npc-subcard">
          <header class="npc-subcard-head">📅 近期打算</header>
          <div class="npc-plan-compact">
            <div v-for="row in nearPlanRows" :key="row.key" class="npc-plan-line">
              <span class="npc-plan-k">{{ row.label }}</span>
              <span class="npc-plan-v">{{ row.value }}</span>
            </div>
          </div>
        </article>
      </div>

      <!-- 可选任务：进行中 + 归档 -->
      <section
        v-if="npc.questLogs.length || npc.questArchive.length"
        class="npc-section npc-quest-section"
      >
        <header class="npc-section-head">
          📋 任务
          <span class="npc-quest-count">{{ questSectionCount }}</span>
        </header>

        <div v-if="npc.questLogs.length" class="npc-quest-logs">
          <article
            v-for="(log, li) in npc.questLogs"
            :key="'qlog' + li"
            class="npc-subcard npc-quest-card"
            :class="log.status ? `npc-quest-card--${log.status}` : ''"
          >
            <div class="npc-quest-card-top">
              <span class="npc-quest-kind" :class="questKindClass(log.kind)">{{ log.kind || '任务' }}</span>
              <span
                v-if="log.status"
                class="npc-quest-state"
                :class="`npc-quest-state--${log.status}`"
              >{{ questTaskStatusLabel(log.status) }}</span>
              <span class="npc-quest-title">{{ log.title }}</span>
            </div>
            <p v-if="log.summary" class="npc-quest-summary">{{ log.summary }}</p>
            <div
              v-if="log.pauseReason || log.resumeCondition"
              class="npc-quest-pause"
            >
              <div v-if="log.pauseReason" class="npc-quest-pause-row">
                <span class="npc-quest-pause-k">搁置原因</span>
                <span>{{ log.pauseReason }}</span>
              </div>
              <div v-if="log.resumeCondition" class="npc-quest-pause-row">
                <span class="npc-quest-pause-k">恢复条件</span>
                <span>{{ log.resumeCondition }}</span>
              </div>
            </div>
            <ul v-if="log.items.length" class="npc-quest-items">
              <li
                v-for="(item, ii) in log.items"
                :key="'qi' + li + '-' + ii"
                class="npc-quest-item"
                :class="'npc-quest-item--' + item.status"
              >
                <span class="npc-quest-mark" aria-hidden="true">{{ questStatusMark(item.status) }}</span>
                <span class="npc-quest-item-text">{{ item.text }}</span>
                <ul v-if="item.children.length" class="npc-quest-children">
                  <li
                    v-for="(child, ci) in item.children"
                    :key="'qc' + li + '-' + ii + '-' + ci"
                    class="npc-quest-item npc-quest-item--child"
                    :class="'npc-quest-item--' + child.status"
                  >
                    <span class="npc-quest-mark" aria-hidden="true">{{ questStatusMark(child.status) }}</span>
                    <span class="npc-quest-item-text">{{ child.text }}</span>
                  </li>
                </ul>
              </li>
            </ul>
            <div v-if="log.climax" class="npc-quest-climax">
              <span class="npc-quest-climax-label">收束</span>
              <span class="npc-quest-climax-text">{{ log.climax }}</span>
            </div>
          </article>
        </div>

        <div v-if="npc.questArchive.length" class="npc-quest-archive">
          <header class="npc-quest-archive-head">归档</header>
          <ul class="npc-quest-archive-list">
            <li
              v-for="(entry, ai) in npc.questArchive"
              :key="'qarch' + ai"
              class="npc-quest-archive-row"
            >
              <span class="npc-quest-kind npc-quest-kind--archive" :class="questKindClass(entry.kind)">
                {{ entry.kind }}
              </span>
              <span class="npc-quest-archive-title">{{ entry.title }}</span>
              <span v-if="entry.completedAt" class="npc-quest-archive-date">{{ entry.completedAt }}</span>
              <span v-if="entry.ending" class="npc-quest-archive-ending">{{ entry.ending }}</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- 记忆：分类成块，每条独占一行 -->
      <section v-if="memoryColumns.length" class="npc-section npc-memory-section">
        <header class="npc-section-head">🧠 记忆</header>
        <div class="npc-memory-grid">
          <article
            v-for="col in memoryColumns"
            :key="col.key"
            class="npc-memory-col"
            :class="'npc-memory-col--' + col.key"
          >
            <header class="npc-memory-col-head">
              <span>{{ col.icon }}</span>
              <span>{{ col.title }}</span>
              <span class="npc-memory-count">{{ col.items.length }}</span>
            </header>
            <ol class="npc-memory-list">
              <li v-for="(m, i) in col.items" :key="col.key + i">
                <span class="npc-memory-idx">{{ i + 1 }}</span>
                <span class="npc-memory-text">{{ m }}</span>
              </li>
            </ol>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getReputationClass, getWealthClass, getWealthEmoji } from '../parse';
import { STATUS_LABELS, type NpcCard, type QuestItemStatus, type QuestTaskStatus } from '../types';

const props = defineProps<{ npc: NpcCard }>();

const expanded = ref(false);

const statusLabels = STATUS_LABELS;
const wealthCls = computed(() => getWealthClass(props.npc.wealth));
const wealthEmoji = computed(() => getWealthEmoji(props.npc.wealth));

const questSectionCount = computed(
  () => props.npc.questLogs.length + props.npc.questArchive.length,
);

function questStatusMark(status: QuestItemStatus): string {
  if (status === 'done') return '☑';
  if (status === 'active') return '▶';
  return '☐';
}

function questTaskStatusLabel(status: QuestTaskStatus): string {
  if (status === 'active') return '活跃';
  if (status === 'shelved') return '搁置';
  return '';
}

function questKindClass(kind: string): string {
  const k = String(kind ?? '').trim();
  if (k.includes('主线')) return 'quest-kind--main';
  if (k.includes('支线')) return 'quest-kind--side';
  if (k.includes('角色')) return 'quest-kind--char';
  if (k.includes('委托')) return 'quest-kind--errand';
  return 'quest-kind--default';
}

function splitBgNames(raw: string): string[] {
  return String(raw ?? '')
    .split(/[;；]+/)
    .map(s => s.trim())
    .filter(name => name && name !== '无');
}

const backgroundRows = computed(() => {
  const b = props.npc.background;
  return [
    { key: 'group', label: '团体', names: splitBgNames(b.group) },
    { key: 'circle', label: '社交圈', names: splitBgNames(b.circle) },
    { key: 'event', label: '事件', names: splitBgNames(b.event) },
  ].map(row => ({ ...row, empty: row.names.length === 0 }));
});

const showBackgroundCard = computed(() => {
  const b = props.npc.background;
  return !!(b.group || b.circle || b.event);
});

const companionCount = computed(() =>
  props.npc.companions.reduce((n, g) => n + g.people.length, 0),
);

const socialCount = computed(() =>
  props.npc.socialNetwork.reduce((n, g) => n + g.people.length, 0),
);

const lifeChips = computed(() => {
  const life = props.npc.lifeArchive;
  const rows: Array<{ id?: string; key: string; label: string; value: string; tone?: string }> = [];
  if (life.race) rows.push({ key: 'race', label: '种族', value: life.race });
  if (life.gender) {
    rows.push({ key: 'gender', label: '性别', value: life.gender, tone: genderTone(life.gender) });
  }
  if (life.birthday) rows.push({ key: 'birthday', label: '生日', value: life.birthday });
  if (life.age) rows.push({ key: 'age', label: '年龄', value: life.age });
  if (life.remainingLife) rows.push({ key: 'life', label: '剩余寿命', value: life.remainingLife });
  splitTraits(life.trait).forEach((trait, i) => {
    rows.push({ id: `trait${i}`, key: 'trait', label: '', value: trait });
  });
  return rows;
});

function splitTraits(raw: string): string[] {
  return String(raw ?? '')
    .split(/[，,；;、|]+/)
    .map(part => part.trim())
    .filter(part => part && part !== '无');
}

/** 只区分男/雄与女/雌。其余写法不单独配色。 */
function genderTone(value: string): 'male' | 'female' | '' {
  const core = String(value ?? '')
    .trim()
    .replace(/[（(].*$/, '')
    .replace(/\s+/g, '');
  if (/^(男|雄)(性|性体)?$/.test(core)) return 'male';
  if (/^(女|雌)(性|性体)?$/.test(core)) return 'female';
  return '';
}

const hasBody = computed(() => {
  const n = props.npc;
  return !!(
    lifeChips.value.length ||
    n.lifeArchive.lifeTier ||
    n.wealth ||
    n.reputation.length ||
    n.actionChain.length ||
    n.predict ||
    n.statusParts.length ||
    n.companions.length ||
    n.socialNetwork.length ||
    showBackgroundCard.value ||
    n.longGoal ||
    n.nearPlan.length ||
    n.questLogs.length ||
    n.questArchive.length ||
    n.recentMemories.length ||
    n.settledMemories.length ||
    n.coreMemories.length
  );
});

function toggleExpanded(): void {
  if (!hasBody.value) return;
  expanded.value = !expanded.value;
}

const PLACE_LABELS = ['所处世界', '位置', '环境'] as const;
const STATE_LABELS = ['正在做的事', '动作', '穿着', '状态'] as const;

const statusCells = computed(() =>
  props.npc.statusParts
    .map((value, i) => ({
      label: statusLabels[i] || `详情${i + 1}`,
      value: String(value ?? '').trim(),
    }))
    .filter(cell => cell.value),
);

function cellsByLabels(labels: readonly string[]) {
  const byLabel = new Map(statusCells.value.map(cell => [cell.label, cell]));
  return labels.flatMap(label => {
    const cell = byLabel.get(label);
    return cell ? [cell] : [];
  });
}

const placeCells = computed(() => cellsByLabels(PLACE_LABELS));
const stateCells = computed(() => {
  const known = new Set<string>([...PLACE_LABELS, ...STATE_LABELS]);
  const extra = statusCells.value.filter(cell => !known.has(cell.label));
  return [...cellsByLabels(STATE_LABELS), ...extra];
});
const placeFactCells = computed(() => placeCells.value.filter(cell => cell.label !== '环境'));
const envCell = computed(() => placeCells.value.find(cell => cell.label === '环境') ?? null);
const doingCell = computed(() => stateCells.value.find(cell => cell.label === '正在做的事') ?? null);
const poseCells = computed(() => stateCells.value.filter(cell => cell.label !== '正在做的事'));

function presenceFactClass(label: string): string {
  if (label === '所处世界') return 'npc-presence-fact--world';
  if (label === '位置') return 'npc-presence-fact--place';
  return '';
}

/** 现场人物括号：为何在场/状态短签。 */
function companionNoteText(note: string): string {
  const parts = String(note ?? '')
    .split(/\s*[/／]\s*/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} · ${parts[1]}`;
  return String(note ?? '').trim();
}

const NEAR_PLAN_LABELS = ['事件', '行为', '时间'] as const;

const nearPlanRows = computed(() => {
  const parts = props.npc.nearPlan;
  if (!parts.length) return [];
  if (parts.length === 1) {
    const value = String(parts[0] ?? '').trim();
    return value ? [{ key: 'plan', label: '内容', value }] : [];
  }
  return parts
    .map((value, i) => ({
      key: `p${i}`,
      label: NEAR_PLAN_LABELS[i] ?? `项${i + 1}`,
      value: String(value ?? '').trim(),
    }))
    .filter(row => row.value);
});

const memoryColumns = computed(() => {
  const cols: Array<{ key: string; title: string; icon: string; items: string[] }> = [];
  if (props.npc.recentMemories.length) {
    cols.push({ key: 'recent', title: '近期记忆', icon: '💬', items: props.npc.recentMemories });
  }
  if (props.npc.settledMemories.length) {
    cols.push({ key: 'settled', title: '沉淀记忆', icon: '📜', items: props.npc.settledMemories });
  }
  if (props.npc.coreMemories.length) {
    cols.push({ key: 'core', title: '核心记忆', icon: '💎', items: props.npc.coreMemories });
  }
  return cols;
});
</script>

<style lang="scss" scoped>
.npc-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: var(--card-pad);
  box-shadow: var(--glow-card);
  transition:
    background var(--transition-smooth),
    border-color var(--transition-smooth),
    box-shadow var(--transition-smooth);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.45em;
  min-width: 0;
  width: 100%;
  font-size: 1em;

  &:hover {
    background: var(--bg-card-hover);
    border-color: var(--border-glow);
    box-shadow: var(--glow-accent);
  }

  &--empty {
    opacity: 0.78;
  }
}

/* 顶栏：可点击折叠；名字靠左，社会身份靠右 */
.npc-card-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35em 0.5em;
  position: relative;
  z-index: 1;
  width: 100%;
  margin: 0;
  padding: 0.15em 0;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--transition-smooth);

  &:hover:not(:disabled) {
    background: color-mix(in srgb, var(--bg-step) 55%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--border-glow);
    outline-offset: 2px;
  }

  &--static,
  &:disabled {
    cursor: default;
  }
}

.npc-card-caret {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 0.85em;
  color: var(--text-muted);
  line-height: 1;
  transition: transform 0.2s ease;
  transform: rotate(0deg);

  &--open {
    transform: rotate(180deg);
  }
}

.npc-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.45em;
  width: 100%;
  min-width: 0;
}

.npc-card:not(.npc-card--open) {
  gap: 0;
}

.npc-avatar {
  width: 1.75em;
  height: 1.75em;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--bg-step), rgba(140, 170, 210, 0.18));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85em;
  flex-shrink: 0;
  border: 1px solid var(--border-subtle);
}

.npc-name {
  font-family: var(--font-display);
  font-size: 0.95em;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.2px;
  line-height: 1.25;
  display: inline-flex;
  align-items: center;
  gap: 0.2em;
  flex-shrink: 0;
}

.npc-name-icon {
  font-size: 0.75em;
  color: var(--accent-gold);
}

.npc-identity-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25em;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-start;
}

.npc-identity-tag {
  font-size: 0.62em;
  font-weight: 600;
  line-height: 1.32;
  padding: 0.1em 0.4em;
  border-radius: 5px;
  max-width: 100%;
  word-break: break-word;
  white-space: nowrap;
  background: color-mix(in srgb, var(--accent-gold) 14%, var(--bg-step));
  color: var(--accent-gold);
  border: 1px solid color-mix(in srgb, var(--accent-gold) 35%, var(--border-subtle));
  letter-spacing: 0.1px;
}

.npc-identity-tag--tier {
  border-radius: 999px;
  padding: 0.12em 0.55em;
  background: color-mix(in srgb, var(--accent-sky) 18%, var(--bg-step));
  color: var(--accent-sky);
  border-color: color-mix(in srgb, var(--accent-sky) 48%, var(--border-subtle));
  font-weight: 700;
}

.npc-identity-empty {
  font-family: var(--font-mono);
  font-size: 0.6em;
  font-weight: 600;
  padding: 0.12em 0.4em;
  border-radius: 5px;
  color: var(--text-muted, var(--text-secondary));
  background: var(--bg-step);
  border: 1px solid var(--border-subtle);
  white-space: nowrap;
  flex-shrink: 0;
}

.npc-rep-inline {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25em;
  flex: 1 1 auto;
  min-width: 0;
  justify-content: flex-start;
}

.npc-wealth-tag {
  font-family: var(--font-mono);
  font-size: 0.62em;
  font-weight: 650;
  padding: 0.28em 0.55em;
  border-radius: 999px;
  letter-spacing: 0.15px;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  line-height: 1.3;
}

.npc-social-profile {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.32em;
  width: 100%;

  .npc-rep-inline {
    flex: 1 1 auto;
    min-width: 0;
  }
}

.npc-life-row + .npc-social-profile,
.npc-life-row + .npc-ties,
.npc-social-profile + .npc-ties {
  padding-top: 0.38em;
  border-top: 1px dashed color-mix(in srgb, var(--accent-mint) 35%, var(--border-subtle));
}

.wealth-destitute {
  background: var(--wealth-destitute-bg);
  color: var(--wealth-destitute-fg);
  border: 1px solid var(--wealth-destitute-bd);
}
.wealth-poor {
  background: var(--wealth-poor-bg);
  color: var(--wealth-poor-fg);
  border: 1px solid var(--wealth-poor-bd);
}
.wealth-tight {
  background: var(--wealth-tight-bg);
  color: var(--wealth-tight-fg);
  border: 1px solid var(--wealth-tight-bd);
}
.wealth-balanced {
  background: var(--wealth-balanced-bg);
  color: var(--wealth-balanced-fg);
  border: 1px solid var(--wealth-balanced-bd);
}
.wealth-comfortable {
  background: var(--wealth-comfortable-bg);
  color: var(--wealth-comfortable-fg);
  border: 1px solid var(--wealth-comfortable-bd);
}
.wealth-welloff {
  background: var(--wealth-welloff-bg);
  color: var(--wealth-welloff-fg);
  border: 1px solid var(--wealth-welloff-bd);
}
.wealth-rich {
  background: var(--wealth-rich-bg);
  color: var(--wealth-rich-fg);
  border: 1px solid var(--wealth-rich-bd);
}
.wealth-tycoon {
  background: var(--wealth-tycoon-bg);
  color: var(--wealth-tycoon-fg);
  border: 1px solid var(--wealth-tycoon-bd);
}

.npc-chip {
  font-size: 0.58em;
  line-height: 1.32;
  padding: 0.1em 0.36em;
  border-radius: 5px;
  max-width: 100%;
  word-break: break-word;
  border: 1px solid var(--border-subtle);
  background: var(--bg-step);
  color: var(--text-secondary);
  white-space: nowrap;

  &--rep {
    display: inline-flex;
    align-items: center;
    gap: 0.28em;
    font-weight: 600;
    letter-spacing: 0.1px;
    padding: 0.14em 0.42em 0.14em 0.16em;
    border-radius: 999px;
  }
}

.npc-rep-k {
  padding: 0.06em 0.38em;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-card) 62%, transparent);
  font-weight: 700;
  line-height: 1.3;
}

.npc-rep-v {
  font-weight: 650;
  line-height: 1.3;
}

.rep-hated {
  background: var(--rep-hated-bg);
  color: var(--rep-hated-fg);
  border-color: var(--rep-hated-bd);
}
.rep-infamous {
  background: var(--rep-infamous-bg);
  color: var(--rep-infamous-fg);
  border-color: var(--rep-infamous-bd);
}
.rep-obscure {
  background: var(--rep-obscure-bg);
  color: var(--rep-obscure-fg);
  border-color: var(--rep-obscure-bd);
}
.rep-known {
  background: var(--rep-known-bg);
  color: var(--rep-known-fg);
  border-color: var(--rep-known-bd);
}
.rep-respected {
  background: var(--rep-respected-bg);
  color: var(--rep-respected-fg);
  border-color: var(--rep-respected-bd);
}
.rep-revered {
  background: var(--rep-revered-bg);
  color: var(--rep-revered-fg);
  border-color: var(--rep-revered-bd);
}
.rep-default {
  background: var(--bg-step);
  color: var(--text-secondary);
  border-color: var(--border-subtle);
}

.npc-now {
  display: flex;
  flex-direction: column;
  gap: 0.55em;
  width: 100%;
  padding: 0.5em 0.55em 0.55em;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel, var(--bg-step)) 86%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--accent-lavender) 24%, var(--border-subtle));
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent);

  > :not(:last-child) {
    padding-bottom: 0.45em;
    border-bottom: 1px dashed color-mix(in srgb, var(--accent-lavender) 32%, var(--border-subtle));
  }
}

.npc-now .npc-chain-section {
  background: transparent;
  padding: 0.06em 0.1em 0;
}

.npc-now > .npc-chain-section:not(:last-child) {
  padding-bottom: 0.45em;
}

.npc-chain-section {
  background: var(--bg-chain);
  border-radius: 8px;
  padding: 0.38em 0.5em 0.42em;
  width: 100%;
}

.chain-label {
  font-family: var(--font-mono);
  font-size: 0.68em;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--accent-lavender);
  text-transform: uppercase;
  margin-bottom: 0.2em;
}

.chain-flow {
  font-size: 0.78em;
  color: var(--text-secondary);
  line-height: 1.85;
  text-wrap: pretty;
}

.chain-step,
.chain-predict {
  display: inline;
  padding: 0.08em 0.28em;
  border-radius: 4px;
  line-height: 1.85;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
  overflow-wrap: break-word;
}

.chain-step {
  background: var(--bg-step);
  color: var(--text-primary);
  font-weight: 500;
}

.chain-arrow {
  display: inline;
  margin: 0 0.22em;
  color: var(--accent-gold);
  font-weight: 700;
}

.chain-predict {
  background: color-mix(in srgb, var(--accent-rose) 12%, transparent);
  color: var(--accent-rose);
  font-weight: 600;
  font-style: italic;
}

.chain-debut-tag {
  display: inline-block;
  margin-left: 0.28em;
  background: var(--debut-bg);
  color: var(--debut-fg);
  padding: 0.1em 0.35em;
  border-radius: 4px;
  font-weight: 700;
  font-size: 0.85em;
  letter-spacing: 0.2px;
  line-height: 1.4;
  vertical-align: baseline;
  animation: pulseTag 2s ease-in-out infinite;
  white-space: nowrap;
}

@keyframes pulseTag {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.82;
  }
}

/* —— 分区标题 —— */
.npc-section {
  display: flex;
  flex-direction: column;
  gap: 0.35em;
  width: 100%;
}

.npc-section-head {
  font-family: var(--font-mono);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--accent-lavender);
}

/* 生命档案与声誉：同一块底，标签按文字收缩，不拉成通栏 */
.npc-dossier {
  display: flex;
  flex-direction: column;
  gap: 0.38em;
  width: 100%;
  padding: 0.48em 0.5em 0.52em;
  border-radius: 12px;
  background: linear-gradient(
    105deg,
    color-mix(in srgb, var(--accent-mint) 10%, var(--bg-step)) 0%,
    color-mix(in srgb, var(--accent-lavender) 7%, var(--bg-step)) 100%
  );
  border: 1px solid color-mix(in srgb, var(--accent-mint) 24%, var(--border-subtle));
}

.npc-life-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.32em;
  width: 100%;
}

.npc-life-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 0.28em;
  flex: 0 1 auto;
  width: fit-content;
  max-width: 100%;
  padding: 0.22em 0.5em;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-panel, var(--bg-card)) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-mint) 32%, var(--border-subtle));
  font-size: 0.68em;
  line-height: 1.35;

  &--male {
    background: var(--gender-male-bg);
    border-color: var(--gender-male-bd);

    .npc-life-k,
    .npc-life-v {
      color: var(--gender-male-fg);
    }
  }

  &--female {
    background: var(--gender-female-bg);
    border-color: var(--gender-female-bd);

    .npc-life-k,
    .npc-life-v {
      color: var(--gender-female-fg);
    }
  }

  &--tier {
    white-space: normal;
    background: color-mix(in srgb, var(--accent-gold) 16%, var(--bg-panel, var(--bg-step)));
    border-color: color-mix(in srgb, var(--accent-gold) 42%, var(--border-subtle));

    .npc-life-k {
      color: var(--accent-gold);
    }
  }

  &--trait {
    white-space: normal;
    font-weight: 650;
    background: color-mix(in srgb, var(--accent-coral) 14%, var(--bg-panel, var(--bg-step)));
    border-color: color-mix(in srgb, var(--accent-coral) 36%, var(--border-subtle));

    .npc-life-v {
      color: var(--text-primary);
    }
  }
}

.npc-life-k {
  font-weight: 700;
  color: var(--accent-mint);
  letter-spacing: 0.2px;
  flex-shrink: 0;
}

.npc-life-v {
  color: var(--text-primary);
  word-break: break-word;
  min-width: 0;
}

.npc-companions-card {
  width: 100%;
}

/* 背景关联与社交网络：贴在生命档案下方，宽屏左右分栏 */
.npc-ties {
  display: grid;
  grid-template-columns: minmax(0, 0.86fr) minmax(0, 1.14fr);
  gap: 0.55em 0.75em;
  width: 100%;
  align-items: start;

  &:has(> :only-child) {
    grid-template-columns: 1fr;
  }
}

.npc-ties-col {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35em;
}

/* 现场人物：独自占满一行，卡片按内容收缩 */
.npc-scene-people {
  display: flex;
  flex-direction: column;
  gap: 0.32em;
  width: 100%;
  min-width: 0;

  .npc-presence-head {
    color: var(--accent-sky);
  }

  .npc-chip-flow--fill {
    display: flex;
    flex-wrap: wrap;
    gap: 0.28em;
  }
}

.npc-relations-head {
  display: flex;
  align-items: center;
  gap: 0.3em;
  font-family: var(--font-mono);
  font-size: 0.7em;
  font-weight: 700;
  letter-spacing: 0.35px;
  color: var(--accent-lavender);
  line-height: 1.2;
}

.npc-relations-ico {
  font-size: 0.95em;
  line-height: 1;
}

.npc-relations-count {
  margin-left: auto;
  font-size: 0.9em;
  font-weight: 600;
  color: var(--text-muted, var(--text-secondary));
  background: color-mix(in srgb, var(--accent-lavender) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-lavender) 22%, var(--border-subtle));
  border-radius: 999px;
  padding: 0.05em 0.45em;
  letter-spacing: 0;
}

/* 人物/社交：自适应填满行宽 */
.npc-chip-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35em;
  width: 100%;

  &--fill {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11.5em, 1fr));
    gap: 0.35em;
  }
}

.npc-ties .npc-chip-flow--fill {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.28em;
}

.npc-person-chip--social {
  gap: 0.04em;
  padding: 0.26em 0.42em 0.3em;
  line-height: 1.3;

  .npc-person-chip-top {
    display: flex;
    align-items: baseline;
    gap: 0.35em;
    min-width: 0;
  }

  .npc-person-chip-cat {
    font-size: 0.58em;
  }

  .npc-person-chip-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 0.72em;
  }

  .npc-person-warmth {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: baseline;
    gap: 0.22em;
    font-size: 0.6em;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .npc-person-meta {
    font-size: 0.6em;
    line-height: 1.35;
    gap: 0.28em;
  }
}

.npc-person-chip--compact {
  flex: 0 1 auto;
  width: fit-content;
  max-width: min(100%, 16em);
  padding: 0.2em 0.42em;
  gap: 0.02em;
  border-radius: 6px;

  .npc-person-chip-cat {
    font-size: 0.55em;
  }

  .npc-person-chip-name {
    font-size: 0.68em;
  }

  .npc-person-chip-note {
    font-size: 0.58em;
  }
}

.npc-person-chip {
  display: flex;
  flex-direction: column;
  gap: 0.12em;
  min-width: 0;
  padding: 0.35em 0.5em;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 72%, transparent);
  border: 1px solid var(--border-subtle);
  line-height: 1.35;
  box-shadow: 0 1px 0 color-mix(in srgb, #000 4%, transparent);
}

.npc-person-chip-cat {
  font-size: 0.6em;
  font-weight: 700;
  color: var(--accent-sky);
  letter-spacing: 0.25px;
}

.npc-person-chip-name {
  font-size: 0.76em;
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-word;
}

.npc-person-chip-note {
  font-size: 0.66em;
  color: var(--text-secondary);
  word-break: break-word;
}

.npc-person-meta {
  display: flex;
  align-items: baseline;
  gap: 0.35em;
  min-width: 0;
  font-size: 0.64em;
  line-height: 1.4;
}

.npc-person-meta-k {
  flex: 0 0 auto;
  font-weight: 700;
  color: var(--accent-lavender);
}

.npc-person-meta-v {
  min-width: 0;
  color: var(--text-secondary);
  word-break: break-word;
}

/* 背景关联：每类一张底卡，小标题在左上角 */
.npc-bg-list {
  display: flex;
  flex-direction: column;
  gap: 0.35em;
  width: 100%;
}

.npc-bg-row {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.28em;
  width: 100%;
  min-width: 0;
  padding: 0.38em 0.5em;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 74%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent);
  box-shadow: 0 1px 0 color-mix(in srgb, #000 4%, transparent);
}

.npc-bg-k {
  font-size: 0.65em;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.3px;
}

.npc-bg-names {
  display: flex;
  flex-wrap: wrap;
  gap: 0.28em;
  width: 100%;
}

.npc-bg-name {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 0.16em 0.48em;
  border-radius: 999px;
  font-size: 0.72em;
  line-height: 1.4;
  color: var(--text-primary);
  word-break: break-word;
  background: color-mix(in srgb, var(--bg-panel, var(--bg-step)) 88%, var(--text-secondary));
  border: 1px solid color-mix(in srgb, var(--border-subtle) 90%, transparent);
}

.npc-bg-empty {
  font-size: 0.72em;
  line-height: 1.4;
  color: var(--text-muted, var(--text-secondary));
  opacity: 0.75;
}

.npc-bg-row--group {
  background: color-mix(in srgb, var(--accent-sky) 12%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-sky) 30%, var(--border-subtle));

  .npc-bg-k {
    color: var(--accent-sky);
  }

  .npc-bg-name {
    background: color-mix(in srgb, var(--accent-sky) 24%, var(--bg-panel, var(--bg-step)));
    border-color: color-mix(in srgb, var(--accent-sky) 36%, var(--border-subtle));
  }
}

.npc-bg-row--circle {
  background: color-mix(in srgb, var(--accent-lavender) 12%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-lavender) 30%, var(--border-subtle));

  .npc-bg-k {
    color: var(--accent-lavender);
  }

  .npc-bg-name {
    background: color-mix(in srgb, var(--accent-lavender) 24%, var(--bg-panel, var(--bg-step)));
    border-color: color-mix(in srgb, var(--accent-lavender) 34%, var(--border-subtle));
  }
}

.npc-bg-row--event {
  background: color-mix(in srgb, var(--accent-gold) 14%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-gold) 32%, var(--border-subtle));

  .npc-bg-k {
    color: var(--accent-gold);
  }

  .npc-bg-name {
    background: color-mix(in srgb, var(--accent-gold) 26%, var(--bg-panel, var(--bg-step)));
    border-color: color-mix(in srgb, var(--accent-gold) 38%, var(--border-subtle));
  }
}

/* 移动端统一断点：≤640px */
@media (max-width: 640px) {
  .npc-card {
    overflow-x: hidden;
    gap: 0.5em;
  }

  .npc-card-top {
    align-items: flex-start;
    column-gap: 0.4em;
    row-gap: 0.35em;
    padding-right: 1.6em;
  }

  .npc-avatar {
    width: 1.55em;
    height: 1.55em;
    font-size: 0.78em;
  }

  .npc-name {
    flex: 1 1 calc(100% - 3em);
    flex-shrink: 1;
    min-width: 0;
    max-width: 100%;
    font-size: 0.9em;
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  .npc-card-caret {
    position: absolute;
    top: 0.15em;
    right: 0;
    margin-left: 0;
    width: var(--touch-min);
    height: var(--touch-min);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .npc-identity-inline {
    flex: 1 1 100%;
    order: 3;
    row-gap: 0.3em;
    gap: 0.25em;
  }

  .npc-identity-tag {
    white-space: normal;
    font-size: 0.58em;
  }

  .npc-identity-empty {
    order: 3;
    white-space: normal;
    word-break: break-word;
    overflow-wrap: anywhere;
    font-size: 0.58em;
  }

  .npc-social-profile {
    gap: 0.28em;

    .npc-chip {
      white-space: normal;
      font-size: 0.56em;
    }

    .npc-wealth-tag {
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      font-size: 0.58em;
    }
  }

  .npc-life-row {
    gap: 0.28em;
  }

  .npc-life-chip {
    font-size: 0.64em;
    white-space: normal;
  }

  .npc-dossier {
    padding: 0.34em;
  }

  /* 身处环境 / 当前状态：本就各占一行；窄屏里动作和穿着也改回单列 */
  .npc-presence {
    gap: 0.45em;
  }

  .npc-presence-stack {
    grid-template-columns: 1fr;
  }

  .npc-presence-card {
    padding: 0.48em 0.5em 0.55em;
  }

  .npc-presence-v {
    font-size: 0.76em;
  }

  /* 档案内的背景与社交：窄屏改为上下排列 */
  .npc-ties {
    grid-template-columns: 1fr;
    gap: 0.5em;
  }

  .npc-ties .npc-chip-flow--fill,
  .npc-chip-flow--fill {
    grid-template-columns: 1fr;
  }

  .npc-bg-name {
    font-size: 0.7em;
  }

  /* 目标/打算：单列 */
  .npc-duo {
    grid-template-columns: 1fr;
  }

  /* 任务：单列 */
  .npc-quest-logs {
    grid-template-columns: 1fr;
  }

  /* 记忆：每条独占一行 */
  .npc-memory-col {
    padding: 0.45em 0.5em 0.5em;
  }

  .npc-memory-list li {
    font-size: 0.78em;
    line-height: 1.5;
  }

  .npc-chain-section {
    padding: 0.5em 0.65em;
  }

  .chain-flow {
    line-height: 1.9;
  }

  .chain-step,
  .chain-predict {
    line-height: 1.9;
  }

  .npc-subcard {
    padding: 0.55em 0.6em 0.6em;
    gap: 0.45em;
  }

  .npc-social-row {
    grid-template-columns: 1fr;
  }

  .npc-plan-line {
    grid-template-columns: 2.4em minmax(0, 1fr);
    font-size: 0.74em;
  }
}

/* 近期打算：紧凑键值行 */
.npc-plan-compact {
  display: flex;
  flex-direction: column;
  gap: 0.25em;
}

.npc-plan-line {
  display: grid;
  grid-template-columns: 2.6em minmax(0, 1fr);
  gap: 0.35em 0.45em;
  align-items: baseline;
  font-size: 0.76em;
  line-height: 1.45;
}

.npc-plan-k {
  font-size: 0.9em;
  font-weight: 700;
  color: var(--accent-sky);
}

.npc-plan-v {
  color: var(--text-primary);
  word-break: break-word;
  min-width: 0;
}

/* 身处环境、当前状态各自独占一行，卡片只跟自己的内容长 */
.npc-presence {
  display: flex;
  flex-direction: column;
  gap: 0.55em;
  width: 100%;
}

.npc-presence-card {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  padding: 0.55em 0.65em 0.65em;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  box-shadow: inset 0 1px 0 color-mix(in srgb, #fff 16%, transparent);

  &--place {
    background: linear-gradient(
      165deg,
      color-mix(in srgb, var(--accent-sky) 14%, var(--bg-panel, var(--bg-step))) 0%,
      var(--bg-panel, var(--bg-step)) 58%
    );
    border-color: color-mix(in srgb, var(--accent-sky) 34%, var(--border-subtle));

    .npc-presence-head,
    .npc-presence-k {
      color: var(--accent-sky);
    }
  }

  &--state {
    background: linear-gradient(
      165deg,
      color-mix(in srgb, var(--accent-gold) 13%, var(--bg-panel, var(--bg-step))) 0%,
      var(--bg-panel, var(--bg-step)) 58%
    );
    border-color: color-mix(in srgb, var(--accent-gold) 36%, var(--border-subtle));

    .npc-presence-head,
    .npc-presence-k {
      color: var(--accent-gold);
    }
  }
}

.npc-presence-head {
  display: flex;
  align-items: center;
  gap: 0.35em;
  font-family: var(--font-mono);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.4px;
}

.npc-presence-facts {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.35em;
}

.npc-presence-fact,
.npc-presence-prose,
.npc-presence-lead,
.npc-presence-block {
  min-width: 0;
  padding: 0.38em 0.5em;
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 74%, transparent);
  border: 1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent);
}

.npc-presence-fact--world {
  flex: 0 1 auto;
}

.npc-presence-fact--place {
  flex: 1 1 10em;
}

.npc-presence-lead {
  background: color-mix(in srgb, var(--accent-gold) 16%, var(--bg-card));
  border-color: color-mix(in srgb, var(--accent-gold) 32%, var(--border-subtle));
}

.npc-presence-stack {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35em;
  align-items: start;

  > :last-child:nth-child(odd) {
    grid-column: 1 / -1;
  }
}

.npc-presence-k {
  font-size: 0.65em;
  font-weight: 700;
  letter-spacing: 0.3px;
  margin-bottom: 0.12em;
}

.npc-presence-v {
  font-size: 0.78em;
  line-height: 1.55;
  color: var(--text-primary);
  word-break: break-word;
}

/* 双卡：够宽则并排，否则自动折行 */
.npc-duo {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12em, 1fr));
  gap: 0.5em;
  width: 100%;
  align-items: stretch;

  &:has(> :only-child) {
    grid-template-columns: 1fr;
  }
}

.npc-subcard {
  background: var(--bg-panel, var(--bg-step));
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.45em 0.55em 0.5em;
  display: flex;
  flex-direction: column;
  gap: 0.35em;
  min-width: 0;
  min-height: 100%;
}

.npc-subcard-head {
  font-family: var(--font-mono);
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--accent-lavender);
  padding-bottom: 0.25em;
  border-bottom: 1px dashed var(--border-subtle);
}

.npc-subcard-body {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  flex: 1;
}

.npc-goal-text {
  margin: 0;
  font-size: 0.8em;
  line-height: 1.5;
  color: var(--text-primary);
  word-break: break-word;
  flex: 1;
}

/* 社交：分类在左，人物在右 */
.npc-social-row {
  display: grid;
  grid-template-columns: 3.2em minmax(0, 1fr);
  gap: 0.35em 0.5em;
  align-items: start;
}

.npc-social-cat {
  font-size: 0.7em;
  font-weight: 700;
  color: var(--accent-sky);
  line-height: 1.45;
  padding-top: 0.1em;
}

.npc-social-people {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25em;
  min-width: 0;
}

.npc-person {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.15em 0.4em;
  padding: 0.2em 0.4em;
  border-radius: 6px;
  background: var(--memory-bg, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--memory-bd, var(--border-subtle));
  max-width: 100%;
}

.npc-person-name {
  font-size: 0.78em;
  font-weight: 700;
  color: var(--text-primary);
}

.npc-person-note {
  font-size: 0.7em;
  color: var(--text-secondary);
  word-break: break-word;
}

.npc-bg-key {
  font-size: 0.7em;
  font-weight: 700;
  color: var(--accent-sky);
}

.npc-bg-val {
  font-size: 0.78em;
  color: var(--text-primary);
  word-break: break-word;

  &.muted {
    color: var(--text-muted, var(--text-secondary));
    opacity: 0.75;
  }
}

/* 记忆：分类上下分块，条目横向并排，窄了再换行 */
.npc-memory-section {
  gap: 0.45em;
}

.npc-memory-grid {
  display: flex;
  flex-direction: column;
  gap: 0.45em;
  width: 100%;
}

.npc-memory-col {
  display: flex;
  flex-direction: column;
  gap: 0.35em;
  min-width: 0;
  padding: 0.5em 0.65em;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--memory-bg, var(--bg-step));
  min-height: 100%;

  &--settled {
    background: var(--memory-settled-bg, var(--bg-step));
    border-color: var(--memory-settled-bd, var(--border-subtle));
  }

  &--core {
    background: var(--memory-core-bg, var(--bg-step));
    border-color: var(--memory-core-bd, var(--border-subtle));
  }
}

.npc-memory-col-head {
  display: flex;
  align-items: center;
  gap: 0.3em;
  font-family: var(--font-mono);
  font-size: 0.72em;
  font-weight: 700;
  color: var(--accent-lavender);
  letter-spacing: 0.3px;
  padding-bottom: 0.3em;
  border-bottom: 1px dashed var(--border-subtle);
}

.npc-memory-col--core .npc-memory-col-head {
  color: var(--accent-gold);
}

.npc-memory-count {
  margin-left: auto;
  font-weight: 600;
  opacity: 0.7;
  font-size: 0.95em;
}

.npc-memory-list {
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  list-style: none;
}

.npc-memory-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.4em;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0.38em 0;
  font-size: 0.78em;
  line-height: 1.55;
  color: var(--text-secondary);
  word-break: break-word;
  overflow-wrap: anywhere;
  background: none;
  border: none;
  border-radius: 0;

  & + li {
    border-top: 1px dashed color-mix(in srgb, var(--border-subtle) 85%, transparent);
  }
}

.npc-memory-idx {
  flex: 0 0 auto;
  font-weight: 700;
  font-size: 0.85em;
  line-height: 1.5;
  color: var(--accent-lavender);
}

.npc-memory-text {
  min-width: 0;
}

.npc-memory-col--core .npc-memory-list li {
  color: var(--text-primary);
}

.npc-memory-col--core .npc-memory-idx {
  color: var(--accent-gold);
}

/* —— 可选任务模块 —— */
.npc-quest-section {
  gap: 0.45em;
}

.npc-section-head {
  display: flex;
  align-items: center;
  gap: 0.4em;
}

.npc-quest-count {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-step);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  padding: 0.05em 0.45em;
  letter-spacing: 0;
}

.npc-quest-logs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(14em, 1fr));
  gap: 0.45em;
  width: 100%;
  align-items: stretch;
}

.npc-quest-card {
  min-width: 0;
  min-height: 100%;
  height: 100%;

  &--active {
    border-color: color-mix(in srgb, var(--accent-mint) 42%, var(--border-subtle));
  }

  &--shelved {
    border-color: color-mix(in srgb, var(--accent-lavender) 38%, var(--border-subtle));
    background: color-mix(in srgb, var(--accent-lavender) 6%, var(--bg-panel, var(--bg-step)));
  }
}

.npc-quest-card-top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35em 0.5em;
}

.npc-quest-kind {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 0.65em;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 0.12em 0.4em;
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
  line-height: 1.3;
}

.npc-quest-state {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 0.62em;
  font-weight: 700;
  line-height: 1.3;
  padding: 0.12em 0.45em;
  border-radius: 999px;
  border: 1px solid var(--border-subtle);

  &--active {
    color: var(--accent-mint);
    background: color-mix(in srgb, var(--accent-mint) 16%, transparent);
    border-color: color-mix(in srgb, var(--accent-mint) 40%, var(--border-subtle));
  }

  &--shelved {
    color: var(--accent-lavender);
    background: color-mix(in srgb, var(--accent-lavender) 14%, transparent);
    border-color: color-mix(in srgb, var(--accent-lavender) 38%, var(--border-subtle));
  }
}

.quest-kind--main {
  color: var(--accent-gold);
  background: color-mix(in srgb, var(--accent-gold) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent-gold) 35%, transparent);
}

.quest-kind--side {
  color: var(--accent-sky);
  background: color-mix(in srgb, var(--accent-sky) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent-sky) 35%, transparent);
}

.quest-kind--char {
  color: var(--accent-rose);
  background: color-mix(in srgb, var(--accent-rose) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent-rose) 35%, transparent);
}

.quest-kind--errand {
  color: var(--accent-mint);
  background: color-mix(in srgb, var(--accent-mint) 16%, transparent);
  border-color: color-mix(in srgb, var(--accent-mint) 35%, transparent);
}

.quest-kind--default {
  color: var(--accent-lavender);
  background: var(--bg-step);
}

.npc-quest-title {
  font-size: 0.84em;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.35;
  word-break: break-word;
  min-width: 0;
}

.npc-quest-summary {
  margin: 0;
  font-size: 0.74em;
  line-height: 1.45;
  color: var(--text-muted);
  word-break: break-word;
}

.npc-quest-pause {
  display: flex;
  flex-direction: column;
  gap: 0.2em;
  padding: 0.32em 0.42em;
  border-radius: 7px;
  background: color-mix(in srgb, var(--accent-lavender) 10%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--accent-lavender) 26%, var(--border-subtle));
}

.npc-quest-pause-row {
  display: grid;
  grid-template-columns: 4.4em minmax(0, 1fr);
  gap: 0.4em;
  font-size: 0.68em;
  line-height: 1.45;
  color: var(--text-secondary);
}

.npc-quest-pause-k {
  font-weight: 700;
  color: var(--accent-lavender);
}

.npc-quest-items,
.npc-quest-children {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.28em;
}

.npc-quest-item {
  display: grid;
  grid-template-columns: 1.1em minmax(0, 1fr);
  column-gap: 0.35em;
  row-gap: 0.2em;
  align-items: start;
  font-size: 0.76em;
  line-height: 1.45;
  color: var(--text-secondary);

  &--done {
    color: var(--text-muted);

    .npc-quest-item-text {
      text-decoration: line-through;
      text-decoration-color: color-mix(in srgb, var(--text-muted) 55%, transparent);
    }
  }

  &--active {
    color: var(--text-primary);
    font-weight: 600;
  }

  &--todo {
    color: var(--text-secondary);
  }
}

.npc-quest-mark {
  font-size: 0.9em;
  line-height: 1.45;
  color: var(--accent-sky);
  text-align: center;
}

.npc-quest-item--done .npc-quest-mark {
  color: var(--accent-mint);
}

.npc-quest-item--active .npc-quest-mark {
  color: var(--accent-gold);
}

.npc-quest-item-text {
  word-break: break-word;
  min-width: 0;
}

.npc-quest-children {
  grid-column: 1 / -1;
  padding-left: 1.35em;
  border-left: 1px dashed var(--border-subtle);
  margin-left: 0.35em;
}

.npc-quest-climax {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35em 0.5em;
  margin-top: 0.15em;
  padding-top: 0.35em;
  border-top: 1px dashed var(--border-subtle);
}

.npc-quest-climax-label {
  flex-shrink: 0;
  font-family: var(--font-mono);
  font-size: 0.65em;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: var(--accent-coral);
}

.npc-quest-climax-text {
  font-size: 0.74em;
  line-height: 1.45;
  color: var(--text-secondary);
  word-break: break-word;
  min-width: 0;
}

.npc-quest-archive {
  display: flex;
  flex-direction: column;
  gap: 0.3em;
  padding: 0.4em 0.5em 0.45em;
  border-radius: var(--radius-sm);
  background: var(--bg-step);
  border: 1px solid var(--border-subtle);
}

.npc-quest-archive-head {
  font-family: var(--font-mono);
  font-size: 0.68em;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: var(--text-muted);
}

.npc-quest-archive-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35em;
}

.npc-quest-archive-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25em 0.45em;
  font-size: 0.74em;
  line-height: 1.4;
}

.npc-quest-kind--archive {
  opacity: 0.9;
}

.npc-quest-archive-title {
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-word;
}

.npc-quest-archive-date {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.npc-quest-archive-ending {
  flex: 1 1 100%;
  color: var(--text-secondary);
  word-break: break-word;
}
</style>
