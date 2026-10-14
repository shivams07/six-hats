<script setup lang="ts">
import type { View, ViewPoint } from '@shared/protocol';
import { creditOf } from '../points';
import HatBadge from './HatBadge.vue';

defineProps<{ points: ViewPoint[]; view: View }>();
</script>

<template>
  <ol v-if="points.length" class="ranked">
    <li v-for="p in points" :key="p.id">
      <span class="votes">{{ p.votes }} vote{{ p.votes === 1 ? '' : 's' }}</span>
      <HatBadge :hat="view.steps[p.stepIndex]!.hat" size="sm" />
      <span>{{ p.text }}</span>
      <span class="muted small">— {{ creditOf(view, p) }}</span>
    </li>
  </ol>
  <p v-else class="muted">No votes were cast.</p>
</template>
