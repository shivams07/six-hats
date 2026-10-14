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
  <label class="row wrap">
    <span>Scribe</span>
    <select :value="view.scribeId ?? ''" style="width: auto" @change="choose(($event.target as HTMLSelectElement).value)">
      <option value="" disabled>Choose a scribe…</option>
      <option v-for="p in view.participants" :key="p.id" :value="p.id">{{ p.name }}{{ p.id === view.me.id ? ' (you)' : '' }}</option>
    </select>
  </label>
</template>
