<script setup lang="ts">
import type { View } from '@shared/protocol';
import { useRun } from '../session-context';

defineProps<{ view: View }>();
const run = useRun();

function choose(participantId: string) {
  if (participantId) void run({ type: 'setScribe', participantId });
}
</script>

<template>
  <label class="scribe-pick">
    <span class="label">Scribe</span>
    <select :value="view.scribeId ?? ''" @change="choose(($event.target as HTMLSelectElement).value)">
      <option value="" disabled>Choose who takes notes…</option>
      <option v-for="p in view.participants" :key="p.id" :value="p.id">{{ p.name }}{{ p.id === view.me.id ? ' (you)' : '' }}</option>
    </select>
  </label>
</template>

<style scoped>
.scribe-pick { display: inline-flex; align-items: center; gap: var(--s3); }
.scribe-pick select { width: auto; min-width: 220px; height: 32px; padding-top: 4px; padding-bottom: 4px; font-size: var(--t-sm); }
</style>
