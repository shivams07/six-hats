<script setup lang="ts">
import { computed } from 'vue';
import type { Command, View } from '@shared/protocol';
import { useCooldownGuard } from '../cooldown';
import { topVoted } from '../points';
import { useRun } from '../session-context';
import RankedList from './RankedList.vue';
import StepGroups from './StepGroups.vue';

const props = defineProps<{ view: View }>();
const run = useRun();
const all = computed(() => props.view.steps.map((_, i) => i));
const left = computed(() => props.view.votesPerPerson - props.view.myVotes.length);
const { pending, guarded } = useCooldownGuard();

const act = (cmd: Command) => guarded(() => run(cmd));
</script>

<template>
  <section class="card stack">
    <div class="row between wrap">
      <h2>{{ view.votingClosed ? 'Voting results' : 'Vote for the points that matter most' }}</h2>
      <div v-if="view.me.isFacilitator" class="row wrap">
        <template v-if="!view.votingClosed">
          <button class="btn btn-primary" :disabled="pending" @click="act({ type: 'closeVoting' })">Close voting</button>
          <button class="btn btn-ghost" :disabled="pending" @click="act({ type: 'skipVoting' })">Skip voting</button>
        </template>
        <button v-else class="btn btn-primary" :disabled="pending" @click="act({ type: 'goToDecision' })">Go to decision</button>
      </div>
    </div>
    <p v-if="!view.votingClosed" class="muted">
      You have {{ left }} of {{ view.votesPerPerson }} votes left. Totals stay hidden until the facilitator closes voting.
    </p>
    <RankedList v-else :points="topVoted(view)" :view="view" />
  </section>
  <StepGroups v-if="!view.votingClosed" :view="view" :indices="all" open voting />
</template>
