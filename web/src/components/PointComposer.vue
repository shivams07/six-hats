<script setup lang="ts">
import { ref } from 'vue';
import { Stamp } from 'lucide-vue-next';
import { LIMITS } from '@shared/hats';
import type { ViewParticipant } from '@shared/protocol';
import { useRun } from '../session-context';

/** `speakers` is set in scribe mode: the scribe credits each note to one of them, or to the team. */
const props = defineProps<{ locked: boolean; speakers?: ViewParticipant[] }>();
const run = useRun();
const text = ref('');
const saidBy = ref('');
const busy = ref(false);

async function submit() {
  if (props.locked || busy.value || !text.value.trim()) return;
  busy.value = true;
  const sent = text.value;
  const sentSaidBy = saidBy.value;
  const ok = await run({ type: 'addPoint', text: sent, ...(props.speakers && sentSaidBy ? { saidBy: sentSaidBy } : {}) });
  if (ok) {
    if (text.value === sent) text.value = '';
    if (saidBy.value === sentSaidBy) saidBy.value = '';
  }
  busy.value = false;
}

function onEnter(e: KeyboardEvent) {
  if (e.isComposing || e.keyCode === 229) return;
  e.preventDefault();
  submit();
}
</script>

<template>
  <form class="composer" :class="{ locked }" @submit.prevent="submit">
    <label v-if="speakers" class="said-by">
      <span class="label">Said by</span>
      <select v-model="saidBy" :disabled="locked">
        <option value="">Team</option>
        <option v-for="p in speakers" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </label>
    <label class="sr-only" for="point-input">{{ speakers ? 'Add a note' : 'Add a point' }}</label>
    <textarea
      id="point-input"
      v-model="text"
      rows="3"
      :maxlength="LIMITS.point"
      :readonly="locked"
      :placeholder="locked ? 'Writing is closed for this hat.' : speakers ? 'Capture the point someone just made…' : 'One point at a time…'"
      @keydown.enter.exact="onEnter"
    />
    <div class="composer-foot">
      <span class="mute small">{{ locked ? '' : 'Enter adds it · Shift+Enter for a new line' }}</span>
      <span class="count mute small" :class="{ near: text.length > LIMITS.point - 50 }">{{ text.length }}/{{ LIMITS.point }}</span>
      <button class="btn btn-primary" :disabled="locked || busy || !text.trim()"><Stamp aria-hidden="true" /> {{ speakers ? 'Add note' : 'Seal point' }}</button>
    </div>
  </form>
</template>

<style scoped>
.composer { display: flex; flex-direction: column; background: var(--sheet); border: 1px solid var(--ink); }
.composer textarea { border: 0; border-bottom: 1px solid var(--rule); padding: var(--s4); min-height: 96px; font-size: var(--t-lg); }
.composer textarea:focus-visible { box-shadow: inset 0 0 0 2px var(--violet); }
.said-by { display: flex; align-items: center; gap: var(--s3); padding: var(--s3) var(--s4); border-bottom: 1px solid var(--rule); }
.said-by select { width: auto; min-width: 200px; height: 32px; padding-top: 4px; padding-bottom: 4px; font-size: var(--t-sm); }
.composer-foot { display: flex; align-items: center; gap: var(--s4); padding: var(--s3) var(--s3) var(--s3) var(--s4); }
.composer-foot .count { margin-left: auto; }
.count.near { color: var(--warn); }
.locked { border-color: var(--rule-strong); }
.locked textarea { background: var(--paper); }
@media (max-width: 560px) {
  .composer-foot > span:first-child { display: none; }
}
</style>
