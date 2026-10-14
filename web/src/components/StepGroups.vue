<script setup lang="ts">
import { HATS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { pointsForStep } from '../points';
import HatBadge from './HatBadge.vue';
import PointList from './PointList.vue';
import Tally from './Tally.vue';

defineProps<{ view: View; indices: number[]; title?: string; open?: boolean; voting?: boolean; showVotes?: boolean }>();
</script>

<template>
  <section v-if="indices.length" class="groups">
    <h2 v-if="title">{{ title }}</h2>
    <div class="list sheet">
      <details v-for="i in indices" :key="i" class="group" :open="open">
        <summary>
          <span class="chev" aria-hidden="true"></span>
          <span class="n mute">{{ i + 1 }}</span>
          <HatBadge :hat="view.steps[i]!.hat" size="sm" short />
          <span class="prompt">{{ view.steps[i]!.prompt ?? HATS[view.steps[i]!.hat].prompt }}</span>
          <Tally class="tally-end" :count="pointsForStep(view, i).length" :label="`${pointsForStep(view, i).length} points`" />
        </summary>
        <div class="body">
          <PointList :points="pointsForStep(view, i)" :view="view" :voting="voting" :show-votes="showVotes" empty-text="No points under this hat." />
        </div>
      </details>
    </div>
  </section>
</template>

<style scoped>
.groups { display: flex; flex-direction: column; gap: var(--s3); }
.list { border-top: 1px solid var(--ink); }
.group { border-bottom: 1px solid var(--rule); }
.group:last-child { border-bottom: 0; }
summary { display: flex; align-items: center; gap: var(--s3); padding: var(--s3) var(--s4); cursor: pointer; list-style: none; min-height: 52px; }
summary::-webkit-details-marker { display: none; }
summary:hover { background: var(--hover); }
.chev { width: 7px; height: 7px; border-right: 2px solid var(--ink); border-bottom: 2px solid var(--ink); transform: rotate(-45deg); transition: transform 150ms; flex: none; }
details[open] .chev { transform: rotate(45deg); }
.n { font-size: var(--t-xs); font-weight: 700; font-stretch: 80%; min-width: 2ch; }
.prompt { font-size: var(--t-sm); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tally-end { margin-left: auto; flex: none; }
.body { padding: 0 var(--s4) var(--s4); }
@media (max-width: 560px) {
  .prompt { display: none; }
}
</style>
