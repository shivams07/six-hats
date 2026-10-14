<script setup lang="ts">
import { ref } from 'vue';
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
  <form class="stack tight" @submit.prevent="submit">
    <label v-if="speakers" class="row wrap">
      <span>Said by</span>
      <select v-model="saidBy" style="width: auto">
        <option value="">Team</option>
        <option v-for="p in speakers" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
    </label>
    <label class="sr-only" for="point-input">Add a point</label>
    <textarea
      id="point-input"
      v-model="text"
      rows="2"
      :maxlength="LIMITS.point"
      :readonly="locked"
      :placeholder="locked ? 'Writing is locked for this step' : 'Add a point… (Enter to add, Shift+Enter for a new line)'"
      @keydown.enter.exact="onEnter"
    />
    <div class="row between">
      <span class="muted small">{{ text.length }}/{{ LIMITS.point }}</span>
      <button class="btn btn-primary" :disabled="locked || busy || !text.trim()">Add point</button>
    </div>
  </form>
</template>
