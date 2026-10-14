<script setup lang="ts">
import { Check, CircleAlert } from 'lucide-vue-next';
import { toasts } from '../toast';
</script>

<template>
  <div class="toasts" role="status" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">
      <CircleAlert v-if="t.kind === 'error'" aria-hidden="true" />
      <Check v-else aria-hidden="true" />
      <span>{{ t.message }}</span>
    </div>
  </div>
</template>
