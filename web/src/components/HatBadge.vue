<script setup lang="ts">
import { HATS, type HatId } from '@shared/hats';

withDefaults(defineProps<{ hat: HatId; size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' });
</script>

<template>
  <span class="hat-badge" :class="[`hat-${hat}`, size]"><span aria-hidden="true">{{ HATS[hat].icon }}</span>{{ HATS[hat].name }}</span>
</template>
