<script setup lang="ts">
import { ref, watch } from 'vue';
import type { FlowStep } from '@shared/hats';
import { useRun } from '../session-context';
import FlowBuilder from './FlowBuilder.vue';

const props = defineProps<{ steps: FlowStep[]; startNumber: number; minSteps: number; maxSteps: number }>();
const emit = defineEmits<{ dirty: [value: boolean] }>();
const run = useRun();

const copy = (steps: FlowStep[]) => steps.map((s) => ({ ...s }));
const draft = ref(copy(props.steps));
const editing = ref(false);
const busy = ref(false);

watch(
  () => props.steps,
  (steps) => {
    if (!editing.value) draft.value = copy(steps);
  },
);

watch(editing, (value) => emit('dirty', value));

function onEdit(steps: FlowStep[]) {
  draft.value = steps;
  editing.value = true;
}

async function save() {
  busy.value = true;
  const ok = await run({ type: 'editUpcomingSteps', steps: draft.value });
  busy.value = false;
  if (ok) discard();
}

function discard() {
  editing.value = false;
  draft.value = copy(props.steps);
}
</script>

<template>
  <div class="editor">
    <FlowBuilder :model-value="draft" :start-number="startNumber" :min-steps="minSteps" :max-steps="maxSteps" @update:model-value="onEdit" />
    <div v-if="editing" class="unsaved" role="status">
      <span class="small">Unsaved flow changes. Nobody sees them until you save.</span>
      <span class="row">
        <button class="btn btn-sm btn-quiet" @click="discard">Discard</button>
        <button class="btn btn-sm btn-primary" :disabled="busy" @click="save">Save flow</button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.editor { display: flex; flex-direction: column; gap: var(--s2); }
.unsaved { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); flex-wrap: wrap; padding: var(--s2) var(--s2) var(--s2) var(--s4); background: var(--violet-wash); border: 1px solid var(--violet-rule); }
</style>
