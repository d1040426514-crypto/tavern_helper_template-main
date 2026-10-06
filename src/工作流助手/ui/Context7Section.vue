<script setup lang="ts">
import { ref } from 'vue';
import type { ContextTagRule, TaskContextConfig } from '../tasks/schema';
import AcuHelpIconBtn from './AcuHelpIconBtn.vue';
import AcuHelpPanel from './AcuHelpPanel.vue';

withDefaults(
  defineProps<{
    embedded?: boolean;
    title?: string;
  }>(),
  {
    embedded: false,
    title: '$7 默认上下文',
  },
);

const config = defineModel<TaskContextConfig>('config', { required: true });

const contextExtractRulesHelpOpen = ref(false);
const contextExcludeRulesHelpOpen = ref(false);
const extractRulesOpen = ref(false);
const excludeRulesOpen = ref(false);
const openRegexRules = ref(new Set<ContextTagRule>());
const nameEditingRules = ref(new Set<ContextTagRule>());
const focusRequest = ref<{ rule: ContextTagRule; kind: 'pattern' | 'name' } | null>(null);
let ignoreSlotClick = false;

function boundaryRules(rules: ContextTagRule[]): ContextTagRule[] {
  return rules.filter(rule => rule.mode !== 'regex');
}

function regexRules(rules: ContextTagRule[]): ContextTagRule[] {
  return rules.filter(rule => rule.mode === 'regex');
}

function regexRuleLabel(rule: ContextTagRule): string {
  return rule.name?.trim() || '未命名';
}

function isRegexOpen(rule: ContextTagRule): boolean {
  return openRegexRules.value.has(rule);
}

function isNameEditing(rule: ContextTagRule): boolean {
  return nameEditingRules.value.has(rule);
}

function replaceRuleSet(setRef: typeof openRegexRules, rule: ContextTagRule, include: boolean) {
  const next = new Set(setRef.value);
  if (include) next.add(rule);
  else next.delete(rule);
  setRef.value = next;
}

function showPattern(rule: ContextTagRule) {
  replaceRuleSet(nameEditingRules, rule, false);
  replaceRuleSet(openRegexRules, rule, true);
  focusRequest.value = { rule, kind: 'pattern' };
}

function closeRegex(rule: ContextTagRule) {
  if (!openRegexRules.value.has(rule)) return;
  ignoreSlotClick = true;
  replaceRuleSet(openRegexRules, rule, false);
  window.setTimeout(() => {
    ignoreSlotClick = false;
  }, 0);
}

function onRegexSlotClick(rule: ContextTagRule, event: MouseEvent) {
  if (ignoreSlotClick || event.target !== event.currentTarget) return;
  if (isNameEditing(rule)) return;
  if (isRegexOpen(rule)) closeRegex(rule);
  else showPattern(rule);
}

function startNameEdit(rule: ContextTagRule) {
  replaceRuleSet(openRegexRules, rule, false);
  replaceRuleSet(nameEditingRules, rule, true);
  focusRequest.value = { rule, kind: 'name' };
}

function finishNameEdit(rule: ContextTagRule) {
  if (!nameEditingRules.value.has(rule)) return;
  ignoreSlotClick = true;
  replaceRuleSet(nameEditingRules, rule, false);
  window.setTimeout(() => {
    ignoreSlotClick = false;
  }, 0);
}

function blurNameInput(event: KeyboardEvent) {
  if (event.target instanceof HTMLInputElement) event.target.blur();
}

function focusIfPending(rule: ContextTagRule, kind: 'pattern' | 'name', el: unknown) {
  const pending = focusRequest.value;
  if (!pending || pending.rule !== rule || pending.kind !== kind || !(el instanceof HTMLInputElement)) return;
  focusRequest.value = null;
  const input = el;
  let tries = 0;
  const tryFocus = () => {
    if (!input.isConnected) {
      if (++tries < 10) window.setTimeout(tryFocus, 0);
      return;
    }
    input.focus();
  };
  tryFocus();
}

function addBoundaryRule(rules: ContextTagRule[]) {
  rules.push({ start: '', end: '', mode: 'boundary', pattern: '', name: '' });
}

function addRegexRule(rules: ContextTagRule[]) {
  const rule: ContextTagRule = { start: '', end: '', mode: 'regex', pattern: '', name: '' };
  rules.push(rule);
  showPattern(rule);
}

function removeRule(rules: ContextTagRule[], rule: ContextTagRule) {
  const index = rules.indexOf(rule);
  if (index >= 0) rules.splice(index, 1);
  replaceRuleSet(openRegexRules, rule, false);
  replaceRuleSet(nameEditingRules, rule, false);
}
</script>

<template>
  <div :class="embedded ? 'acu-subsection' : 'acu-section'">
    <h4 v-if="!embedded">{{ title }}</h4>
    <div class="acu-row">
      <label>最近</label>
      <input
        v-model.number="config.contextTurnCount"
        class="acu-input"
        type="number"
        min="0"
        step="1"
        style="width: 72px"
      />
      <span>条 AI 楼层作为 $7 占位符上下文</span>
      <span class="acu-notes">（0 = 不注入历史 AI 正文，仍含当前楼；同 N 亦作为 $1 触发扫描基底之一，经相同「提取规则 / 排除规则」处理）</span>
    </div>

    <div class="acu-subsection acu-collapsible-subsection">
      <div class="acu-context-rules__head">
        <button
          type="button"
          class="acu-collapsible-subsection__header"
          :aria-expanded="extractRulesOpen"
          @click="extractRulesOpen = !extractRulesOpen"
        >
          <span class="acu-collapsible-subsection__title">提取规则</span>
          <span class="acu-collapsible-subsection__summary">{{ config.contextExtractRules.length }} 条</span>
          <i
            class="fa-fw fa-solid acu-collapsible-subsection__chevron"
            :class="extractRulesOpen ? 'fa-chevron-up' : 'fa-chevron-down'"
            aria-hidden="true"
          />
        </button>
        <AcuHelpIconBtn
          v-model:open="contextExtractRulesHelpOpen"
          panel-id="context-extract-rules-help"
          label="提取规则说明"
        />
      </div>
      <AcuHelpPanel
        v-model:open="contextExtractRulesHelpOpen"
        id="context-extract-rules-help"
        label="提取规则说明"
      >
        <p class="acu-notes acu-notes--sm" style="margin: 0">
          对每条 AI 楼正文，保留命中片段，按原文出现顺序用空行拼接（先提取后排除）。边界规则填写开始词和结束词。没有结束词的开始词会忽略。开始词可填残缺开标签（如
          <code>&lt;tp</code>）。正则规则点中间格填写
          <code>/表达式/标志</code>，点铅笔改名称；点选后才显示表达式，失焦后回到名称。保留每一处整段匹配。
        </p>
      </AcuHelpPanel>
      <div v-show="extractRulesOpen" class="acu-collapsible-subsection__body">
        <p class="acu-notes acu-notes--sm acu-context-rules__group">边界</p>
        <div v-for="rule in boundaryRules(config.contextExtractRules)" :key="rule" class="acu-row">
          <input v-model="rule.start" class="acu-input" placeholder="开始词（如 &lt;tp 或 &lt;think&gt;）" style="flex: 1" />
          <input v-model="rule.end" class="acu-input" placeholder="结束词（如 &lt;/think&gt;）" style="flex: 1" />
          <button class="acu-btn danger" type="button" @click="removeRule(config.contextExtractRules, rule)">删除</button>
        </div>
        <button class="acu-btn" type="button" @click="addBoundaryRule(config.contextExtractRules)">+ 添加边界规则</button>

        <p class="acu-notes acu-notes--sm acu-context-rules__group">正则</p>
        <div v-for="rule in regexRules(config.contextExtractRules)" :key="rule" class="acu-row">
          <div class="acu-context-rules__slot" @click="onRegexSlotClick(rule, $event)">
            <input
              v-if="isNameEditing(rule)"
              :ref="el => focusIfPending(rule, 'name', el)"
              v-model="rule.name"
              class="acu-input acu-context-rules__name-input"
              placeholder="规则名称"
              @blur="finishNameEdit(rule)"
              @keydown.enter.prevent="blurNameInput"
            />
            <input
              v-else-if="isRegexOpen(rule)"
              :ref="el => focusIfPending(rule, 'pattern', el)"
              v-model="rule.pattern"
              class="acu-input acu-context-rules__pattern"
              placeholder="/表达式/标志"
              @blur="closeRegex(rule)"
              @click.stop
              @keydown.esc.prevent="closeRegex(rule)"
            />
            <button v-else class="acu-btn acu-context-rules__name" type="button" @click.stop="showPattern(rule)">
              {{ regexRuleLabel(rule) }}
            </button>
          </div>
          <button
            class="acu-btn acu-btn--sm acu-icon-btn"
            type="button"
            title="编辑名称"
            aria-label="编辑名称"
            @click="startNameEdit(rule)"
          >
            <i class="fa-fw fa-solid fa-pencil" aria-hidden="true"></i>
          </button>
          <button class="acu-btn danger" type="button" @click="removeRule(config.contextExtractRules, rule)">删除</button>
        </div>
        <button class="acu-btn" type="button" @mousedown.prevent @click="addRegexRule(config.contextExtractRules)">
          + 添加正则规则
        </button>
      </div>
    </div>

    <div class="acu-subsection acu-collapsible-subsection">
      <div class="acu-context-rules__head">
        <button
          type="button"
          class="acu-collapsible-subsection__header"
          :aria-expanded="excludeRulesOpen"
          @click="excludeRulesOpen = !excludeRulesOpen"
        >
          <span class="acu-collapsible-subsection__title">排除规则</span>
          <span class="acu-collapsible-subsection__summary">{{ config.contextExcludeRules.length }} 条</span>
          <i
            class="fa-fw fa-solid acu-collapsible-subsection__chevron"
            :class="excludeRulesOpen ? 'fa-chevron-up' : 'fa-chevron-down'"
            aria-hidden="true"
          />
        </button>
        <AcuHelpIconBtn
          v-model:open="contextExcludeRulesHelpOpen"
          panel-id="context-exclude-rules-help"
          label="排除规则说明"
        />
      </div>
      <AcuHelpPanel
        v-model:open="contextExcludeRulesHelpOpen"
        id="context-exclude-rules-help"
        label="排除规则说明"
      >
        <p class="acu-notes acu-notes--sm" style="margin: 0">
          对每条 AI 楼正文，移除命中片段。边界规则填写开始词和结束词。正则规则点中间格填写
          <code>/表达式/标志</code>，点铅笔改名称；点选后才显示表达式，失焦后回到名称。删掉每一处整段匹配；只匹配开闭标签时，中间正文会留下。
        </p>
      </AcuHelpPanel>
      <div v-show="excludeRulesOpen" class="acu-collapsible-subsection__body">
        <p class="acu-notes acu-notes--sm acu-context-rules__group">边界</p>
        <div v-for="rule in boundaryRules(config.contextExcludeRules)" :key="rule" class="acu-row">
          <input v-model="rule.start" class="acu-input" placeholder="开始词（如 &lt;tp 或 &lt;thinking&gt;）" style="flex: 1" />
          <input v-model="rule.end" class="acu-input" placeholder="结束词（如 &lt;/thinking&gt;）" style="flex: 1" />
          <button class="acu-btn danger" type="button" @click="removeRule(config.contextExcludeRules, rule)">删除</button>
        </div>
        <button class="acu-btn" type="button" @click="addBoundaryRule(config.contextExcludeRules)">+ 添加边界规则</button>

        <p class="acu-notes acu-notes--sm acu-context-rules__group">正则</p>
        <div v-for="rule in regexRules(config.contextExcludeRules)" :key="rule" class="acu-row">
          <div class="acu-context-rules__slot" @click="onRegexSlotClick(rule, $event)">
            <input
              v-if="isNameEditing(rule)"
              :ref="el => focusIfPending(rule, 'name', el)"
              v-model="rule.name"
              class="acu-input acu-context-rules__name-input"
              placeholder="规则名称"
              @blur="finishNameEdit(rule)"
              @keydown.enter.prevent="blurNameInput"
            />
            <input
              v-else-if="isRegexOpen(rule)"
              :ref="el => focusIfPending(rule, 'pattern', el)"
              v-model="rule.pattern"
              class="acu-input acu-context-rules__pattern"
              placeholder="/表达式/标志"
              @blur="closeRegex(rule)"
              @click.stop
              @keydown.esc.prevent="closeRegex(rule)"
            />
            <button v-else class="acu-btn acu-context-rules__name" type="button" @click.stop="showPattern(rule)">
              {{ regexRuleLabel(rule) }}
            </button>
          </div>
          <button
            class="acu-btn acu-btn--sm acu-icon-btn"
            type="button"
            title="编辑名称"
            aria-label="编辑名称"
            @click="startNameEdit(rule)"
          >
            <i class="fa-fw fa-solid fa-pencil" aria-hidden="true"></i>
          </button>
          <button class="acu-btn danger" type="button" @click="removeRule(config.contextExcludeRules, rule)">删除</button>
        </div>
        <button class="acu-btn" type="button" @mousedown.prevent @click="addRegexRule(config.contextExcludeRules)">
          + 添加正则规则
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.acu-context-rules__head {
  display: flex;
  align-items: center;
}

.acu-context-rules__head .acu-collapsible-subsection__header {
  flex: 1;
  width: auto;
}

.acu-context-rules__head :deep(.acu-help-icon-btn) {
  margin-right: 10px;
}

.acu-context-rules__group {
  margin: 10px 0 6px;
}

.acu-context-rules__slot {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  padding: 2px;
  cursor: pointer;
}

.acu-context-rules__name {
  flex: 1;
  min-width: 0;
  justify-content: center;
}

.acu-context-rules__pattern {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.acu-context-rules__name-input {
  flex: 1;
  min-width: 0;
  text-align: center;
}
</style>
