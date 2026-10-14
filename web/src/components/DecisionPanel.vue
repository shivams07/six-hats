<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { Lock, Plus } from 'lucide-vue-next';
import { LIMITS } from '@shared/hats';
import type { View } from '@shared/protocol';
import { useCooldownGuard } from '../cooldown';
import { topVoted } from '../points';
import { useRun } from '../session-context';
import ActionList from './ActionList.vue';
import RankedList from './RankedList.vue';

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
const { pending, guarded } = useCooldownGuard();

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
    if (!confirm('Close the session? Everyone sees the final result and nothing can change after this.')) return;
    if (dirty.value && !(await run({ type: 'setDecision', text: draft.value }))) return;
    await run({ type: 'closeSession' });
  });
</script>

<template>
  <section class="decide frame">
    <div class="decide-body">
      <div class="section-head">
        <h2>Decision</h2>
        <span v-if="view.me.isFacilitator" class="small" :class="dirty ? 'unsaved' : 'mute'" role="status">{{ dirty ? 'Unsaved' : view.decision ? 'Saved' : '' }}</span>
      </div>
      <template v-if="view.me.isFacilitator">
        <label class="sr-only" for="decision">What did the team decide?</label>
        <textarea
          id="decision"
          v-model="draft"
          rows="4"
          :maxlength="LIMITS.decision"
          placeholder="What did the team decide, and why?"
          @focus="focused = true"
          @blur="focused = false"
        />
        <div class="row"><button class="btn btn-sm" :disabled="!dirty" @click="saveDecision">Save decision</button></div>
      </template>
      <p v-else-if="view.decision" class="decision-text">{{ view.decision }}</p>
      <p v-else class="mute">{{ view.participants.find((p) => p.isFacilitator)?.name ?? 'The host' }} is writing up the decision…</p>
    </div>

    <div class="decide-actions">
      <div class="section-head"><h2>Action items</h2><span class="mute small">{{ view.actions.length || '' }}</span></div>
      <ActionList :actions="view.actions" :removable="view.me.isFacilitator" />
      <form v-if="view.me.isFacilitator" class="add" @submit.prevent="addAction">
        <label class="sr-only" for="action-text">Action</label>
        <input id="action-text" v-model="action.text" :maxlength="LIMITS.actionText" placeholder="What needs doing?" required />
        <label class="sr-only" for="action-owner">Owner</label>
        <input id="action-owner" v-model="action.owner" :maxlength="LIMITS.actionOwner" placeholder="Owner" />
        <label class="sr-only" for="action-due">Due date</label>
        <input id="action-due" v-model="action.due" type="date" />
        <button class="btn" :disabled="pending"><Plus aria-hidden="true" /> Add</button>
      </form>
    </div>

    <div v-if="view.me.isFacilitator" class="decide-foot">
      <span class="mute small">Closing locks the result for everyone and saves it to the archive.</span>
      <button class="btn btn-primary" :disabled="pending" @click="closeSession"><Lock aria-hidden="true" /> Close session</button>
    </div>
  </section>

  <section v-if="ranked.length" class="top sheet">
    <div class="section-head top-head"><h2>Top voted</h2></div>
    <RankedList :points="ranked" :view="view" />
  </section>
</template>

<style scoped>
.decide { display: flex; flex-direction: column; }
.decide-body, .decide-actions { display: flex; flex-direction: column; gap: var(--s3); padding: var(--s5); }
.decide-actions { border-top: 1px solid var(--rule); }
.decision-text { font-size: var(--t-xl); font-weight: 560; line-height: 1.35; white-space: pre-wrap; max-width: 60ch; }
.unsaved { color: var(--warn); font-weight: 650; }
.add { display: grid; grid-template-columns: minmax(0, 1fr) 180px 170px auto; gap: var(--s2); }
.decide-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); flex-wrap: wrap; padding: var(--s3) var(--s4); border-top: 1px solid var(--ink); background: var(--paper); }
.top-head { padding: var(--s4) var(--s5) var(--s3); border-bottom: 1px solid var(--ink); }
@media (max-width: 760px) {
  .add { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .add > input:first-of-type { grid-column: 1 / -1; }
  .add .btn { grid-column: 1 / -1; }
}
</style>
