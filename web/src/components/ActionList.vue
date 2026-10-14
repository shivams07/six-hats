<script setup lang="ts">
import { X } from 'lucide-vue-next';
import type { ActionItem } from '@shared/protocol';
import { useCooldownGuard } from '../cooldown';
import { useRun } from '../session-context';

defineProps<{ actions: ActionItem[]; removable?: boolean }>();
const run = useRun();
const { pending, guarded } = useCooldownGuard();
</script>

<template>
  <ul v-if="actions.length" class="actions">
    <li v-for="a in actions" :key="a.id">
      <span class="box" aria-hidden="true"></span>
      <span class="text">{{ a.text }}</span>
      <span class="who">
        <span v-if="a.owner" class="chip chip-ink">{{ a.owner }}</span>
        <span v-if="a.due" class="due mute small">Due {{ a.due }}</span>
      </span>
      <button
        v-if="removable"
        class="btn btn-sm btn-quiet btn-icon"
        :aria-label="`Remove “${a.text}”`"
        :disabled="pending"
        @click="guarded(() => run({ type: 'removeAction', actionId: a.id }))"
      >
        <X aria-hidden="true" />
      </button>
    </li>
  </ul>
  <p v-else class="none mute">No action items yet. A decision lands better with an owner and a date.</p>
</template>

<style scoped>
.actions { border-top: 1px solid var(--ink); }
li { display: flex; align-items: center; gap: var(--s3); min-height: 48px; padding: var(--s2) 0; border-bottom: 1px solid var(--rule); }
.box { width: 14px; height: 14px; border: 1.5px solid var(--ink); flex: none; }
.text { font-weight: 560; min-width: 0; overflow-wrap: anywhere; }
.who { margin-left: auto; display: inline-flex; align-items: center; gap: var(--s2); flex-wrap: wrap; justify-content: flex-end; }
.due { white-space: nowrap; }
.none { font-size: var(--t-sm); }
</style>
