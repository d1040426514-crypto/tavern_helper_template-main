<script setup lang="ts">
import { computed } from 'vue';
import type { z } from 'zod';
import type { PromptGroupSchema } from '../tasks/schema';
import AcuToggle from './AcuToggle.vue';

type PromptGroup = z.infer<typeof PromptGroupSchema>;

const props = withDefaults(
  defineProps<{
    rowKey: string;
    group: PromptGroup;
    expanded: boolean;
    readonly?: boolean;
    autoBadge?: string;
    manualIndex?: number;
    manualCount?: number;
    disabled?: boolean;
  }>(),
  {
    readonly: false,
    autoBadge: '',
    manualIndex: -1,
    manualCount: 0,
    disabled: false,
  },
);

const emit = defineEmits<{
  toggle: [];
  move: [delta: -1 | 1];
  remove: [];
}>();

const displayName = computed(() => props.group.name?.trim() || '未命名段');

const contentPreview = computed(() => {
  const text = String(props.group.content ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '（空）';
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
});

const roleLabel = computed(() => props.group.role || 'user');

function onHeaderClick() {
  emit('toggle');
}

function stopPropagation(e: Event) {
  e.stopPropagation();
}
</script>

<template>
  <div
    class="acu-prompt-group acu-prompt-group--collapsible"
    :class="{
      'acu-prompt-group--auto-preview': readonly,
      'acu-prompt-group--disabled': group.enabled === false,
      'acu-prompt-group--expanded': expanded,
    }"
  >
    <button
      type="button"
      class="acu-prompt-group__header"
      :aria-expanded="expanded"
      @click="onHeaderClick"
    >
      <span v-if="autoBadge" class="acu-prompt-group__auto-badge">{{ autoBadge }}</span>
      <span class="acu-prompt-group__header-name">{{ displayName }}</span>
      <span class="acu-prompt-group__role-tag">{{ roleLabel }}</span>
      <span v-if="!expanded" class="acu-prompt-group__preview">{{ contentPreview }}</span>
      <i
        class="fa-fw fa-solid acu-prompt-group__chevron"
        :class="expanded ? 'fa-chevron-up' : 'fa-chevron-down'"
        aria-hidden="true"
      />
    </button>

    <div v-show="expanded" class="acu-prompt-group__body" @click="stopPropagation">
      <div class="acu-row acu-prompt-group__toolbar">
        <input
          v-model="group.name"
          class="acu-input acu-prompt-group__name"
          type="text"
          placeholder="未命名段"
          :readonly="readonly || disabled"
          :disabled="readonly || disabled"
        />
        <select v-model="group.role" class="acu-select" :disabled="readonly || disabled">
          <option value="system">system</option>
          <option value="user">user</option>
          <option value="assistant">assistant</option>
        </select>
        <template v-if="!readonly">
          <button
            class="acu-btn acu-btn--sm"
            type="button"
            title="上移"
            :disabled="manualIndex <= 0 || disabled"
            @click="emit('move', -1)"
          >
            上移
          </button>
          <button
            class="acu-btn acu-btn--sm"
            type="button"
            title="下移"
            :disabled="manualIndex < 0 || manualIndex >= manualCount - 1 || disabled"
            @click="emit('move', 1)"
          >
            下移
          </button>
          <div class="acu-prompt-group__enable">
            <AcuToggle
              :model-value="group.enabled !== false"
              aria-label="启用本段"
              :disabled="disabled"
              @update:model-value="group.enabled = $event"
            />
          </div>
          <button
            class="acu-btn danger acu-btn--sm acu-prompt-group__delete"
            type="button"
            :disabled="disabled"
            @click="emit('remove')"
          >
            删段
          </button>
        </template>
      </div>
      <textarea
        v-model="group.content"
        class="acu-textarea acu-prompt-group__textarea"
        :readonly="readonly || disabled"
        :disabled="readonly || disabled"
      />
    </div>
  </div>
</template>
