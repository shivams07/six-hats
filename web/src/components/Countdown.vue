<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { formatDuration } from '@shared/hats';
import type { StepPhase } from '@shared/protocol';

const props = defineProps<{ endsAt?: number; remainingMs?: number; phase: StepPhase | null; offset: number }>();

const now = ref(Date.now());
const tick = setInterval(() => {
  now.value = Date.now();
}, 250);
onBeforeUnmount(() => clearInterval(tick));

const ms = computed(() => {
  if (props.phase === 'paused') return props.remainingMs ?? 0;
  if (props.phase === 'writing' && props.endsAt) return Math.max(0, props.endsAt - (now.value + props.offset));
  return 0;
});

const label = computed(() => {
  if (props.phase === 'revealed') return 'Revealed';
  if (props.phase === 'writing' && ms.value === 0) return "Time's up";
  return formatDuration(Math.ceil(ms.value / 1000));
});
</script>

<template>
  <div class="countdown" :class="{ urgent: phase === 'writing' && ms <= 10_000 }" role="timer">
    <span class="countdown-value">{{ label }}</span>
    <span v-if="phase === 'paused'" class="muted small">Paused</span>
  </div>
</template>
