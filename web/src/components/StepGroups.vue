<script setup lang="ts">
import { HATS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { pointsForStep } from '../points';
import HatBadge from './HatBadge.vue';
import PointList from './PointList.vue';

defineProps<{ view: View; indices: number[]; title?: string; open?: boolean; voting?: boolean; showVotes?: boolean }>();
</script>

<template>
  <section v-if="indices.length" class="card stack">
    <h2 v-if="title" class="h3">{{ title }}</h2>
    <details v-for="i in indices" :key="i" class="step-group" :open="open">
      <summary>
        <HatBadge :hat="view.steps[i]!.hat" size="sm" />
        <span>Step {{ i + 1 }} · {{ view.steps[i]!.prompt ?? HATS[view.steps[i]!.hat].prompt }}</span>
        <span class="muted">({{ pointsForStep(view, i).length }})</span>
      </summary>
      <PointList :points="pointsForStep(view, i)" :view="view" :voting="voting" :show-votes="showVotes" />
    </details>
  </section>
</template>
