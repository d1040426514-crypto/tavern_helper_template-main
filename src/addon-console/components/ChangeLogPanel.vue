<template>
  <div class="ac-changelog">
    <div class="ac-changelog-toolbar">
      <div class="ac-changelog-meta" v-if="log">
        <span v-if="log.messageId != null">楼层 #{{ log.messageId }}</span>
        <span>{{ formatTime(log.timestamp) }}</span>
        <span>{{ log.ops.length }} 条 op</span>
        <span v-if="errorCount" class="ac-changelog-err">{{ errorCount }} 条问题</span>
        <span v-if="log.changed" class="ac-changelog-ok">已写入</span>
        <span v-else class="ac-changelog-muted">无数据变化</span>
      </div>
      <div class="ac-changelog-meta" v-else>暂无变更记录（等待一次 AddonJSONPatch 更新）</div>
      <div class="ac-changelog-actions">
        <button type="button" class="ac-btn ghost" :disabled="!log" @click="$emit('clear')">清空</button>
        <button type="button" class="ac-btn" :disabled="busy" @click="$emit('reprocess')">重新处理本楼</button>
      </div>
    </div>

    <div v-if="actionError" class="ac-warn" style="margin: 0 0 10px">{{ actionError }}</div>

    <template v-if="log">
      <section v-if="healIssues.length" class="ac-changelog-section">
        <h3 class="ac-changelog-h">自动修正</h3>
        <div v-for="(issue, i) in healIssues" :key="'h' + i" class="ac-cmd-card heal">
          <div class="ac-cmd-badge heal">heal</div>
          <div class="ac-cmd-body">{{ issue.message }}</div>
        </div>
      </section>

      <section v-if="log.ops.length" class="ac-changelog-section">
        <h3 class="ac-changelog-h">已解析操作</h3>
        <div
          v-for="(op, i) in log.ops"
          :key="'op' + i"
          class="ac-cmd-card"
          :class="opClass(op.op)"
        >
          <div class="ac-cmd-head">
            <span class="ac-cmd-badge" :class="op.op">{{ op.op }}</span>
            <code class="ac-cmd-path">{{ opPath(op) }}</code>
          </div>
          <pre class="ac-cmd-json">{{ formatOp(op) }}</pre>
          <div v-if="applyIssueFor(op)" class="ac-cmd-warn">{{ applyIssueFor(op) }}</div>
          <details class="ac-cmd-edit">
            <summary>编辑并重新应用</summary>
            <textarea v-model="opEditors[i]" class="ac-cmd-textarea" rows="6" spellcheck="false" />
            <button type="button" class="ac-btn" :disabled="busy" @click="applyEdited(opEditors[i])">
              应用此条
            </button>
          </details>
        </div>
      </section>

      <section v-if="log.failedFragments.length" class="ac-changelog-section">
        <h3 class="ac-changelog-h">无法解析（可修复后应用）</h3>
        <div
          v-for="(frag, i) in log.failedFragments"
          :key="'f' + i"
          class="ac-cmd-card parse"
        >
          <div class="ac-cmd-head">
            <span class="ac-cmd-badge parse">parse</span>
            <span>第 {{ frag.index }} 条</span>
          </div>
          <div class="ac-cmd-warn">{{ frag.message }}</div>
          <textarea v-model="fragEditors[i]" class="ac-cmd-textarea" rows="8" spellcheck="false" />
          <button type="button" class="ac-btn" :disabled="busy" @click="applyEdited(fragEditors[i])">
            应用此条
          </button>
        </div>
      </section>

      <section v-if="orphanIssues.length" class="ac-changelog-section">
        <h3 class="ac-changelog-h">其他问题</h3>
        <div v-for="(issue, i) in orphanIssues" :key="'o' + i" class="ac-cmd-card parse">
          <div class="ac-cmd-badge" :class="issue.kind">{{ issue.kind }}</div>
          <div class="ac-cmd-body">{{ issue.message }}</div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
export type PatchLogIssue = { kind: 'parse' | 'apply' | 'heal'; message: string; op?: any };
export type PatchLogFragment = { index: number; snippet: string; message: string };
export type PatchLogEntry = {
  messageId?: number;
  timestamp: number;
  ops: any[];
  issues: PatchLogIssue[];
  failedFragments: PatchLogFragment[];
  changed: boolean;
};

const props = defineProps<{
  log: PatchLogEntry | null;
  busy?: boolean;
  actionError?: string;
}>();

const emit = defineEmits<{
  clear: [];
  reprocess: [];
  applyOp: [op: unknown];
  applyError: [message: string];
}>();

const opEditors = ref<string[]>([]);
const fragEditors = ref<string[]>([]);

watch(
  () => props.log,
  log => {
    opEditors.value = (log?.ops ?? []).map(op => JSON.stringify(op, null, 2));
    fragEditors.value = (log?.failedFragments ?? []).map(f => f.snippet);
  },
  { immediate: true },
);

const errorCount = computed(
  () => (props.log?.issues ?? []).filter(i => i.kind === 'parse' || i.kind === 'apply').length,
);

const healIssues = computed(() => (props.log?.issues ?? []).filter(i => i.kind === 'heal'));

const orphanIssues = computed(() => {
  const log = props.log;
  if (!log) return [];
  const fragMsgs = new Set(log.failedFragments.map(f => f.message));
  return log.issues.filter(i => {
    if (i.kind === 'heal') return false;
    if (i.kind === 'apply' && i.op) return false;
    if (i.kind === 'parse' && fragMsgs.has(i.message)) return false;
    return true;
  });
});

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

function opClass(op: string): string {
  return ['replace', 'insert', 'remove', 'delta', 'move'].includes(op) ? op : 'other';
}

function opPath(op: any): string {
  if (op?.op === 'move') return `${op.from} → ${op.to}`;
  return String(op?.path ?? '');
}

function formatOp(op: any): string {
  return JSON.stringify(op, null, 2);
}

function applyIssueFor(op: any): string {
  const key = JSON.stringify(op);
  const hit = (props.log?.issues ?? []).find(
    i => i.kind === 'apply' && i.op && JSON.stringify(i.op) === key,
  );
  return hit?.message ?? '';
}

function applyEdited(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      emit('applyError', 'op 必须是单个 JSON 对象');
      return;
    }
    emit('applyOp', parsed);
  } catch (e) {
    emit('applyError', e instanceof Error ? e.message : String(e));
  }
}
</script>
