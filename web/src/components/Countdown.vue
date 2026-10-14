<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { formatDuration } from '@shared/hats';
import type { StepPhase } from '@shared/protocol';

const props = defineProps<{ endsAt?: number; remainingMs?: number; durationMs: number; phase: StepPhase | null; offset: number }>();

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

const number = computed(() => formatDuration(Math.ceil(ms.value / 1000)));
const caption = computed(() => {
  if (props.phase === 'revealed') return 'Revealed';
  if (props.phase === 'paused') return 'Paused';
  return ms.value === 0 ? "Time's up" : 'until the reveal';
});
const fraction = computed(() => Math.min(1, Math.max(0, ms.value / Math.max(1, props.durationMs))));
const urgent = computed(() => props.phase === 'writing' && ms.value > 0 && ms.value <= 10_000);
</script>

<template>
  <div class="clock" :class="{ urgent, spent: phase === 'revealed', paused: phase === 'paused' }" role="timer" :aria-label="`${number} ${caption}`">
    <span class="clock-n" aria-hidden="true">{{ number }}</span>
    <span class="clock-cap" aria-hidden="true">{{ caption }}</span>
    <span class="clock-rule" aria-hidden="true"><i :style="{ transform: `scaleX(${fraction})` }"></i></span>
  </div>
</template>

<style scoped>
.clock { display: flex; flex-direction: column; align-items: flex-end; gap: var(--s1); }
.clock-n { font-size: var(--t-clock); font-weight: 720; font-stretch: 78%; line-height: 0.9; letter-spacing: -0.02em; }
.clock-cap { font-size: var(--t-sm); font-weight: 600; color: var(--mute); }
.clock-rule { display: block; width: 100%; height: 4px; background: var(--rule); margin-top: var(--s2); }
.clock-rule i { display: block; height: 100%; background: var(--violet); transform-origin: left center; transition: transform 250ms linear; }
.urgent .clock-n { color: var(--violet); }
.paused .clock-n { color: var(--mute); }
.spent .clock-n { color: var(--mute); text-decoration: line-through; text-decoration-thickness: 4px; text-decoration-color: var(--violet); }
.spent .clock-cap { color: var(--violet); }
@media (max-width: 720px) {
  .clock { align-items: flex-start; }
  .clock-n { font-size: 4rem; }
}
</style>
