<script setup lang="ts">
import type { View, ViewPoint } from '@shared/protocol';
import { creditOf } from '../points';
import HatBadge from './HatBadge.vue';
import Tally from './Tally.vue';

defineProps<{ points: ViewPoint[]; view: View }>();
</script>

<template>
  <ol v-if="points.length" class="ranked">
    <li v-for="(p, i) in points" :key="p.id">
      <span class="rank">{{ i + 1 }}</span>
      <div class="body">
        <p class="text">{{ p.text }}</p>
        <p class="meta mute small"><HatBadge :hat="view.steps[p.stepIndex]!.hat" size="sm" short /> {{ creditOf(view, p) }}</p>
      </div>
      <Tally :count="p.votes ?? 0" :label="`${p.votes ?? 0} votes`" />
    </li>
  </ol>
  <p v-else class="none mute">No votes were cast.</p>
</template>

<style scoped>
li { display: grid; grid-template-columns: 3ch minmax(0, 1fr) auto; gap: var(--s4); align-items: start; padding: var(--s4) var(--s5); border-bottom: 1px solid var(--rule); }
li:last-child { border-bottom: 0; }
li:first-child .rank { color: var(--violet); }
.rank { font-size: var(--t-xl); font-weight: 760; font-stretch: 80%; line-height: 1.1; text-align: right; }
.body { display: flex; flex-direction: column; gap: var(--s2); }
.text { font-size: var(--t-md); white-space: pre-wrap; overflow-wrap: anywhere; }
.meta { display: flex; align-items: center; gap: var(--s2); flex-wrap: wrap; }
.none { padding: var(--s5); }
@media (max-width: 560px) {
  li { padding: var(--s3) var(--s4); gap: var(--s3); }
}
</style>
