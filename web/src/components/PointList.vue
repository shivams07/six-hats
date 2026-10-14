<script setup lang="ts">
import { computed, ref } from 'vue';
import { LIMITS } from '@shared/hats';
import type { View, ViewPoint } from '@shared/protocol';
import { creditOf } from '../points';
import { useRun } from '../session-context';

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
const myVotes = computed(() => new Set(props.view.myVotes));
const votesLeft = computed(() => props.view.votesPerPerson - props.view.myVotes.length);

const isMine = (p: ViewPoint) => p.authorId === props.view.me.id;
// `editable` is only passed to whoever may write this step: each author, or the scribe for every note.
const canEdit = (p: ViewPoint) => Boolean(props.editable) && (props.view.mode === 'scribe' || isMine(p));
const canDelete = (p: ViewPoint) => props.view.status === 'running' && (props.view.me.isFacilitator || canEdit(p));

function startEdit(p: ViewPoint) {
  editingId.value = p.id;
  editText.value = p.text;
}

async function saveEdit(p: ViewPoint) {
  const ok = await run({ type: 'editPoint', pointId: p.id, text: editText.value, ...(p.saidById ? { saidBy: p.saidById } : {}) });
  if (ok) editingId.value = null;
}

async function remove(p: ViewPoint) {
  if (confirm('Delete this point?')) await run({ type: 'deletePoint', pointId: p.id });
}

function toggleVote(p: ViewPoint) {
  if (myVotes.value.has(p.id)) void run({ type: 'unvote', pointId: p.id });
  else void run({ type: 'vote', pointId: p.id });
}
</script>

<template>
  <p v-if="!points.length" class="muted">{{ emptyText ?? 'No points.' }}</p>
  <ul v-else class="points">
    <li v-for="p in points" :key="p.id" class="point">
      <form v-if="editingId === p.id" class="stack tight" @submit.prevent="saveEdit(p)">
        <label class="sr-only" :for="`edit-${p.id}`">Edit point</label>
        <textarea :id="`edit-${p.id}`" v-model="editText" rows="2" :maxlength="LIMITS.point" />
        <div class="row">
          <button class="btn btn-small btn-primary">Save</button>
          <button type="button" class="btn btn-small btn-ghost" @click="editingId = null">Cancel</button>
        </div>
      </form>
      <template v-else>
        <p class="point-text">{{ p.text }}</p>
        <div class="row between wrap small">
          <span class="muted">— {{ creditOf(view, p) }}</span>
          <div class="row wrap">
            <span v-if="showVotes && p.votes !== undefined" class="votes">{{ p.votes }} vote{{ p.votes === 1 ? '' : 's' }}</span>
            <button
              v-if="voting"
              class="btn btn-small"
              :class="{ 'btn-primary': myVotes.has(p.id) }"
              :aria-pressed="myVotes.has(p.id)"
              :disabled="!myVotes.has(p.id) && votesLeft <= 0"
              @click="toggleVote(p)"
            >
              {{ myVotes.has(p.id) ? '● Voted' : '○ Vote' }}
            </button>
            <button v-if="canEdit(p)" class="btn btn-small btn-ghost" @click="startEdit(p)">Edit</button>
            <button v-if="canDelete(p)" class="btn btn-small btn-ghost" @click="remove(p)">Delete</button>
          </div>
        </div>
      </template>
    </li>
  </ul>
</template>
