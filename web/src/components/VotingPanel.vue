<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight } from 'lucide-vue-next';
import type { Command, View } from '@shared/protocol';
import { useCooldownGuard } from '../cooldown';
import { topVoted } from '../points';
import { useRun } from '../session-context';
import InkMark from './InkMark.vue';
import RankedList from './RankedList.vue';
import StepGroups from './StepGroups.vue';

const props = defineProps<{ view: View }>();
const run = useRun();
const all = computed(() => props.view.steps.map((_, i) => i));
const left = computed(() => props.view.votesPerPerson - props.view.myVotes.length);
const { pending, guarded } = useCooldownGuard();

const act = (cmd: Command) => guarded(() => run(cmd));

const skipVoting = () =>
  guarded(async () => {
    if (!confirm("Skip voting? Everyone's votes will be discarded.")) return;
    await run({ type: 'skipVoting' });
  });
</script>

<template>
  <section class="vote frame">
    <div class="vote-head">
      <div class="vote-title">
        <h2>{{ view.votingClosed ? 'The count' : 'Vote for what matters most' }}</h2>
        <p class="mute">
          {{ view.votingClosed ? 'Points ranked by votes.' : 'Totals stay hidden until the host closes voting, so vote for what you think, not what others picked.' }}
        </p>
      </div>
      <div v-if="!view.votingClosed" class="ink-left" role="status">
        <span class="marks" aria-hidden="true">
          <InkMark v-for="n in view.votesPerPerson" :key="n" :marked="n <= view.myVotes.length" :size="20" />
        </span>
        <span class="small"><b>{{ left }}</b> of {{ view.votesPerPerson }} votes left</span>
      </div>
    </div>
    <div v-if="view.me.isFacilitator" class="vote-foot">
      <template v-if="!view.votingClosed">
        <button class="btn btn-sm btn-quiet" :disabled="pending" @click="skipVoting">Skip voting</button>
        <button class="btn btn-sm btn-primary" :disabled="pending" @click="act({ type: 'closeVoting' })">Close voting and count</button>
      </template>
      <button v-else class="btn btn-sm btn-primary" :disabled="pending" @click="act({ type: 'goToDecision' })">Go to decision <ArrowRight aria-hidden="true" /></button>
    </div>
    <div v-if="view.votingClosed" class="vote-results"><RankedList :points="topVoted(view)" :view="view" /></div>
  </section>
  <StepGroups v-if="!view.votingClosed" :view="view" :indices="all" title="Every point" open voting />
</template>

<style scoped>
.vote { display: flex; flex-direction: column; }
.vote-head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--s5); flex-wrap: wrap; padding: var(--s5); }
.vote-title { display: flex; flex-direction: column; gap: var(--s2); max-width: 60ch; }
.ink-left { display: flex; flex-direction: column; align-items: flex-end; gap: var(--s2); }
.marks { display: inline-flex; gap: 6px; color: var(--ink); }
.vote-foot { display: flex; justify-content: flex-end; gap: var(--s2); flex-wrap: wrap; padding: var(--s3) var(--s4); border-top: 1px solid var(--ink); background: var(--paper); }
.vote-results { border-top: 1px solid var(--ink); }
@media (max-width: 560px) {
  .ink-left { align-items: flex-start; }
}
</style>
