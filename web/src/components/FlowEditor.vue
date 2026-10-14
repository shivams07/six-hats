<script setup lang="ts">
import { ref, watch } from 'vue';
import type { FlowStep } from '@shared/hats';
import { useRun } from '../session-context';
import FlowBuilder from './FlowBuilder.vue';

const props = defineProps<{ steps: FlowStep[]; startNumber: number; minSteps: number; maxSteps: number }>();
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
  <div class="stack">
    <FlowBuilder :model-value="draft" :start-number="startNumber" :min-steps="minSteps" :max-steps="maxSteps" @update:model-value="onEdit" />
    <div v-if="editing" class="row">
      <button class="btn btn-primary" :disabled="busy" @click="save">Save flow</button>
      <button class="btn btn-ghost" @click="discard">Discard changes</button>
    </div>
  </div>
</template>
