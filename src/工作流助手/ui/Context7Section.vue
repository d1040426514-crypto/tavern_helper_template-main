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

function addContextExtractRule() {
  config.value.contextExtractRules.push({ start: '', end: '', mode: 'boundary', pattern: '' });
}

function onContextRuleModeChange(rule: ContextTagRule, event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  rule.mode = value === 'regex' ? 'regex' : 'boundary';
  if (rule.pattern == null) rule.pattern = '';
}

function removeContextExtractRule(index: number) {
  config.value.contextExtractRules.splice(index, 1);
}

function addContextExcludeRule() {
  config.value.contextExcludeRules.push({ start: '', end: '', mode: 'boundary', pattern: '' });
}

function removeContextExcludeRule(index: number) {
  config.value.contextExcludeRules.splice(index, 1);
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
    <div class="acu-subsection">
      <div class="acu-heading-with-help">
        <h5>提取规则</h5>
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
          对每条 AI 楼正文，保留每一对已闭合的「开始词～结束词」片段，按原文出现顺序用空行拼接（先提取后排除）。没有结束词的开始词会忽略，也不会把后面的闭合对从头包进来。多条规则交错时仍按原文位置穿插。开始词可填残缺开标签（如
          <code>&lt;tp</code>），可匹配 <code>&lt;tp&gt;</code>、<code>&lt;tp="…"&gt;</code> 等形式；结束词请写完整边界（如
          <code>&lt;/tp&gt;</code>）。选「正则」时只填一栏
          <code>/表达式/标志</code>，保留每一处整段匹配，不用捕获组。
        </p>
      </AcuHelpPanel>
      <div v-for="(rule, idx) in config.contextExtractRules" :key="'ex-' + idx" class="acu-row">
        <select
          class="acu-select"
          style="width: 88px"
          :value="rule.mode === 'regex' ? 'regex' : 'boundary'"
          @change="onContextRuleModeChange(rule, $event)"
        >
          <option value="boundary">边界</option>
          <option value="regex">正则</option>
        </select>
        <input
          v-if="rule.mode === 'regex'"
          v-model="rule.pattern"
          class="acu-input"
          placeholder="/表达式/标志"
          style="flex: 1"
        />
        <template v-else>
          <input v-model="rule.start" class="acu-input" placeholder="开始词（如 &lt;tp 或 &lt;think&gt;）" style="flex: 1" />
          <input v-model="rule.end" class="acu-input" placeholder="结束词（如 &lt;/think&gt;）" style="flex: 1" />
        </template>
        <button class="acu-btn danger" type="button" @click="removeContextExtractRule(idx)">删除</button>
      </div>
      <button class="acu-btn" type="button" @click="addContextExtractRule">+ 添加提取规则</button>
    </div>
    <div class="acu-subsection">
      <div class="acu-heading-with-help">
        <h5>排除规则</h5>
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
          对每条 AI 楼正文，移除每一对已闭合的片段。没有结束词的开始词会忽略。开始词支持残缺开标签前缀（如 <code>&lt;tp</code>），结束词请写完整边界。选「正则」时只填一栏
          <code>/表达式/标志</code>，删掉每一处整段匹配；只匹配开闭标签时，中间正文会留下。
        </p>
      </AcuHelpPanel>
      <div v-for="(rule, idx) in config.contextExcludeRules" :key="'rm-' + idx" class="acu-row">
        <select
          class="acu-select"
          style="width: 88px"
          :value="rule.mode === 'regex' ? 'regex' : 'boundary'"
          @change="onContextRuleModeChange(rule, $event)"
        >
          <option value="boundary">边界</option>
          <option value="regex">正则</option>
        </select>
        <input
          v-if="rule.mode === 'regex'"
          v-model="rule.pattern"
          class="acu-input"
          placeholder="/表达式/标志"
          style="flex: 1"
        />
        <template v-else>
          <input v-model="rule.start" class="acu-input" placeholder="开始词（如 &lt;tp 或 &lt;thinking&gt;）" style="flex: 1" />
          <input v-model="rule.end" class="acu-input" placeholder="结束词（如 &lt;/thinking&gt;）" style="flex: 1" />
        </template>
        <button class="acu-btn danger" type="button" @click="removeContextExcludeRule(idx)">删除</button>
      </div>
      <button class="acu-btn" type="button" @click="addContextExcludeRule">+ 添加排除规则</button>
    </div>
  </div>
</template>
