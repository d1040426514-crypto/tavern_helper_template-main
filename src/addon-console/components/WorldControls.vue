<template>
  <section class="ac-section">
    <h2 class="ac-section-title">🌐 世界控制</h2>
    <div class="ac-section-body">
      <div class="ac-world-tabs">
        <button
          v-for="name in worldNames"
          :key="name"
          type="button"
          class="ac-chip"
          :class="{ active: name === selected }"
          @click="emit('select', name)"
        >
          {{ name }}
          <span v-if="worlds[name]?.降临"> ·降临</span>
          <span v-else-if="worlds[name]?.平行演化"> ·平行</span>
        </button>
      </div>

      <template v-if="selected && worlds[selected]">
        <div class="ac-row">
          <div class="ac-label">世界降临（互斥）</div>
          <ToggleSwitch
            :model-value="!!worlds[selected].降临"
            @update:model-value="emit('set-descent', selected, $event)"
          />
        </div>
        <div class="ac-row">
          <div class="ac-label">平行演化</div>
          <ToggleSwitch
            :model-value="!!worlds[selected].平行演化"
            @update:model-value="emit('set-parallel', selected, $event)"
          />
        </div>
        <div class="ac-row" style="align-items: flex-start">
          <div style="flex: 1; display: grid; gap: 6px">
            <input v-model="renameDraft" class="ac-input" :placeholder="`重命名 ${selected}`" />
            <div style="display: flex; gap: 6px">
              <button type="button" class="ac-btn primary" @click="doRename">改名</button>
            </div>
          </div>
        </div>
      </template>

      <div class="ac-row" style="margin-top: 8px; align-items: flex-start">
        <div style="flex: 1; display: grid; gap: 6px">
          <input v-model="createDraft" class="ac-input" placeholder="新建世界名称" />
          <button type="button" class="ac-btn primary" style="width: fit-content" @click="doCreate">
            创建世界
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import ToggleSwitch from './ToggleSwitch.vue';

const props = defineProps<{
  worlds: Record<string, { 降临?: boolean; 平行演化?: boolean }>;
  selected: string | null;
}>();

const emit = defineEmits<{
  select: [string];
  'set-descent': [string, boolean];
  'set-parallel': [string, boolean];
  create: [string];
  rename: [string, string];
}>();

const worldNames = computed(() => Object.keys(props.worlds));
const renameDraft = ref('');
const createDraft = ref('');

watch(
  () => props.selected,
  name => {
    renameDraft.value = name ?? '';
  },
  { immediate: true },
);

function doCreate() {
  const name = createDraft.value.trim();
  if (!name) return;
  emit('create', name);
  createDraft.value = '';
}

function doRename() {
  if (!props.selected) return;
  const next = renameDraft.value.trim();
  if (!next || next === props.selected) return;
  emit('rename', props.selected, next);
}
</script>
