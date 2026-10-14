<script setup lang="ts">
import { HATS, formatDuration, type FlowStep } from '@shared/hats';
import HatBadge from './HatBadge.vue';

defineProps<{ steps: FlowStep[] }>();
</script>

<template>
  <ol class="outline">
    <li v-for="(s, i) in steps" :key="i">
      <span class="n mute">{{ i + 1 }}</span>
      <HatBadge :hat="s.hat" size="sm" short />
      <span class="prompt">{{ s.prompt ?? HATS[s.hat].prompt }}</span>
      <span class="t">{{ formatDuration(s.durationSec) }}</span>
    </li>
  </ol>
</template>

<style scoped>
li { display: grid; grid-template-columns: 2ch auto minmax(0, 1fr) auto; gap: var(--s3); align-items: center; padding: var(--s3) var(--s5); border-bottom: 1px solid var(--rule); }
li:last-child { border-bottom: 0; }
.n { font-size: var(--t-xs); font-weight: 700; font-stretch: 80%; }
.prompt { font-size: var(--t-sm); }
.t { font-size: var(--t-sm); font-weight: 650; font-stretch: 85%; }
@media (max-width: 560px) {
  li { grid-template-columns: 2ch auto minmax(0, 1fr); padding: var(--s3) var(--s4); }
  .prompt { grid-column: 2 / -1; grid-row: 2; }
  .t { grid-column: 3; grid-row: 1; justify-self: end; }
}
</style>
