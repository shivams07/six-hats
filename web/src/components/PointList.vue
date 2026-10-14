<script setup lang="ts">
import { computed, ref } from 'vue';
import { Lock, Pencil, Trash2 } from 'lucide-vue-next';
import { LIMITS } from '@shared/hats';
import type { View, ViewPoint } from '@shared/protocol';
import { creditOf } from '../points';
import { useRun } from '../session-context';
import InkMark from './InkMark.vue';
import Tally from './Tally.vue';

const props = defineProps<{
  points: ViewPoint[];
  view: View;
  editable?: boolean;
  voting?: boolean;
  showVotes?: boolean;
  emptyText?: string;
}>();
const run = useRun();

const editingId = ref<string | null>(null);
const editText = ref('');
const confirmingId = ref<string | null>(null);
const myVotes = computed(() => new Set(props.view.myVotes));
const votesLeft = computed(() => props.view.votesPerPerson - props.view.myVotes.length);

const isMine = (p: ViewPoint) => p.authorId === props.view.me.id;
// `editable` is only passed to whoever may write this step: each author, or the scribe for every note.
const canEdit = (p: ViewPoint) => Boolean(props.editable) && (props.view.mode === 'scribe' || isMine(p));
const canDelete = (p: ViewPoint) => props.view.status === 'running' && (props.view.me.isFacilitator || canEdit(p));
const isSealed = (p: ViewPoint) =>
  props.view.mode === 'everyone' && props.view.status === 'running' && props.view.phase !== 'revealed' && p.stepIndex === props.view.currentStep;
const short = (text: string) => (text.length > 40 ? `${text.slice(0, 40)}…` : text);

function startEdit(p: ViewPoint) {
  confirmingId.value = null;
  editingId.value = p.id;
  editText.value = p.text;
}

async function saveEdit(p: ViewPoint) {
  const ok = await run({ type: 'editPoint', pointId: p.id, text: editText.value, ...(p.saidById ? { saidBy: p.saidById } : {}) });
  if (ok) editingId.value = null;
}

async function remove(p: ViewPoint) {
  await run({ type: 'deletePoint', pointId: p.id });
  confirmingId.value = null;
}

function toggleVote(p: ViewPoint) {
  if (myVotes.value.has(p.id)) void run({ type: 'unvote', pointId: p.id });
  else void run({ type: 'vote', pointId: p.id });
}
</script>

<template>
  <p v-if="!points.length" class="empty mute">{{ emptyText ?? 'No points.' }}</p>
  <TransitionGroup v-else tag="ul" name="slip" class="slips">
    <li
      v-for="(p, i) in points"
      :key="p.id"
      class="slip"
      :class="{ sealed: isSealed(p), marked: voting && myVotes.has(p.id) }"
      :style="{ '--i': i }"
    >
      <form v-if="editingId === p.id" class="edit" @submit.prevent="saveEdit(p)">
        <label class="sr-only" :for="`edit-${p.id}`">Edit point</label>
        <textarea :id="`edit-${p.id}`" v-model="editText" rows="3" :maxlength="LIMITS.point" />
        <div class="row">
          <button class="btn btn-sm btn-primary">Save</button>
          <button type="button" class="btn btn-sm btn-quiet" @click="editingId = null">Cancel</button>
        </div>
      </form>
      <template v-else>
        <p class="slip-text">{{ p.text }}</p>
        <div v-if="confirmingId === p.id" class="confirm" role="group" :aria-label="`Delete “${short(p.text)}”?`">
          <span class="small confirm-q">{{ isSealed(p) ? 'Delete this point?' : 'Delete for everyone?' }}</span>
          <span class="actions">
            <button class="btn btn-sm btn-quiet" @click="confirmingId = null">Keep</button>
            <button class="btn btn-sm btn-danger" @click="remove(p)"><Trash2 aria-hidden="true" /> Delete</button>
          </span>
        </div>
        <div v-else class="slip-foot">
          <Transition name="seal-break">
            <span v-if="isSealed(p)" class="seal"><Lock :size="13" :stroke-width="2.25" aria-hidden="true" /> Sealed</span>
          </Transition>
          <Transition name="credit">
            <span v-if="!isSealed(p)" class="by">{{ creditOf(view, p) }}</span>
          </Transition>
          <Tally v-if="showVotes && p.votes !== undefined" :count="p.votes" :label="`${p.votes} votes`" />
          <span class="actions">
            <button
              v-if="voting"
              class="btn btn-sm mark"
              :class="{ on: myVotes.has(p.id) }"
              :aria-pressed="myVotes.has(p.id)"
              :disabled="!myVotes.has(p.id) && votesLeft <= 0"
              @click="toggleVote(p)"
            >
              <InkMark :marked="myVotes.has(p.id)" />{{ myVotes.has(p.id) ? 'Voted' : 'Vote' }}
            </button>
            <button v-if="canEdit(p)" class="btn btn-sm btn-quiet btn-icon" :aria-label="`Edit “${short(p.text)}”`" @click="startEdit(p)"><Pencil aria-hidden="true" /></button>
            <button v-if="canDelete(p)" class="btn btn-sm btn-quiet btn-icon" :aria-label="`Delete “${short(p.text)}”`" @click="confirmingId = p.id"><Trash2 aria-hidden="true" /></button>
          </span>
        </div>
      </template>
    </li>
  </TransitionGroup>
</template>

<style scoped>
.slips { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: var(--s2); }
.slip { display: flex; flex-direction: column; gap: var(--s3); padding: var(--s3) var(--s4); background: var(--sheet); border: 1px solid var(--rule); transition: border-color 280ms var(--ease-out), background-color 200ms; }
.slip-text { font-size: var(--t-md); white-space: pre-wrap; overflow-wrap: anywhere; }
.slip-foot, .confirm { display: flex; align-items: center; gap: var(--s3); margin-top: auto; min-height: 32px; }
.slip-foot { position: relative; }
.by { font-size: var(--t-sm); font-weight: 600; color: var(--mute); }
.actions { margin-left: auto; display: inline-flex; gap: var(--s1); }

/* Sealed: a solid violet hairline and a stamped seal. Dashed stays reserved for disabled controls. */
.slip.sealed { border-color: var(--violet-rule); }
.seal {
  display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px;
  border: 1.5px solid var(--violet); color: var(--violet);
  font-size: var(--t-xs); font-weight: 760; font-stretch: 82%; letter-spacing: 0.12em; text-transform: uppercase;
  transform: rotate(-2deg);
}
.slip.marked { border-color: var(--violet); background: var(--violet-wash); }
.mark { padding-left: var(--s2); }
.mark.on { border-color: var(--violet); color: var(--violet); background: var(--sheet); }
.edit { display: flex; flex-direction: column; gap: var(--s2); }
.confirm { flex-wrap: wrap; row-gap: var(--s2); padding: var(--s2) var(--s2) var(--s2) var(--s3); margin: 0 calc(var(--s2) * -1) calc(var(--s2) * -1); border: 1px solid var(--danger); background: var(--danger-wash); }
.confirm-q { white-space: nowrap; }
.empty { padding: var(--s5); border: 1px solid var(--rule); background: var(--sheet); text-align: center; }

/* The count, part one: your own seal breaks open when the hat is revealed. */
.seal-break-leave-active { transition: clip-path 280ms var(--ease-out), opacity 280ms var(--ease-out), transform 280ms var(--ease-out); position: absolute; }
.seal-break-leave-to { clip-path: inset(0 0 0 100%); opacity: 0; transform: rotate(-2deg) translateX(6px); }
.credit-enter-active { transition: opacity 220ms var(--ease-out) 120ms; }
.credit-enter-from { opacity: 0; }

/* The count, part two: everyone else's slips land in a short cascade. */
.slip-enter-from { opacity: 0; transform: translateY(6px); clip-path: inset(0 0 100% 0); }
.slip-enter-active { transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out), clip-path 280ms var(--ease-out); transition-delay: calc(min(var(--i), 15) * 40ms); }
.slip-leave-active { transition: opacity 150ms; }
.slip-leave-to { opacity: 0; }
</style>
