<script setup lang="ts">
import { HATS, type HatId } from '@shared/hats';
import HatIcon from './HatIcon.vue';

withDefaults(defineProps<{ hat: HatId; size?: 'sm' | 'md' | 'lg'; short?: boolean }>(), { size: 'md', short: false });
</script>

<template>
  <span class="hat-badge" :class="[`hat-${hat}`, size]"><HatIcon :hat="hat" />{{ short ? HATS[hat].label : HATS[hat].name }}</span>
</template>
