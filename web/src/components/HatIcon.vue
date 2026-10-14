<script setup lang="ts">
import { ClipboardList, Compass, Heart, Sprout, Sun, TriangleAlert } from 'lucide-vue-next';
import type { HatId } from '@shared/hats';

defineProps<{ hat: HatId; size?: number }>();

const ICONS = { white: ClipboardList, red: Heart, black: TriangleAlert, yellow: Sun, green: Sprout, blue: Compass } as const;
</script>

<template>
  <component :is="ICONS[hat]" :size="size ?? 16" :stroke-width="1.75" aria-hidden="true" />
</template>
