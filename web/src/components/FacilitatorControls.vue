<script setup lang="ts">
import { computed } from 'vue';
import { ArrowRight, Eye, Pause, Play, Plus, SkipForward } from 'lucide-vue-next';
import type { Command, View } from '@shared/protocol';
import { canWrite } from '@shared/rules';
import { useCooldownGuard } from '../cooldown';
import { useRun } from '../session-context';

const props = defineProps<{ view: View }>();
const run = useRun();
const writable = computed(() => canWrite(props.view));
const isLast = computed(() => props.view.currentStep >= props.view.steps.length - 1);
const { pending, guarded } = useCooldownGuard();

const act = (cmd: Command) => guarded(() => run(cmd));
</script>

<template>
  <div class="controls" role="group" aria-label="Facilitator controls">
    <template v-if="writable">
      <button v-if="view.phase === 'writing'" class="btn btn-sm" :disabled="pending" @click="act({ type: 'pause' })"><Pause aria-hidden="true" /> Pause</button>
      <button v-else class="btn btn-sm" :disabled="pending" @click="act({ type: 'resume' })"><Play aria-hidden="true" /> Resume</button>
      <button class="btn btn-sm" :disabled="pending" aria-label="Add one minute" @click="act({ type: 'addTime' })"><Plus aria-hidden="true" /> 1 min</button>
      <button class="btn btn-sm btn-primary" :disabled="pending" @click="act({ type: 'revealNow' })"><Eye aria-hidden="true" /> Reveal now</button>
      <button class="btn btn-sm btn-quiet" :disabled="pending" @click="act({ type: 'skipStep' })"><SkipForward aria-hidden="true" /> Skip hat</button>
    </template>
    <button v-else class="btn btn-sm btn-primary" :disabled="pending" @click="act({ type: 'nextStep' })">
      {{ isLast ? 'Go to voting' : 'Next hat' }} <ArrowRight aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.controls { display: flex; flex-wrap: wrap; gap: var(--s2); }
</style>
