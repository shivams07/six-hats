<script setup lang="ts">
import type { ActionItem } from '@shared/protocol';
import { useRun } from '../session-context';

defineProps<{ actions: ActionItem[]; removable?: boolean }>();
const run = useRun();
</script>

<template>
  <ul v-if="actions.length" class="actions">
    <li v-for="a in actions" :key="a.id">
      <span>☐ {{ a.text }}</span>
      <span v-if="a.owner" class="tag">{{ a.owner }}</span>
      <span v-if="a.due" class="muted small">due {{ a.due }}</span>
      <button v-if="removable" class="btn btn-small btn-ghost" :aria-label="`Remove ${a.text}`" @click="run({ type: 'removeAction', actionId: a.id })">✕</button>
    </li>
  </ul>
  <p v-else class="muted">No action items yet.</p>
</template>
