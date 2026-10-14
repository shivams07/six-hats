<script setup lang="ts">
withDefaults(defineProps<{ marked?: boolean; size?: number }>(), { marked: false, size: 16 });
</script>

<template>
  <svg class="ink-mark" :class="{ marked }" :width="size" :height="size" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1.75" y="1.75" width="12.5" height="12.5" fill="none" stroke="currentColor" stroke-width="1.5" />
    <path class="cross" d="M3.6 3.9 L12.5 12.3 M12.3 3.5 L3.9 12.5" fill="none" stroke="var(--violet)" stroke-width="2.4" stroke-linecap="round" />
  </svg>
</template>

<style scoped>
.ink-mark { flex: none; }
.cross { stroke-dasharray: 26; stroke-dashoffset: 26; transition: stroke-dashoffset 240ms var(--ease-out); }
.marked .cross { stroke-dashoffset: 0; }
</style>
