<script setup lang="ts">
import { HATS, formatDuration, type FlowStep } from '@shared/hats';
import HatBadge from './HatBadge.vue';

defineProps<{ steps: FlowStep[] }>();
</script>

<template>
  <ol class="outline">
    <li v-for="(s, i) in steps" :key="i">
      <HatBadge :hat="s.hat" size="sm" />
      <span>{{ s.prompt ?? HATS[s.hat].prompt }}</span>
      <span class="muted small">{{ formatDuration(s.durationSec) }}</span>
    </li>
  </ol>
</template>
