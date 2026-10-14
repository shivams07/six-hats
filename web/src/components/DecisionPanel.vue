<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { LIMITS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { topVoted } from '../points';
import { useRun } from '../session-context';
import ActionList from './ActionList.vue';
import RankedList from './RankedList.vue';

const COOLDOWN_MS = 500;

const props = defineProps<{ view: View }>();
const run = useRun();

const draft = ref(props.view.decision);
const focused = ref(false);
watch(
  () => props.view.decision,
  (decision) => {
    if (!focused.value) draft.value = decision;
  },
);
const dirty = computed(() => draft.value.trim() !== props.view.decision);
const ranked = computed(() => topVoted(props.view));
const action = reactive({ text: '', owner: '', due: '' });
const pending = ref(false);
let cooldown: ReturnType<typeof setTimeout> | undefined;

async function guarded(fn: () => Promise<void>) {
  if (pending.value) return;
  pending.value = true;
  try {
    await fn();
  } finally {
    cooldown = setTimeout(() => {
      pending.value = false;
    }, COOLDOWN_MS);
  }
}

async function saveDecision() {
  await run({ type: 'setDecision', text: draft.value });
}

const addAction = () =>
  guarded(async () => {
    const ok = await run({ type: 'addAction', action: { text: action.text, owner: action.owner, ...(action.due ? { due: action.due } : {}) } });
    if (ok) Object.assign(action, { text: '', owner: '', due: '' });
  });

const closeSession = () =>
  guarded(async () => {
    if (!confirm('Close the session? Everyone will see the final summary and it becomes read-only.')) return;
    if (dirty.value && !(await run({ type: 'setDecision', text: draft.value }))) return;
    await run({ type: 'closeSession' });
  });

onBeforeUnmount(() => clearTimeout(cooldown));
</script>

<template>
  <section class="card stack">
    <div class="row between wrap">
      <h2>Decision</h2>
      <button v-if="view.me.isFacilitator" class="btn btn-primary" :disabled="pending" @click="closeSession">Close session</button>
    </div>

    <template v-if="view.me.isFacilitator">
      <label class="field">
        <span>What did we decide?</span>
        <textarea v-model="draft" rows="4" :maxlength="LIMITS.decision" @focus="focused = true" @blur="focused = false" />
      </label>
      <div class="row">
        <button class="btn" :disabled="!dirty" @click="saveDecision">Save decision</button>
        <span v-if="dirty" class="muted small">Unsaved changes</span>
      </div>
    </template>
    <p v-else-if="view.decision" class="decision">{{ view.decision }}</p>
    <p v-else class="muted">The facilitator is writing up the decision…</p>

    <h3>Action items</h3>
    <ActionList :actions="view.actions" :removable="view.me.isFacilitator" />
    <form v-if="view.me.isFacilitator" class="row wrap" @submit.prevent="addAction">
      <label class="sr-only" for="action-text">Action</label>
      <input id="action-text" v-model="action.text" class="grow" :maxlength="LIMITS.actionText" placeholder="What needs doing?" required />
      <label class="sr-only" for="action-owner">Owner</label>
      <input id="action-owner" v-model="action.owner" :maxlength="LIMITS.actionOwner" placeholder="Owner" style="width: 140px" />
      <label class="sr-only" for="action-due">Due date</label>
      <input id="action-due" v-model="action.due" type="date" style="width: 170px" />
      <button class="btn" :disabled="pending">Add</button>
    </form>
  </section>

  <section v-if="ranked.length" class="card stack">
    <h2 class="h3">Top voted</h2>
    <RankedList :points="ranked" :view="view" />
  </section>
</template>
